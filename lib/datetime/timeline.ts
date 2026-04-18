export type TimelinePlacement = {
  leftPct: number // 0..100
  widthPct: number // 0..100
  isClippedStart: boolean
  isClippedEnd: boolean
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function getTimelinePlacement(input: {
  windowStartMs: number
  windowEndMs: number
  startsAtMs: number
  endsAtMs: number
}): TimelinePlacement | null {
  const { windowStartMs, windowEndMs, startsAtMs, endsAtMs } = input
  const windowDur = windowEndMs - windowStartMs
  if (windowDur <= 0) return null

  // no overlap
  if (endsAtMs <= windowStartMs || startsAtMs >= windowEndMs) return null

  const clippedStart = Math.max(startsAtMs, windowStartMs)
  const clippedEnd = Math.min(endsAtMs, windowEndMs)

  const left = (clippedStart - windowStartMs) / windowDur
  const right = (clippedEnd - windowStartMs) / windowDur

  const leftPct = clamp(left * 100, 0, 100)
  const widthPct = clamp((right - left) * 100, 0, 100)

  return {
    leftPct,
    widthPct,
    isClippedStart: startsAtMs < windowStartMs,
    isClippedEnd: endsAtMs > windowEndMs,
  }
}

export function buildHourTicks(windowStart: Date, windowEnd: Date) {
  const ticks: Date[] = []
  const d = new Date(windowStart)

  // snap to the hour
  d.setMinutes(0, 0, 0)

  // if windowStart is not on the hour, start from next hour (looks cleaner)
  if (d.getTime() < windowStart.getTime()) {
    d.setHours(d.getHours() + 1)
  }

  while (d.getTime() <= windowEnd.getTime()) {
    ticks.push(new Date(d))
    d.setHours(d.getHours() + 1)
  }

  return ticks
}
