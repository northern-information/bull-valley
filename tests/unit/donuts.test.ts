import { describe, expect, it } from 'vitest'
import { DONUT_STEP, donutRoute } from '../../src/donuts.ts'
import { mulberry32 } from '../../src/rng.ts'
import type { XZ } from '../../src/interfaces.ts'

const FIELD = { x: 60, z: -5, radius: 22 }
const TUNING = { metres: 4000, loop: { min: 5, max: 10 } }
const START = { x: 15, z: 0 }
const NORTH = { x: 0, z: 1 }

const route = (seed: number) =>
  donutRoute(START, NORTH, FIELD, mulberry32(seed), TUNING)

const fromField = (p: XZ) => Math.hypot(p.x - FIELD.x, p.z - FIELD.z)

// The signed turn at each interior point, in radians.
function turns(points: readonly XZ[]): number[] {
  const out: number[] = []
  for (let i = 1; i < points.length - 1; i++) {
    const a = Math.atan2(
      points[i].z - points[i - 1].z,
      points[i].x - points[i - 1].x
    )
    const b = Math.atan2(
      points[i + 1].z - points[i].z,
      points[i + 1].x - points[i].x
    )
    out.push(Math.atan2(Math.sin(b - a), Math.cos(b - a)))
  }
  return out
}

describe('donutRoute', () => {
  it('draws the same path from the same seed', () => {
    expect(route(7)).toEqual(route(7))
    expect(route(7)).not.toEqual(route(8))
  })

  it('starts where the truck is parked and runs about as long as asked', () => {
    const points = route(1)
    expect(points[0]).toEqual(START)
    let length = 0
    for (let i = 1; i < points.length; i++) {
      const step = Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].z - points[i - 1].z
      )
      expect(step).toBeLessThanOrEqual(DONUT_STEP + 1e-9)
      length += step
    }
    expect(length).toBeGreaterThanOrEqual(TUNING.metres)
    expect(length).toBeLessThan(TUNING.metres * 1.2)
  })

  it('stays in the field once it gets there', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const points = route(seed)
      const arrived = points.findIndex((p) => fromField(p) < FIELD.radius)
      expect(arrived).toBeGreaterThan(0)
      for (const p of points.slice(arrived)) {
        // A dash can swing a few metres wide as it turns back in.
        expect(fromField(p)).toBeLessThan(FIELD.radius + 3)
      }
    }
  })

  it('turns both ways and never kinks', () => {
    const t = turns(route(3))
    expect(t.some((x) => x > 0.05)).toBe(true)
    expect(t.some((x) => x < -0.05)).toBe(true)
    // The tightest loop turns DONUT_STEP / loop.min a point, and no more
    // than about that where one set gives way to the next.
    for (const x of t) expect(Math.abs(x)).toBeLessThan(0.4)
  })

  it('loops at more than one radius', () => {
    const radii = new Set(
      turns(route(4))
        .filter((x) => Math.abs(x) > 0.1)
        .map((x) => Math.round(DONUT_STEP / Math.abs(x)))
    )
    expect(radii.size).toBeGreaterThan(1)
  })
})
