// lib/datetime/window.ts
import { fromLocalDateAndTimes } from "@/lib/datetime/businessTime"
import { toYYYYMMDD } from "@/lib/datetime/ranges"

function isHHMM(v: string | null | undefined): v is string {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v)
}

export function buildDashboardWindow(args: {
  date?: string | null
  from?: string | null
  to?: string | null
}) {
  const today = toYYYYMMDD(new Date())
  const date = (args.date ?? today).slice(0, 10)

  // business defaults
  const from = isHHMM(args.from) ? args.from : "13:00"
  const to = isHHMM(args.to) ? args.to : "03:00"

  const { start: windowStart, end: windowEnd } = fromLocalDateAndTimes(date, from, to, {
    allowOvernight: true,
  })

  return {
    date,
    from,
    to,
    windowStart,
    windowEnd,
    windowStartISO: windowStart.toISOString(),
    windowEndISO: windowEnd.toISOString(),
  }
}
