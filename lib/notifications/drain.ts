import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from './email'
import { sendSms } from './sms'
import {
  MAX_ATTEMPTS,
  RETRY_BACKOFF_SECONDS,
  type NotificationChannel,
  type NotificationKind,
  type NotificationPayload,
  type NotificationStatus,
  type SendResult,
} from './types'

type OutboxRow = {
  id: number
  reservation_id: number | null
  channel: NotificationChannel
  kind: NotificationKind
  to_address: string
  payload: NotificationPayload
  status: NotificationStatus
  attempts: number
}

// Drain a single outbox row by id.  Used by:
//   • after() callbacks immediately after enqueue (fast path, ~1s latency)
//   • The /api/cron/notification-outbox sweeper (safety net for orphans)
//
// The function is safe to call multiple times for the same id — providers
// receive an idempotency key so duplicate calls don't double-send.
//
// Atomicity: the row is locked at the start with status='sending' and a
// conditional UPDATE based on the previous status.  If two workers race,
// only one wins the UPDATE (rowcount=1), the other no-ops.
export async function drainOne(rowId: number): Promise<void> {
  const admin = createAdminClient()

  // Atomically claim the row: only proceed if status is still pending/failed.
  // The previous status check prevents two callers from sending twice.
  const { data: claimed, error: claimErr } = await admin
    .from('notification_outbox')
    .update({ status: 'sending' })
    .eq('id', rowId)
    .in('status', ['pending', 'failed'])
    .select('id, reservation_id, channel, kind, to_address, payload, status, attempts')
    .maybeSingle()

  if (claimErr) {
    console.error(`[outbox ${rowId}] claim failed:`, claimErr.message)
    return
  }
  if (!claimed) {
    // Already sent / locked by another worker / dead.  Nothing to do.
    return
  }

  const row = claimed as OutboxRow

  let result: SendResult
  try {
    result = row.channel === 'email'
      ? await sendEmail(row.to_address, row.kind, row.payload, row.id)
      : await sendSms(row.to_address, row.kind, row.payload, row.id)
  } catch (err) {
    // Defensive: provider adapters should never throw, but if they do,
    // treat as transient so we retry rather than losing the message.
    const message = err instanceof Error ? err.message : String(err)
    result = { ok: false, transient: true, error: message }
  }

  await applyResult(row, result)
}

async function applyResult(row: OutboxRow, result: SendResult): Promise<void> {
  const admin = createAdminClient()
  const nextAttempts = row.attempts + 1

  if (result.ok) {
    await admin
      .from('notification_outbox')
      .update({
        status: 'sent',
        attempts: nextAttempts,
        provider_id: result.providerId ?? null,
        sent_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', row.id)
    console.log(`[outbox ${row.id}] sent (${row.channel}/${row.kind}) attempt ${nextAttempts}`)
    return
  }

  // Non-transient error → mark dead, don't retry.  Examples: bad API key,
  // unverified domain, recipient on suppression list.  These won't fix
  // themselves; surfacing on the dashboard prompts staff to take action.
  if (!result.transient) {
    await admin
      .from('notification_outbox')
      .update({
        status: 'dead',
        attempts: nextAttempts,
        last_error: result.error,
      })
      .eq('id', row.id)
    console.error(`[outbox ${row.id}] dead (${row.channel}/${row.kind}): ${result.error}`)
    return
  }

  // Transient error → backoff + retry.  After MAX_ATTEMPTS we give up.
  if (nextAttempts >= MAX_ATTEMPTS) {
    await admin
      .from('notification_outbox')
      .update({
        status: 'dead',
        attempts: nextAttempts,
        last_error: `Exhausted retries: ${result.error}`,
      })
      .eq('id', row.id)
    console.error(`[outbox ${row.id}] dead after ${nextAttempts} attempts: ${result.error}`)
    return
  }

  const backoffSeconds = RETRY_BACKOFF_SECONDS[nextAttempts] ?? 3600
  const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000).toISOString()

  await admin
    .from('notification_outbox')
    .update({
      status: 'failed',
      attempts: nextAttempts,
      last_error: result.error,
      next_attempt_at: nextAttemptAt,
    })
    .eq('id', row.id)
  console.warn(`[outbox ${row.id}] failed attempt ${nextAttempts}, retrying in ${backoffSeconds}s: ${result.error}`)
}

// Drain a batch of due rows.  Called by the cron route every minute.
// SKIP LOCKED makes this safe to run concurrently.
export async function drainDue(limit = 50): Promise<{ drained: number }> {
  const admin = createAdminClient()

  // Pick up rows whose next_attempt_at has elapsed.  We don't use SELECT
  // FOR UPDATE here because postgrest doesn't expose row locking; instead,
  // drainOne uses a conditional UPDATE that's atomic per row.
  const { data: due, error } = await admin
    .from('notification_outbox')
    .select('id')
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .lt('attempts', MAX_ATTEMPTS)
    .order('next_attempt_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[outbox cron] select failed:', error.message)
    return { drained: 0 }
  }

  if (!due || due.length === 0) return { drained: 0 }

  // Run each drain serially.  Resend / SeeMe both have rate limits on the
  // order of 10/sec; 50 messages/min is well within that.  Parallel would
  // need a semaphore — not worth the complexity for low volume.
  let drained = 0
  for (const row of due) {
    try {
      await drainOne(row.id)
      drained++
    } catch (err) {
      console.error(`[outbox cron] drainOne(${row.id}) threw:`, err)
    }
  }

  return { drained }
}
