import { describe, expect, it } from 'vitest'
import {
  bilinearHeight,
  compassBearing,
  pointInPolygon,
  pointSegmentDistance,
  unitToWorld,
} from '../../src/coords.ts'
import type { Metres, UnitPoint } from '../../src/interfaces.ts'

// Illustrative fixtures for the pure math, deliberately NOT pinned to the
// current public/data/bull-valley/geo.json — the game reads metres at
// runtime, so the survey frame can change without touching these.
const METRES: Metres = { width: 9300, height: 10670 }

describe('coords', () => {
  it('centres the unit square on the world origin', () => {
    expect(unitToWorld(0.5, 0.5, METRES)).toEqual({ x: 0, z: 0 })
    expect(unitToWorld(0, 0, METRES)).toEqual({ x: -4650, z: -5335 })
    expect(unitToWorld(1, 1, METRES)).toEqual({ x: 4650, z: 5335 })
  })

  it('samples a height grid bilinearly', () => {
    // 2×2 grid: 0 across the top row, 1 across the bottom.
    const heights = Float32Array.from([0, 0, 1, 1])
    expect(bilinearHeight(heights, 2, 0, 0)).toBeCloseTo(0, 5)
    expect(bilinearHeight(heights, 2, 0.5, 1)).toBeCloseTo(1, 2)
    expect(bilinearHeight(heights, 2, 0.5, 0.5)).toBeCloseTo(0.5, 2)
    // Out-of-range samples clamp instead of reading out of bounds.
    expect(bilinearHeight(heights, 2, -1, 2)).toBeCloseTo(1, 2)
  })

  it('tests points against polygon rings', () => {
    const square: UnitPoint[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    expect(pointInPolygon(0.5, 0.5, square)).toBe(true)
    expect(pointInPolygon(1.5, 0.5, square)).toBe(false)
  })

  it('measures point-to-segment distance including endpoints', () => {
    expect(pointSegmentDistance(0, 1, -1, 0, 1, 0)).toBeCloseTo(1, 6)
    expect(pointSegmentDistance(3, 0, -1, 0, 1, 0)).toBeCloseTo(2, 6)
    expect(pointSegmentDistance(5, 5, 2, 2, 2, 2)).toBeCloseTo(
      Math.hypot(3, 3),
      6
    )
  })

  it('gives compass bearings with north at -z', () => {
    expect(compassBearing(0, -1)).toBeCloseTo(0, 5) // north
    expect(compassBearing(1, 0)).toBeCloseTo(90, 5) // east
    expect(compassBearing(0, 1)).toBeCloseTo(180, 5) // south
    expect(compassBearing(-1, 0)).toBeCloseTo(270, 5) // west
  })
})
