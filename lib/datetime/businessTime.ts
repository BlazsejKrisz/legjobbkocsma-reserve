import { fromZonedTime } from "date-fns-tz"

export const BAR_TIMEZONE = "Europe/Budapest" as const

export function fromLocalDateAndTimes(
  date: string,
  from: string,
  until: string,
  opts?: { allowOvernight?: boolean },
) {
  const allowOvernight = opts?.allowOvernight ?? false

  const start = fromZonedTime(`${date}T${from}:00`, BAR_TIMEZONE)
  let end = fromZonedTime(`${date}T${until}:00`, BAR_TIMEZONE)

  if (allowOvernight && end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  }

  return {
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    start,
    end,
  }
}

/**
 * Business-night window helper: opening -> closing (overnight supported)
 */
export function businessNightWindow(args: {
  dateYYYYMMDD: string
  openHHMM: string
  closeHHMM: string
}) {
  const { start, end, starts_at, ends_at } = fromLocalDateAndTimes(
    args.dateYYYYMMDD,
    args.openHHMM,
    args.closeHHMM,
    { allowOvernight: true },
  )

  return { start, end, startISO: starts_at, endISO: ends_at }
}

/**
 * Maps an ISO timestamp to the business date (YYYY-MM-DD).
 * Anything after midnight but before closeHHMM belongs to the previous business day.
 */
export function businessDateYYYYMMDDForISO(
  iso: string,
  closeHHMM: string,
  timeZone: string = BAR_TIMEZONE,
) {
  const d = new Date(iso)

  // local HH:mm in the bar TZ
  const hhmm = new Intl.DateTimeFormat("hu-HU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d)

  // local YYYY-MM-DD in the bar TZ
  const ymd = new Intl.DateTimeFormat("hu-HU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)

  if (hhmm < closeHHMM) {
    const prev = new Date(d.getTime() - 24 * 60 * 60 * 1000)
    return new Intl.DateTimeFormat("hu-HU", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(prev)
  }

  return ymd
}

export function formatTimeHHMM(iso: string, timeZone: string = BAR_TIMEZONE) {
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso))
}

export function formatTimeRange(startISO: string, endISO: string, timeZone: string = BAR_TIMEZONE) {
  return `${formatTimeHHMM(startISO, timeZone)}–${formatTimeHHMM(endISO, timeZone)}`
}

export function formatDateYYYYMMDD(iso: string, timeZone: string = BAR_TIMEZONE) {
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
}
