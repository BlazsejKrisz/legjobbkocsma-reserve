import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

// Default country for free-form HU input like "06 70 123 4567" or "+36 ..."
const DEFAULT_COUNTRY: CountryCode = 'HU'

export type ParsedPhone =
  | { ok: true; e164: string; nationalFormat: string; country: string }
  | { ok: false; reason: 'empty' | 'invalid' | 'not_possible' }

// Normalises any free-form phone number to E.164 ("+36..." form).  Accepts
// HU local formats ("06...", "70...") because of DEFAULT_COUNTRY, plus any
// already-international format ("+44...", "+1...").
export function parsePhone(input: string | null | undefined): ParsedPhone {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return { ok: false, reason: 'empty' }

  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_COUNTRY)
  if (!parsed) return { ok: false, reason: 'invalid' }
  if (!parsed.isPossible()) return { ok: false, reason: 'not_possible' }
  if (!parsed.isValid()) return { ok: false, reason: 'invalid' }

  return {
    ok: true,
    e164: parsed.number,                         // "+36701234567"
    nationalFormat: parsed.formatNational(),     // "06 70 123 4567"
    country: parsed.country ?? DEFAULT_COUNTRY,
  }
}

// Convenience: returns the E.164 form or null if unparseable.  Used in API
// handlers where we don't care about the failure reason.
export function toE164(input: string | null | undefined): string | null {
  const r = parsePhone(input)
  return r.ok ? r.e164 : null
}
