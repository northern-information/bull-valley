// Pure: the daily clock. The berry bush at the spawn Citgo gives each account
// one berry per calendar day in Bull Valley's own time zone, and the day
// turns at midnight Central, whatever clock the player's machine keeps.
// The Worker runs this against its own Date.now(); the client only reads
// the result (DailyWire in protocol.ts). No DOM, no Workers types.
//
// Intl does the time-zone arithmetic, DST included: the Workers runtime
// and every browser the game supports ship the full ICU data.

export const DAILY_ZONE = 'America/Chicago'

const DAY_MS = 24 * 60 * 60 * 1000

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(zone, f)
  }
  return f
}

// The wall clock in `zone` at the instant `ms`.
function wallClock(ms: number, zone: string): WallClock {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
  for (const part of formatter(zone).formatToParts(ms)) {
    parts[part.type] = part.value
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // h23 still prints midnight as "24" in some ICU builds.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

// The zone's offset from UTC at `ms`, in ms (negative west of Greenwich).
function zoneOffset(ms: number, zone: string): number {
  const w = wallClock(ms, zone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  // Date.UTC has whole seconds; put the sub-second part back.
  return asUtc - (ms - (((ms % 1000) + 1000) % 1000))
}

// The calendar day at `ms` in Central time, as YYYY-MM-DD. Two instants
// share a day exactly when the bush treats them as the same day. The
// valley asks on every change, so the last minute's answer is kept: a day
// never turns inside a minute.
let lastDay: { zone: string; minute: number; key: string } | null = null

export function dayKey(ms: number, zone = DAILY_ZONE): string {
  const minute = Math.floor(ms / 60_000)
  if (lastDay && lastDay.zone === zone && lastDay.minute === minute) {
    return lastDay.key
  }
  const { year, month, day } = wallClock(ms, zone)
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const key = `${year}-${mm}-${dd}`
  lastDay = { zone, minute, key }
  return key
}

// The first instant of the next Central day after `ms`: midnight, in UTC
// ms. On the night the clocks change the day is 23 or 25 hours long, so
// the offset is read again at the candidate until it settles.
export function nextMidnight(ms: number, zone = DAILY_ZONE): number {
  const { year, month, day } = wallClock(ms, zone)
  const wallMidnight = Date.UTC(year, month - 1, day + 1)
  let candidate = wallMidnight - zoneOffset(ms, zone)
  for (let i = 0; i < 3; i++) {
    const next = wallMidnight - zoneOffset(candidate, zone)
    if (next === candidate) break
    candidate = next
  }
  // Never before now, whatever ICU does at the seam.
  return candidate > ms ? candidate : ms + DAY_MS
}

// Whether a berry taken on `lastDay` (a dayKey, or undefined for never)
// still counts today.
export function collectedToday(
  lastDay: string | undefined,
  now: number,
  zone = DAILY_ZONE
): boolean {
  return lastDay !== undefined && lastDay === dayKey(now, zone)
}
