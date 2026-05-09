import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Edge / proxy-tier rate limiter.  Distinct from the per-route limiter in
// `lib/api/rateLimiter.ts` because:
//
//   - This one runs in the proxy (every request to a public path), so it
//     must be cheap and use a sliding window keyed by IP+path-prefix.
//   - The route-level limiter runs after auth and may key by email or
//     stricter dimensions; their windows are different by design.
//
// Both back into the same Upstash redis when configured.  When env vars
// are missing the limiters fail-open (development).  In production we
// rely on env-var presence at deploy time + the per-route limiter as a
// second layer.

let _redis: Redis | null = null
const _byPrefix = new Map<string, Ratelimit>()

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

function limiterFor(pathPrefix: string, perMinute: number): Ratelimit | null {
  const r = redis()
  if (!r) return null
  const key = `${pathPrefix}:${perMinute}`
  let l = _byPrefix.get(key)
  if (!l) {
    l = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(perMinute, '1 m'),
      prefix: `rl:edge:${pathPrefix}`,
      analytics: false,
    })
    _byPrefix.set(key, l)
  }
  return l
}

// Per-public-prefix limits.  Conservative — the per-route limiter applies
// stricter rules where appropriate.
const LIMITS: Array<{ prefix: string; perMinute: number }> = [
  { prefix: '/api/public/reservations', perMinute: 8 },
  { prefix: '/api/public/availability', perMinute: 30 },
  { prefix: '/api/public/track', perMinute: 60 },
  // Partner endpoint — same per-IP cap as the public booking path.  The
  // per-key partner gate is enforced inside the handler.
  { prefix: '/api/partner', perMinute: 12 },
]

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number }

export async function checkEdgeRateLimit(ip: string, path: string): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_BYPASS === '1') return { ok: true }

  const match = LIMITS.find((l) => path.startsWith(l.prefix))
  if (!match) return { ok: true }

  const limiter = limiterFor(match.prefix, match.perMinute)
  if (!limiter) return { ok: true }  // fail-open if Upstash not configured

  const { success, reset } = await limiter.limit(`${ip}:${match.prefix}`)
  if (success) return { ok: true }
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
  return { ok: false, retryAfter }
}
