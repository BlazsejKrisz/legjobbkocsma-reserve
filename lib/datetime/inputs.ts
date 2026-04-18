import { BAR_TIMEZONE } from './businessTime'

/**
 * Converts an ISO timestamp to YYYY-MM-DD and HH:MM in the bar's timezone.
 * Use for pre-filling <input type="date"> and <input type="time"> fields.
 * Always uses BAR_TIMEZONE — never the browser/server local clock.
 */
export function toLocalDateTimeInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso)

  const dateParts = new Intl.DateTimeFormat('hu-HU', {
    timeZone: BAR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)

  const timeParts = new Intl.DateTimeFormat('hu-HU', {
    timeZone: BAR_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)

  const y = dateParts.find((p) => p.type === 'year')!.value
  const mo = dateParts.find((p) => p.type === 'month')!.value
  const dy = dateParts.find((p) => p.type === 'day')!.value
  const hh = timeParts.find((p) => p.type === 'hour')!.value
  const mm = timeParts.find((p) => p.type === 'minute')!.value

  return { date: `${y}-${mo}-${dy}`, time: `${hh}:${mm}` }
}

/**
 * Returns today's date as YYYY-MM-DD in the bar's timezone.
 * Safe to call on both server and client.
 */
export function todayYYYYMMDD(): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('hu-HU', {
    timeZone: BAR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}
