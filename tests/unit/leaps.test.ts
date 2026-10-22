import { describe, expect, it } from 'vitest'
import { LEAP, leapAt, leapPose } from '../../src/leaps.ts'

// Every leap across a stretch of the clock, sampled finely.
function leaps(seed: number, from: number, to: number, step = 0.05) {
  const out: { at: number; leap: NonNullable<ReturnType<typeof leapAt>> }[] = []
  for (let s = from; s < to; s += step) {
    const leap = leapAt(s, seed, 12)
    if (leap) out.push({ at: s, leap })
  }
  return out
}

describe('fish leaping in the pond', () => {
  it('leaps once a slot, for its seconds, and is still between', () => {
    const seen = leaps(7, 0, LEAP.slot * 10)
    const slots = new Set(seen.map(({ at }) => Math.floor(at / LEAP.slot)))
    expect(slots.size).toBe(10)
    for (const slot of slots) {
      const inSlot = seen.filter(
        ({ at }) => Math.floor(at / LEAP.slot) === slot
      )
      const span = inSlot.at(-1)!.at - inSlot[0].at
      expect(span).toBeLessThanOrEqual(LEAP.seconds)
      expect(span).toBeGreaterThan(LEAP.seconds - 0.15)
    }
  })

  it('holds one spot, way and fish through a leap', () => {
    const seen = leaps(3, 0, LEAP.slot)
    const { toward, out, heading, kind } = seen[0].leap
    for (const { leap } of seen) {
      expect(leap).toMatchObject({ toward, out, heading, kind })
      expect(leap.t).toBeGreaterThanOrEqual(0)
      expect(leap.t).toBeLessThan(1)
    }
    expect(toward).toBeGreaterThanOrEqual(0)
    expect(toward).toBeLessThan(12)
    expect(out).toBeGreaterThanOrEqual(LEAP.out[0])
    expect(out).toBeLessThanOrEqual(LEAP.out[1])
    expect(LEAP.kinds).toContain(kind)
  })

  it('is the same leap for everyone at the same moment, another pond its own', () => {
    expect(leaps(5, 0, 30)).toEqual(leaps(5, 0, 30))
    expect(leaps(5, 0, 30)).not.toEqual(leaps(6, 0, 30))
  })

  it('rises nose up out of the water and falls nose down back in', () => {
    expect(leapPose(0)).toEqual({ height: 0, pitch: 0.9 })
    expect(leapPose(0.5).height).toBeCloseTo(LEAP.height)
    expect(leapPose(0.5).pitch).toBeCloseTo(0)
    expect(leapPose(1).height).toBeCloseTo(0)
    expect(leapPose(1).pitch).toBeCloseTo(-0.9)
  })
})
