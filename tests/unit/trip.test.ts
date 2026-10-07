import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { SOBER, tripLevel } from '../../src/trip.ts'

const span = { start: 10, end: 70 }

describe('tripLevel', () => {
  it('is sober outside the span', () => {
    expect(tripLevel(span, 9)).toEqual(SOBER)
    expect(tripLevel(span, 70)).toEqual(SOBER)
    expect(tripLevel({ start: 0, end: 0 }, 0)).toEqual(SOBER)
  })

  it('blurs for a second from the use, then only trails', () => {
    expect(tripLevel(span, 10)).toEqual({ blur: 1, trails: 1 })
    const half = tripLevel(span, 10 + CONFIG.trip.blurSeconds / 2)
    expect(half.blur).toBeCloseTo(0.5)
    expect(tripLevel(span, 10 + CONFIG.trip.blurSeconds)).toEqual({
      blur: 0,
      trails: 1,
    })
  })

  it('thins the trails out over the end', () => {
    const fade = CONFIG.trip.fadeSeconds
    expect(tripLevel(span, 70 - fade).trails).toBe(1)
    expect(tripLevel(span, 70 - fade / 2).trails).toBeCloseTo(0.5)
  })
})
