import { err } from './http'

const MAX_WINDOW_HOURS = 18   // hard cap on availability scan range
const MAX_PARTY_SIZE   = 500  // absolute ceiling regardless of venue settings

/**
 * Validates the optional BOOKING_API_KEY gate.
 *
 * If the env var BOOKING_API_KEY is set, every request to a public booking
 * endpoint must include the header:
 *   X-Api-Key: <value of BOOKING_API_KEY>
 *
 * Set this on your WordPress site's server-side config (not in browser JS).
 * If the env var is not set the check is skipped — useful during development
 * or when the form runs fully server-side (PHP) where the key is never exposed.
 */
export function checkApiKey(req: Request): ReturnType<typeof err> | null {
  const expected = process.env.BOOKING_API_KEY
  if (!expected) return null  // gate is disabled

  const provided = req.headers.get('x-api-key')
  if (provided !== expected) {
    return err('Invalid or missing API key', { status: 401 })
  }
  return null
}

/**
 * Clamps window_hours to MAX_WINDOW_HOURS to prevent runaway DB queries.
 */
export function clampWindowHours(raw: number): number {
  if (isNaN(raw) || raw < 1) return 8
  return Math.min(raw, MAX_WINDOW_HOURS)
}

/**
 * Rejects dates in the past (more than 1 day ago) and too far in the future.
 * Returns an error response or null if the date is acceptable.
 */
export function validateBookingDate(
  date: string,
  maxAdvanceDays: number,
): ReturnType<typeof err> | null {
  const d = new Date(date)
  const now = new Date()

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d < yesterday) {
    return err('Date is in the past', { status: 422 })
  }

  const maxFuture = new Date(now)
  maxFuture.setDate(maxFuture.getDate() + maxAdvanceDays)
  if (d > maxFuture) {
    return err(
      `Date is too far in advance (maximum ${maxAdvanceDays} days)`,
      { status: 422 },
    )
  }

  return null
}

/**
 * Hard ceiling on party size regardless of venue settings,
 * to prevent obviously malformed requests.
 */
export function validatePartySize(size: number): ReturnType<typeof err> | null {
  if (isNaN(size) || size < 1 || size > MAX_PARTY_SIZE) {
    return err(`party_size must be between 1 and ${MAX_PARTY_SIZE}`, { status: 400 })
  }
  return null
}
