import { describe, expect, it } from 'vitest'
import { clamp01, GOLDEN_ANGLE, goldenSpot } from '../../src/math.ts'

describe('math', () => {
  it('clamps between 0 and 1', () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(0.25)).toBe(0.25)
    expect(clamp01(7)).toBe(1)
  })

  it('spreads things round a circle by the golden angle', () => {
    const at = { x: 10, z: -4 }
    const spots = [0, 1, 2, 3].map((id) => goldenSpot(at, id, 2))
    for (const s of spots) {
      expect(Math.hypot(s.x - at.x, s.z - at.z)).toBeCloseTo(2)
    }
    expect(spots[0]).toEqual({ x: 12, z: -4 })
    expect(spots[1].x).toBeCloseTo(at.x + Math.cos(GOLDEN_ANGLE) * 2)
    // No two in line.
    const angles = spots.map((s) => Math.atan2(s.z - at.z, s.x - at.x))
    expect(new Set(angles.map((a) => a.toFixed(6))).size).toBe(4)
  })
})
