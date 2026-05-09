import { timingSafeEqual } from 'node:crypto'
import { err } from './http'

// Constant-time comparison of the Authorization header against
// `Bearer ${CRON_SECRET}`.  Returns null when authorized, an error response
// otherwise.
//
// Three things this guards against:
//
// 1. Timing oracle on `=== Bearer ${secret}` — Node's `===` short-circuits
//    per character, leaking length/prefix information over many requests.
// 2. The classic "missing env var" footgun: if CRON_SECRET is unset, naive
//    `auth === 'Bearer ' + process.env.CRON_SECRET` becomes a literal
//    `'Bearer undefined'` match — a guessable secret. We refuse to
//    authorize at all when the env var is empty.
// 3. Different-length inputs throw on `timingSafeEqual` — pad both sides
//    via Buffer.from(...) of equal length before comparing.
export function checkCronAuth(req: Request): ReturnType<typeof err> | null {
  const expected = process.env.CRON_SECRET
  if (!expected || expected.length < 16) {
    console.error('[cronAuth] CRON_SECRET is missing or too short — refusing to authorize')
    return err('Cron not configured', { status: 503 })
  }

  const provided = req.headers.get('authorization') ?? ''
  const expectedHeader = `Bearer ${expected}`

  const a = Buffer.from(provided)
  const b = Buffer.from(expectedHeader)
  if (a.length !== b.length) {
    return err('Unauthorized', { status: 401 })
  }
  if (!timingSafeEqual(a, b)) {
    return err('Unauthorized', { status: 401 })
  }
  return null
}
