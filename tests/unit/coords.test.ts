import { describe, expect, it } from 'vitest'
import {
  bilinearHeight,
  compassBearing,
  pointInPolygon,
  pointSegmentDistance,
  projectOnSegment,
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

  it('projects a point onto a segment, clamped to its ends', () => {
    // Beside the middle: lands at the middle, halfway along.
    expect(projectOnSegment(0, 1, -1, 0, 1, 0)).toEqual({
      x: 0,
      y: 0,
      t: 0.5,
      dist: 1,
    })
    // Past the end: clamps to b.
    const past = projectOnSegment(3, 0, -1, 0, 1, 0)
    expect(past).toMatchObject({ x: 1, y: 0, t: 1 })
    expect(past.dist).toBeCloseTo(2, 6)
    // A zero-length segment projects onto its one point.
    const point = projectOnSegment(5, 5, 2, 2, 2, 2)
    expect(point).toMatchObject({ x: 2, y: 2, t: 0 })
    expect(point.dist).toBeCloseTo(Math.hypot(3, 3), 6)
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
