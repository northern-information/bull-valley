import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { tripBlur } from '../../src/trip.ts'

const span = { start: 10, end: 70 }

describe('tripBlur', () => {
  it('is nothing outside the span', () => {
    expect(tripBlur(span, 9)).toBe(0)
    expect(tripBlur(span, 70)).toBe(0)
    expect(tripBlur({ start: 0, end: 0 }, 0)).toBe(0)
  })

  it('blurs for a second from the use, then not at all', () => {
    expect(tripBlur(span, 10)).toBe(1)
    expect(tripBlur(span, 10 + CONFIG.trip.blurSeconds / 2)).toBeCloseTo(0.5)
    expect(tripBlur(span, 10 + CONFIG.trip.blurSeconds)).toBe(0)
    expect(tripBlur(span, 60)).toBe(0)
  })
})
