import { ok } from '@/lib/api/http'
import { checkCronAuth } from '@/lib/api/cronAuth'
import { createAdminClient } from '@/lib/supabase/server'

const BATCH_SIZE = 20

// 10s timeout per outbound provider call.  Without this a stalled upstream
// would pin the cron until the runtime kills it, blocking the rest of the
// batch.  Combined with SSRF host validation (private IPs / non-https URLs
// rejected at module load), this keeps the dispatcher boundary tight.
const FETCH_TIMEOUT_MS = 10_000

// Refuse to point at private networks or cloud metadata endpoints.  These
// are the classic SSRF targets when an env var is misconfigured to a
// localhost/link-local URL — once we're sending POSTs with our own bearer
// token, an attacker who controls FRUIT_API_URL gets free internal calls.
//
// Coverage:
//   IPv4: loopback (127/8, 0.0.0.0), link-local (169.254/16),
//         RFC1918 (10/8, 172.16-31/12, 192.168/16),
//         CGNAT (100.64.0.0/10), AWS/GCP metadata IPs.
//   IPv6: loopback (::1), unspecified (::), link-local (fe80::/10),
//         unique-local (fc00::/7), embedded IPv4-loopback (::ffff:127.0.0.1).
//   Names: localhost, *.internal, *.local — common k8s / mDNS suffixes.
function assertSafeHttpsUrl(raw: string, name: string): URL {
  const u = new URL(raw)
  if (u.protocol !== 'https:') {
    throw new Error(`${name} must use https://`)
  }
  const rawHost = u.hostname.toLowerCase()
  // IPv6 hosts in URLs are wrapped in []; URL.hostname returns them
  // bracketless.  Strip any leftover IPv6 zone-id ("%eth0").
  const host = rawHost.replace(/%.*$/, '')

  // Hostname-style blocklist
  if (
    host === 'localhost' ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    throw new Error(`${name} points at a disallowed host: ${host}`)
  }

  // IPv4 blocklist
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    const blockedIpv4 =
      host === '0.0.0.0' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host === '169.254.169.254' ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      // CGNAT (100.64.0.0/10)
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
    if (blockedIpv4) {
      throw new Error(`${name} points at a disallowed host: ${host}`)
    }
  }

  // IPv6 blocklist (URL hostname for IPv6 is bracketless lowercase hex)
  if (host.includes(':')) {
    const blockedIpv6 =
      host === '::1' ||
      host === '::' ||
      host.startsWith('fe80:') ||  // link-local
      host.startsWith('fc') ||      // unique-local fc00::/7 (fc, fd)
      host.startsWith('fd') ||
      host.startsWith('::ffff:127.') ||
      host.startsWith('::ffff:10.') ||
      host.startsWith('::ffff:192.168.') ||
      host.startsWith('::ffff:169.254.')
    if (blockedIpv6) {
      throw new Error(`${name} points at a disallowed host: ${host}`)
    }
  }

  return u
}

/**
 * Outbox worker — called by Vercel Cron (or equivalent scheduler).
 * Auth: CRON_SECRET header checked against env var.
 *
 * Flow per provider:
 *   1. Claim a batch of pending outbox rows (row-level locking, skip-locked).
 *   2. Dispatch each event to the provider.
 *   3. Mark delivered or failed.
 *
 * NEVER called from the browser. Uses the service-role key via the
 * server-admin Supabase client.
 */
export async function GET(req: Request) {
  const cronErr = checkCronAuth(req)
  if (cronErr) return cronErr

  const supabase = createAdminClient()

  // Recover rows stuck in 'delivering' from a previous failed worker
  // before claiming a new batch.  Without this, a Vercel runtime kill
  // mid-dispatch would orphan rows forever.
  //
  // Ships in migration 040.  If it's not deployed yet we log once and
  // continue — the dispatch loop still works, just without the
  // crashed-worker recovery layer.
  const { data: revived, error: sweepErr } = await supabase.rpc('sweep_stuck_integration_outbox')
  if (sweepErr) {
    console.warn('[cron/outbox] sweep skipped:', sweepErr.message)
  } else if (revived && revived > 0) {
    console.warn(`[cron/outbox] recovered ${revived} stuck-delivering row(s)`)
  }

  const results: Record<string, { delivered: number; failed: number; errors: string[] }> = {}

  // Process known providers; extend this array as new providers are added
  const providers = ['fruit']

  for (const provider of providers) {
    results[provider] = { delivered: 0, failed: 0, errors: [] }

    const { data: batch, error: claimErr } = await supabase.rpc('claim_outbox_batch', {
      p_provider: provider,
      p_limit: BATCH_SIZE,
    })

    if (claimErr) {
      console.error(`[cron/outbox] claim_outbox_batch failed for provider=${provider}`, {
        message: claimErr.message,
        code: claimErr.code ?? null,
      })
      results[provider].errors.push(`claim failed: ${claimErr.message}`)
      continue
    }

    if (!batch?.length) continue

    for (const event of batch) {
      try {
        await dispatchEvent(provider, event)

        const { error: deliveredErr } = await supabase.rpc('mark_outbox_delivered', {
          p_outbox_id: event.id,
        })
        if (deliveredErr) {
          console.error(`[cron/outbox] mark_outbox_delivered failed for event=${event.id}`, deliveredErr)
        }
        results[provider].delivered++
      } catch (dispatchError) {
        const errorMsg =
          dispatchError instanceof Error ? dispatchError.message : String(dispatchError)

        console.error(`[cron/outbox] dispatch failed for event=${event.id} provider=${provider}`, errorMsg)

        const { error: failedErr } = await supabase.rpc('mark_outbox_failed', {
          p_outbox_id: event.id,
          p_error: errorMsg,
          p_next_retry_at: null, // RPC handles exponential backoff
        })
        if (failedErr) {
          console.error(`[cron/outbox] mark_outbox_failed RPC failed for event=${event.id}`, failedErr)
        }
        results[provider].failed++
        results[provider].errors.push(errorMsg)
      }
    }
  }

  return ok({ processed: results })
}

/**
 * Provider dispatch stub — replace with real HTTP calls per provider.
 * Each provider gets its own dispatcher function keyed by provider code.
 */
async function dispatchEvent(
  provider: string,
  event: { id: string; payload: unknown; dedup_key: string },
): Promise<void> {
  switch (provider) {
    case 'fruit':
      await dispatchFruit(event)
      break
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

/**
 * Fruit dispatcher stub.
 * Replace with actual Fruit API call when credentials are available.
 * Must send Idempotency-Key header to prevent double-delivery on retry.
 */
async function dispatchFruit(event: {
  id: string
  payload: unknown
  dedup_key: string
}): Promise<void> {
  const fruitApiUrl = process.env.FRUIT_API_URL
  const fruitApiKey = process.env.FRUIT_API_KEY

  if (!fruitApiUrl || !fruitApiKey) {
    throw new Error('Fruit integration not configured (missing FRUIT_API_URL or FRUIT_API_KEY)')
  }

  const base = assertSafeHttpsUrl(fruitApiUrl, 'FRUIT_API_URL')
  const target = new URL('reservations/sync', base.toString().endsWith('/') ? base : new URL(base.toString() + '/'))

  const res = await fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${fruitApiKey}`,
      'Idempotency-Key': event.dedup_key,
    },
    body: JSON.stringify(event.payload),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    throw new Error(`Fruit API ${res.status}: ${body.slice(0, 500)}`)
  }
}
