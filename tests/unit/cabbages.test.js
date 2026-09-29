import { describe, expect, it } from 'vitest'
import { placeCabbages, CABBAGE_SEED } from '../../src/cabbages.js'
import { landmarkWorldPositions, CABBAGE_STAND } from '../../src/landmarks.js'
import { pointInPolygon } from '../../src/coords.js'
import { mulberry32 } from '../../src/rng.js'

const METRES = { width: 10000, height: 10000 }
const GEO = {
  metres: METRES,
  // One wetland ring and one reserve, both squares in unit coords.
  wetland: [
    [
      [0.1, 0.1],
      [0.3, 0.1],
      [0.3, 0.3],
      [0.1, 0.3],
    ],
  ],
  reserves: [
    {
      n: 'Test Reserve',
      p: [
        [0.6, 0.6],
        [0.8, 0.6],
        [0.8, 0.8],
        [0.6, 0.8],
      ],
    },
  ],
}
const STAND = { u: 0.5, v: 0.5 }

describe('placeCabbages', () => {
  it('is deterministic for a fixed seed', () => {
    const a = placeCabbages(GEO, mulberry32(CABBAGE_SEED), {
      stand: STAND,
      metres: METRES,
    })
    const b = placeCabbages(GEO, mulberry32(CABBAGE_SEED), {
      stand: STAND,
      metres: METRES,
    })
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('respects the requested counts', () => {
    const spots = placeCabbages(GEO, mulberry32(1), {
      stand: STAND,
      metres: METRES,
      count: 20,
      cluster: 6,
    })
    expect(spots.length).toBe(26)
    expect(spots.filter((s) => s.src === 'cluster').length).toBe(6)
  })

  it('grows the guaranteed cluster within 400 m of the stand', () => {
    const spots = placeCabbages(GEO, mulberry32(2), {
      stand: STAND,
      metres: METRES,
    })
    for (const s of spots.filter((c) => c.src === 'cluster')) {
      const dx = (s.u - STAND.u) * METRES.width
      const dz = (s.v - STAND.v) * METRES.height
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(400)
    }
  })

  it('keeps wild cabbages inside their source polygons', () => {
    const spots = placeCabbages(GEO, mulberry32(3), {
      stand: STAND,
      metres: METRES,
      count: 30,
    })
    for (const s of spots) {
      if (s.src === 'wetland') {
        expect(pointInPolygon(s.u, s.v, GEO.wetland[0])).toBe(true)
      } else if (s.src === 'reserve') {
        expect(pointInPolygon(s.u, s.v, GEO.reserves[0].p)).toBe(true)
      }
    }
    // Both habitats get used at 2:1-ish weighting.
    expect(spots.some((s) => s.src === 'wetland')).toBe(true)
    expect(spots.some((s) => s.src === 'reserve')).toBe(true)
  })
})

describe('landmarks', () => {
  it('projects both landmarks inside the current survey frame', () => {
    // The regenerated wide frame; keep in sync with scripts/fetch_bull_valley.cjs.
    const bbox = {
      south: 42.2655,
      west: -88.4575,
      north: 42.4015,
      east: -88.2745,
    }
    const metres = { width: 15059, height: 15038 }
    const marks = landmarkWorldPositions(bbox, metres)
    expect(marks.length).toBe(2)
    for (const mark of marks) {
      expect(mark.u).toBeGreaterThan(0)
      expect(mark.u).toBeLessThan(1)
      expect(mark.v).toBeGreaterThan(0)
      expect(mark.v).toBeLessThan(1)
    }
    const stand = marks.find((m) => m.n === CABBAGE_STAND)
    expect(stand.u).toBeCloseTo(0.775, 2)
    expect(stand.v).toBeCloseTo(0.702, 2)
  })
})
