import { describe, expect, it } from 'vitest'
import {
  FIREFLY,
  fireflyAt,
  fireflyField,
  havenNews,
} from '../../src/fireflies.ts'

const CENTRE = { x: 120, z: -40 }
const RADIUS = 30

// Every 0.05 s over two minutes.
const TIMES = Array.from({ length: 2400 }, (_, i) => i * 0.05)

describe('fireflies', () => {
  const flies = fireflyField(7, 60, CENTRE, RADIUS)

  it('draws the same flies from the same seed', () => {
    const again = fireflyField(7, 60, CENTRE, RADIUS)
    expect(again).toEqual(flies)
    for (const t of [0, 3.3, 99.9]) {
      expect(fireflyAt(again[5], t)).toEqual(fireflyAt(flies[5], t))
    }
    expect(fireflyField(8, 60, CENTRE, RADIUS)).not.toEqual(flies)
  })

  it('keeps every fly inside the radius', () => {
    for (const fly of flies) {
      for (const t of TIMES) {
        const { x, z } = fireflyAt(fly, t)
        expect(Math.hypot(x - CENTRE.x, z - CENTRE.z)).toBeLessThanOrEqual(
          RADIUS
        )
      }
    }
  })

  it('keeps every fly inside the radius of a small field', () => {
    for (const fly of fireflyField(3, 20, CENTRE, 2)) {
      for (const t of TIMES) {
        const { x, z } = fireflyAt(fly, t)
        expect(Math.hypot(x - CENTRE.x, z - CENTRE.z)).toBeLessThanOrEqual(2)
      }
    }
  })

  it('hovers in the lift band', () => {
    for (const fly of flies) {
      for (const t of TIMES) {
        const { lift } = fireflyAt(fly, t)
        expect(lift).toBeGreaterThanOrEqual(FIREFLY.liftMin)
        expect(lift).toBeLessThanOrEqual(FIREFLY.liftMax)
      }
    }
  })

  it('glows between 0 and 1, and is dark most of the time', () => {
    for (const fly of flies) {
      let lit = 0
      for (const t of TIMES) {
        const { glow } = fireflyAt(fly, t)
        expect(glow).toBeGreaterThanOrEqual(0)
        expect(glow).toBeLessThanOrEqual(1)
        if (glow > 0) lit++
      }
      expect(lit / TIMES.length).toBeLessThan(0.25)
    }
  })

  it('flashes every fly within its longest period', () => {
    const window = FIREFLY.period[1]
    for (const start of [0, 41.7]) {
      for (const fly of flies) {
        let peak = 0
        for (let t = start; t <= start + window; t += 0.02) {
          peak = Math.max(peak, fireflyAt(fly, t).glow)
        }
        expect(peak).toBeGreaterThan(0.9)
      }
    }
  })

  it('drifts slowly', () => {
    for (const fly of flies) {
      const a = fireflyAt(fly, 10)
      const b = fireflyAt(fly, 10.1)
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.15)
    }
  })
})

describe('havenNews', () => {
  it('says the crossing, either way, and nothing else', () => {
    expect(havenNews(false, true)).toBe('in')
    expect(havenNews(true, false)).toBe('out')
    expect(havenNews(true, true)).toBeNull()
    expect(havenNews(false, false)).toBeNull()
    // The first reading is never a crossing.
    expect(havenNews(null, true)).toBeNull()
    expect(havenNews(null, false)).toBeNull()
  })
})
