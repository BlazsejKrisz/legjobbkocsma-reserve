import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Lazily initialised — only when env vars are present.
// If Upstash is not configured the checks are skipped (dev-friendly).
let _redis: Redis | null = null
let _ipLimiter: Ratelimit | null = null
let _emailLimiter: Ratelimit | null = null

function redis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return _redis
}

function ipLimiter(): Ratelimit | null {
  const r = redis()
  if (!r) return null
  if (!_ipLimiter) {
    _ipLimiter = new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(5, '10 m'), prefix: 'rl:ip' })
  }
  return _ipLimiter
}

function emailLimiter(): Ratelimit | null {
  const r = redis()
  if (!r) return null
  if (!_emailLimiter) {
    _emailLimiter = new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(3, '24 h'), prefix: 'rl:email' })
  }
  return _emailLimiter
}

// Set RATE_LIMIT_BYPASS=1 in .env.local (and never in prod) to skip both
// limiters during development.  Production deploys leave this unset so the
// real limits apply.
const BYPASS = process.env.RATE_LIMIT_BYPASS === '1'

/** Returns false if the IP has exceeded 5 requests / 10 minutes. */
export async function checkIpRateLimit(ip: string): Promise<boolean> {
  if (BYPASS) return true
  const l = ipLimiter()
  if (!l) return true
  const { success } = await l.limit(ip)
  return success
}

/** Returns false if the email has been used for 3+ bookings in the last 24 hours. */
export async function checkEmailRateLimit(email: string): Promise<boolean> {
  if (BYPASS) return true
  const l = emailLimiter()
  if (!l) return true
  const { success } = await l.limit(email.toLowerCase())
  return success
}
