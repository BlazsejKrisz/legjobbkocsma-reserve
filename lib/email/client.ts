import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('[email] RESEND_API_KEY is not set — emails will be skipped')
}

export const resend = new Resend(process.env.RESEND_API_KEY ?? '')

// Without a verified domain, use Resend's sandbox sender.
// Once you have a domain, set EMAIL_FROM=ReserveOps <noreply@yourdomain.com>
export const EMAIL_FROM = process.env.EMAIL_FROM ?? 'ReserveOps <onboarding@resend.dev>'
