import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('[email] RESEND_API_KEY is not set — emails will be skipped')
}

export const resend = new Resend(process.env.RESEND_API_KEY ?? '')

// Set EMAIL_FROM_ADDRESS=foglalasok@foglalas.legjobbkocsma.hu in Vercel env vars
// (requires foglalas.legjobbkocsma.hu verified in Resend dashboard → Domains).
// The "From" display name is built per-email from the venue name.
//
// Defensive: strip any angle brackets / whitespace someone may have wrapped
// the value with — Resend rejects the resulting "<<addr>>" double-bracket.
const RAW_FROM = process.env.EMAIL_FROM_ADDRESS ?? 'onboarding@resend.dev'
export const EMAIL_FROM_ADDRESS = RAW_FROM.trim().replace(/^<+|>+$/g, '').trim()

// Builds an RFC 5322 "From" header where the display name is the venue.
// Strips control chars (header-injection guard) and quote-wraps so commas /
// dots / accents in venue names render correctly.
export function buildFromHeader(venueName: string): string {
  const safe = venueName.replace(/[\r\n]/g, '').trim() || 'Reservations'
  const escaped = safe.replace(/"/g, '\\"')
  return `"${escaped}" <${EMAIL_FROM_ADDRESS}>`
}
