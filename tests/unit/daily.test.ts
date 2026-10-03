import { describe, expect, it } from 'vitest'
import {
  collectedToday,
  DAILY_ZONE,
  dayKey,
  nextMidnight,
} from '../../src/daily.ts'

const HOUR = 60 * 60 * 1000

// Central time: CST is UTC-6, CDT is UTC-5. In 2026 the clocks spring
// forward on March 8 at 2:00 and fall back on November 1 at 2:00.
const utc = (iso: string) => Date.parse(iso)

describe('dayKey', () => {
  it('names the Central calendar day, not the UTC one', () => {
    // 3:30 UTC on October 3 is 22:30 CDT on October 2.
    expect(dayKey(utc('2026-10-03T03:30:00Z'))).toBe('2026-10-02')
    expect(dayKey(utc('2026-10-03T05:00:00Z'))).toBe('2026-10-03')
    // Midnight CDT exactly is the new day; the ms before is the old one.
    const midnight = utc('2026-10-03T05:00:00Z')
    expect(dayKey(midnight - 1)).toBe('2026-10-02')
    expect(dayKey(midnight)).toBe('2026-10-03')
  })

  it('reads CST in winter', () => {
    // 5:30 UTC on January 10 is 23:30 CST on January 9.
    expect(dayKey(utc('2026-01-10T05:30:00Z'))).toBe('2026-01-09')
    expect(dayKey(utc('2026-01-10T06:00:00Z'))).toBe('2026-01-10')
  })

  it('pads the month and the day', () => {
    expect(dayKey(utc('2026-03-05T12:00:00Z'))).toBe('2026-03-05')
  })

  it('takes another zone when asked', () => {
    expect(dayKey(utc('2026-10-03T03:30:00Z'), 'UTC')).toBe('2026-10-03')
    expect(DAILY_ZONE).toBe('America/Chicago')
  })
})

describe('nextMidnight', () => {
  it('is the next 00:00 Central, in UTC ms', () => {
    const now = utc('2026-10-03T03:30:00Z') // 22:30 CDT, October 2
    const midnight = nextMidnight(now)
    expect(new Date(midnight).toISOString()).toBe('2026-10-03T05:00:00.000Z')
    expect(dayKey(midnight - 1)).toBe('2026-10-02')
    expect(dayKey(midnight)).toBe('2026-10-03')
  })

  it('is always after now, even at midnight itself', () => {
    const midnight = utc('2026-10-03T05:00:00Z')
    expect(nextMidnight(midnight)).toBe(midnight + 24 * HOUR)
    expect(nextMidnight(midnight - 1)).toBe(midnight)
  })

  it('makes a 23-hour day when the clocks spring forward', () => {
    // 21:00 CST on March 7; the next midnight is 06:00 UTC, and the day
    // after that one begins at 05:00 UTC, 23 hours later.
    const now = utc('2026-03-08T03:00:00Z')
    const first = nextMidnight(now)
    expect(new Date(first).toISOString()).toBe('2026-03-08T06:00:00.000Z')
    const second = nextMidnight(first)
    expect(second - first).toBe(23 * HOUR)
    expect(dayKey(second)).toBe('2026-03-09')
  })

  it('makes a 25-hour day when the clocks fall back', () => {
    // 21:00 CDT on October 31; the next midnight is 05:00 UTC, and the day
    // after that one begins at 06:00 UTC, 25 hours later.
    const now = utc('2026-11-01T02:00:00Z')
    const first = nextMidnight(now)
    expect(new Date(first).toISOString()).toBe('2026-11-01T05:00:00.000Z')
    const second = nextMidnight(first)
    expect(second - first).toBe(25 * HOUR)
    expect(dayKey(second)).toBe('2026-11-02')
  })

  it('keeps sub-second parts out of the answer', () => {
    const now = utc('2026-10-03T03:30:00.750Z')
    expect(nextMidnight(now) % 1000).toBe(0)
  })

  it('takes another zone when asked', () => {
    const now = utc('2026-10-03T03:30:00Z')
    expect(nextMidnight(now, 'UTC')).toBe(utc('2026-10-04T00:00:00Z'))
  })
})

describe('collectedToday', () => {
  it('is true only for a berry taken on the same Central day', () => {
    const now = utc('2026-10-03T03:30:00Z') // October 2, Central
    expect(collectedToday(undefined, now)).toBe(false)
    expect(collectedToday('2026-10-01', now)).toBe(false)
    expect(collectedToday('2026-10-02', now)).toBe(true)
    expect(collectedToday('2026-10-03', now)).toBe(false)
    // The day turns at midnight Central and the berry is back.
    expect(collectedToday('2026-10-02', nextMidnight(now))).toBe(false)
  })
})
