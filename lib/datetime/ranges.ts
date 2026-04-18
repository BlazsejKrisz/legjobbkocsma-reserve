// lib/datetime/ranges.ts
import { fromZonedTime } from "date-fns-tz"
import { BAR_TIMEZONE } from "./businessTime"   // direct import avoids circular via index

export type Preset = "day" | "week" | "month" | "all" | "custom"

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000)
}

/** Returns YYYY-MM-DD for a Date in BAR_TIMEZONE (not the server's local TZ). */
export function toYYYYMMDD(d: Date): string {
  const parts = new Intl.DateTimeFormat("hu-HU", {
    timeZone: BAR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const y  = parts.find((p) => p.type === "year")!.value
  const m  = parts.find((p) => p.type === "month")!.value
  const dy = parts.find((p) => p.type === "day")!.value
  return `${y}-${m}-${dy}`
}

/** Returns UTC ISO boundaries for one full calendar day in BAR_TIMEZONE. */
export function dayWindowUTC(dateYYYYMMDD: string): { from: string; to: string } {
  return {
    from: fromZonedTime(`${dateYYYYMMDD}T00:00:00`, BAR_TIMEZONE).toISOString(),
    to:   fromZonedTime(`${dateYYYYMMDD}T23:59:59`, BAR_TIMEZONE).toISOString(),
  }
}

export function startOfDayTZ(yyyyMmDd: string) {
  return fromZonedTime(`${yyyyMmDd}T00:00:00`, BAR_TIMEZONE)
}

export function startOfWeekMondayTZ(anchorYYYYMMDD: string) {
  const start = startOfDayTZ(anchorYYYYMMDD)
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: BAR_TIMEZONE,
    weekday: "short",
  }).format(start)
  const idx = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday)
  return addDays(start, -(idx < 0 ? 0 : idx))
}

export function computePresetRange(args: {
  preset: Preset
  anchorYYYYMMDD: string
  fromISO?: string | null
  toISO?: string | null
}) {
  const { preset, anchorYYYYMMDD, fromISO, toISO } = args

  let start: Date
  let end: Date

  if (preset === "custom" && fromISO && toISO) {
    start = new Date(fromISO)
    end   = new Date(toISO)
  } else if (preset === "day") {
    start = startOfDayTZ(anchorYYYYMMDD)
    end   = addDays(start, 1)
  } else if (preset === "week") {
    start = startOfWeekMondayTZ(anchorYYYYMMDD)
    end   = addDays(start, 7)
  } else if (preset === "month") {
    start = startOfDayTZ(anchorYYYYMMDD)
    end   = addDays(start, 30)
  } else if (preset === "all") {
    start = new Date("2020-01-01T00:00:00.000Z")
    end   = new Date(Date.now() + 24 * 60 * 60 * 1000)
  } else {
    start = startOfWeekMondayTZ(anchorYYYYMMDD)
    end   = addDays(start, 7)
  }

  return { start, end, startISO: start.toISOString(), endISO: end.toISOString() }
}
