import { createAdminClient } from '@/lib/supabase/server'
import type { EnqueueInput } from './types'

// Inserts a row into notification_outbox.  Caller is expected to schedule
// drainOne(rowId) via Next.js after() so the message goes out immediately
// after the response flushes; the cron picks up anything that fell through.
//
// Returns the new outbox row id, or throws if the insert fails — callers
// should wrap this in try/catch in non-critical paths so a notification
// failure can't block reservation creation.
export async function enqueueNotification(input: EnqueueInput): Promise<number> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('notification_outbox')
    .insert({
      reservation_id: input.reservationId,
      channel: input.channel,
      kind: input.kind,
      to_address: input.toAddress,
      payload: input.payload,
    })
    .select('id')
    .single()

  if (error) throw new Error(`enqueueNotification failed: ${error.message}`)
  return data.id as number
}
