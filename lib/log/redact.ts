// PII redaction helpers for log lines.
//
// Logs land in Vercel + downstream aggregators with long retention; emails
// and phone numbers in those logs are still PII under GDPR.  Redact at the
// logging boundary so a developer skimming logs sees enough context to
// debug (domain, last-4) but not enough to identify a customer.

export function redactEmail(email: string | null | undefined): string {
  if (!email) return '<no-email>'
  const at = email.indexOf('@')
  if (at < 1) return '<malformed-email>'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const head = local.length <= 2 ? local[0] ?? '' : local.slice(0, 2)
  return `${head}***@${domain}`
}

export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return '<no-phone>'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return '***'
  return `***${digits.slice(-4)}`
}
