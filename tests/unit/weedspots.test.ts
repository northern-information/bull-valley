import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/rng.ts'
import { placeWeeds, weedAt, WEEDS } from '../../src/weedspots.ts'

const METRES = { width: 15000, height: 15000 }
const open = () => false

describe('the valley’s weeds', () => {
  it('comes up in the same clumps for everyone', () => {
    const weeds = placeWeeds(METRES, open, open)
    expect(placeWeeds(METRES, open, open)).toEqual(weeds)
    expect(weeds.length).toBeGreaterThanOrEqual(WEEDS.clumps * WEEDS.tufts.min)
    expect(weeds.length).toBeLessThanOrEqual(WEEDS.clumps * WEEDS.tufts.max)
    for (const weed of weeds.slice(0, 500)) {
      expect(weed.scale).toBeGreaterThanOrEqual(WEEDS.scale.min)
      expect(weed.scale).toBeLessThanOrEqual(WEEDS.scale.max)
      expect(weed.yaw).toBeGreaterThanOrEqual(0)
      expect(weed.yaw).toBeLessThan(Math.PI * 2)
    }
  })

  it('keeps off what is blocked and what is kept clear, moving nothing else', () => {
    const all = placeWeeds(METRES, open, open)
    const west = (x: number) => x < 0
    const kept = placeWeeds(METRES, open, (x) => west(x))
    expect(kept.every((w) => !west(w.x))).toBe(true)
    expect(kept).toEqual(all.filter((w) => !west(w.x)))
    expect(placeWeeds(METRES, () => true, open)).toEqual([])
  })

  it('draws a tuft’s yaw and height from the rng it is given', () => {
    expect(weedAt(mulberry32(4), 1, 2)).toEqual(weedAt(mulberry32(4), 1, 2))
    expect(weedAt(mulberry32(4), 1, 2)).toMatchObject({ x: 1, z: 2 })
  })
})
