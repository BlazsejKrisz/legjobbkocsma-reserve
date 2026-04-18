export function hhmmPlusMinutes(hhmm: string, minutes: number) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = Number(m[1])
  const min = Number(m[2])
  const total = h * 60 + min + minutes
  const wrapped = ((total % 1440) + 1440) % 1440
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0")
  const mm = String(wrapped % 60).padStart(2, "0")
  return `${hh}:${mm}`
}
