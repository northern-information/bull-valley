import { describe, expect, it } from 'vitest'
import {
  CABBAGE_SEED,
  DISH_CABBAGE_SEED,
  PINE_CABBAGE_SEED,
  placeCabbages,
  placeCabbagesAround,
  placeDishCabbages,
} from '../../src/cabbages.ts'
import { pointInPolygon } from '../../src/coords.ts'
import { CABBAGE_PATCH, landmarkWorldPositions } from '../../src/landmarks.ts'
import { mulberry32 } from '../../src/rng.ts'
import type { Bbox, Geo, Metres } from '../../src/interfaces.ts'

const METRES: Metres = { width: 10000, height: 10000 }
const GEO: Pick<Geo, 'metres' | 'wetland' | 'reserves'> = {
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
const PATCH = { u: 0.5, v: 0.5 }

describe('placeCabbages', () => {
  it('is deterministic for a fixed seed', () => {
    const a = placeCabbages(GEO, mulberry32(CABBAGE_SEED), {
      patch: PATCH,
      metres: METRES,
    })
    const b = placeCabbages(GEO, mulberry32(CABBAGE_SEED), {
      patch: PATCH,
      metres: METRES,
    })
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('respects the requested counts', () => {
    const spots = placeCabbages(GEO, mulberry32(1), {
      patch: PATCH,
      metres: METRES,
      count: 20,
      cluster: 6,
    })
    expect(spots.length).toBe(26)
    expect(spots.filter((s) => s.src === 'cluster').length).toBe(6)
  })

  it('grows the guaranteed cluster within 400 m of the patch', () => {
    const spots = placeCabbages(GEO, mulberry32(2), {
      patch: PATCH,
      metres: METRES,
    })
    for (const s of spots.filter((c) => c.src === 'cluster')) {
      const dx = (s.u - PATCH.u) * METRES.width
      const dz = (s.v - PATCH.v) * METRES.height
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(400)
    }
  })

  it('keeps wild cabbages inside their source polygons', () => {
    const spots = placeCabbages(GEO, mulberry32(3), {
      patch: PATCH,
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
  it('projects the landmarks and the cabbage patch inside the current survey frame', () => {
    // The survey's frame; keep in sync with geo.json bbox.
    const bbox: Bbox = {
      south: 42.2655,
      west: -88.4575,
      north: 42.4015,
      east: -88.2745,
    }
    const metres = { width: 15059, height: 15038 }
    const marks = landmarkWorldPositions(bbox, metres)
    expect(marks.length).toBe(1)
    const [patch] = landmarkWorldPositions(bbox, metres, [CABBAGE_PATCH])
    for (const mark of [...marks, patch]) {
      expect(mark.u).toBeGreaterThan(0)
      expect(mark.u).toBeLessThan(1)
      expect(mark.v).toBeGreaterThan(0)
      expect(mark.v).toBeLessThan(1)
    }
    expect(patch.u).toBeCloseTo(0.775, 2)
    expect(patch.v).toBeCloseTo(0.702, 2)
  })
})

describe('placeDishCabbages', () => {
  const DISHES = Array.from({ length: 36 }, (_, i) => ({
    x: (i % 6) * 13,
    z: Math.floor(i / 6) * 13,
  }))
  const OPTIONS = { count: 8, near: 2.4, far: 3.8 }

  it('grows each under its own dish, past the pad and inside the rim', () => {
    const spots = placeDishCabbages(
      DISHES,
      mulberry32(DISH_CABBAGE_SEED),
      OPTIONS
    )
    expect(spots).toHaveLength(8)
    const under = spots.map((s) => {
      const i = DISHES.findIndex(
        (d) => Math.hypot(s.x - d.x, s.z - d.z) <= OPTIONS.far
      )
      const d = Math.hypot(s.x - DISHES[i].x, s.z - DISHES[i].z)
      expect(d).toBeGreaterThanOrEqual(OPTIONS.near)
      return i
    })
    expect(new Set(under).size).toBe(8)
  })

  it('is the same every time from the same seed', () => {
    expect(
      placeDishCabbages(DISHES, mulberry32(DISH_CABBAGE_SEED), OPTIONS)
    ).toEqual(placeDishCabbages(DISHES, mulberry32(DISH_CABBAGE_SEED), OPTIONS))
  })

  it('grows no more than there are dishes, and none with no dishes', () => {
    expect(
      placeDishCabbages(DISHES.slice(0, 3), mulberry32(1), OPTIONS)
    ).toHaveLength(3)
    expect(placeDishCabbages([], mulberry32(1), OPTIONS)).toEqual([])
  })
})

describe('placeCabbagesAround', () => {
  const CENTRE = { x: 100, z: -40 }
  const PATCH = { count: 14, near: 1.4, far: 5.5 }

  it('grows a patch round the centre, between near and far', () => {
    const spots = placeCabbagesAround(
      CENTRE,
      mulberry32(PINE_CABBAGE_SEED),
      PATCH
    )
    expect(spots).toHaveLength(14)
    for (const s of spots) {
      const d = Math.hypot(s.x - CENTRE.x, s.z - CENTRE.z)
      expect(d).toBeGreaterThanOrEqual(PATCH.near)
      expect(d).toBeLessThanOrEqual(PATCH.far)
    }
  })

  it('keeps clear of what it is told to avoid', () => {
    const avoid = [
      { x: 102, z: -40, r: 2 },
      { x: 98, z: -38, r: 1.5 },
    ]
    const spots = placeCabbagesAround(CENTRE, mulberry32(3), PATCH, avoid)
    expect(spots).toHaveLength(14)
    for (const s of spots) {
      for (const a of avoid) {
        expect(Math.hypot(s.x - a.x, s.z - a.z)).toBeGreaterThanOrEqual(a.r)
      }
    }
  })

  it('grows fewer when the room runs out, and never hangs', () => {
    const smother = [{ ...CENTRE, r: 10 }]
    expect(placeCabbagesAround(CENTRE, mulberry32(1), PATCH, smother)).toEqual(
      []
    )
  })
})
