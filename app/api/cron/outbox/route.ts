import { ok, err } from '@/lib/api/http'
import { createClient } from '@/lib/supabase/server'

const BATCH_SIZE = 20

/**
 * Outbox worker — called by Vercel Cron (or equivalent scheduler).
 * Auth: CRON_SECRET header checked against env var.
 *
 * Flow per provider:
 *   1. Claim a batch of pending outbox rows (row-level locking, skip-locked).
 *   2. Dispatch each event to the provider.
 *   3. Mark delivered or failed.
 *
 * NEVER called from the browser. Uses service-role key implicitly through
 * the Supabase client here (relies on server-side env vars).
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return err('Unauthorized', { status: 401 })
  }

  const supabase = await createClient()
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

  const res = await fetch(`${fruitApiUrl}/reservations/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${fruitApiKey}`,
      'Idempotency-Key': event.dedup_key,
    },
    body: JSON.stringify(event.payload),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    throw new Error(`Fruit API ${res.status}: ${body}`)
  }
}
