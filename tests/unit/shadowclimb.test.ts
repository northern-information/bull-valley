import { describe, expect, it } from 'vitest'
import {
  alongPath,
  CLING,
  crawl,
  nearestStair,
  pathLength,
  startClimb,
  wallBetween,
} from '../../src/shadowclimb.ts'
import type { StairPath } from '../../src/shadowclimb.ts'

// A cliff: the ground 30 m down for z under -10, flat at 0 elsewhere.
const cliff = (_x: number, z: number) => (z < -10 ? -30 : 0)
// The same cliff turned to run diagonally: down where x + z < 0.
const slant = (x: number, z: number) => (x + z < 0 ? -30 : 0)

describe('wallBetween', () => {
  it('finds no wall on level ground, nor on a slope a body climbs', () => {
    expect(wallBetween(cliff, { x: 0, z: 0 }, { x: 0, z: -5 }, 2)).toBeNull()
    const ramp = (_x: number, z: number) => z * 0.5
    expect(wallBetween(ramp, { x: 0, z: 0 }, { x: 0, z: 2 }, 2)).toBeNull()
  })

  it("finds the wall's line, its face's normal and its two heights", () => {
    for (const [from, to] of [
      [
        { x: 3, z: -9 },
        { x: 3, z: -11 },
      ],
      [
        { x: 3, z: -11 },
        { x: 3, z: -9 },
      ],
    ]) {
      const face = wallBetween(cliff, from, to, 2)!
      expect(face.x).toBeCloseTo(3)
      expect(face.z).toBeCloseTo(-10, 2)
      // The face looks out over the floor, toward -z.
      expect(face.nx).toBeCloseTo(0)
      expect(face.nz).toBeCloseTo(-1)
      expect(face.low).toBe(-30)
      expect(face.high).toBe(0)
    }
  })

  it('reads the normal of a wall crossed at a slant', () => {
    const face = wallBetween(slant, { x: 1, z: 0.5 }, { x: -1, z: 0 }, 2)!
    expect(face.nx).toBeCloseTo(-Math.SQRT1_2, 1)
    expect(face.nz).toBeCloseTo(-Math.SQRT1_2, 1)
  })
})

describe('startClimb and crawl', () => {
  const face = wallBetween(cliff, { x: 0, z: -9 }, { x: 0, z: -11 }, 2)!

  it('clings to the face, and steps off at the foot going down', () => {
    const { at, climb } = startClimb(face, 0)
    expect(at.z).toBeCloseTo(face.z - CLING)
    expect(climb.toY).toBe(-30)
    expect(cliff(climb.off.x, climb.off.z)).toBe(-30)
  })

  it('clings to the face, and steps off over the rim going up', () => {
    const { at, climb } = startClimb(face, -30)
    expect(at.z).toBeCloseTo(face.z - CLING)
    expect(climb.toY).toBe(0)
    expect(cliff(climb.off.x, climb.off.z)).toBe(0)
  })

  it('crawls toward the height it is going to, and says when it is there', () => {
    expect(crawl(0, -30, 4)).toEqual({ y: -4, there: false })
    expect(crawl(-30, 0, 4)).toEqual({ y: -26, there: false })
    expect(crawl(-2, 0, 4)).toEqual({ y: 0, there: true })
  })
})

describe('the stairs', () => {
  // Along the rim, down a flight 30 m long, and off at the foot.
  const path: StairPath = [
    { x: 0, z: 0, y: 0 },
    { x: 4, z: 0, y: 0 },
    { x: 4, z: 40, y: -30 },
    { x: 6, z: 40, y: -30 },
  ]

  it('measures a path up and down', () => {
    expect(pathLength(path)).toBeCloseTo(4 + 50 + 2)
  })

  it('finds the point along it either way, and its end', () => {
    expect(alongPath(path, 2)).toEqual({ x: 2, z: 0, y: 0, end: false })
    const mid = alongPath(path, 4 + 25)
    expect(mid.x).toBeCloseTo(4)
    expect(mid.z).toBeCloseTo(20)
    expect(mid.y).toBeCloseTo(-15)
    expect(alongPath(path, 1, true)).toEqual({
      x: 5,
      z: 40,
      y: -30,
      end: false,
    })
    expect(alongPath(path, 99)).toEqual({ x: 6, z: 40, y: -30, end: true })
    expect(alongPath(path, 99, true)).toEqual({ x: 0, z: 0, y: 0, end: true })
  })

  it('takes the nearest stair that goes the right way from its level', () => {
    const far: StairPath = path.map((p) => ({ ...p, x: p.x + 100 }))
    const paths = [far, path]
    // On the rim, after one on the floor: down from the nearest top.
    expect(nearestStair(paths, { x: 10, z: 0, y: 0 }, -30, 2)).toEqual({
      path: 1,
      down: true,
      end: { x: 0, z: 0 },
    })
    // On the floor, after one on the rim: up from the nearest foot.
    expect(nearestStair(paths, { x: 90, z: 40, y: -30 }, 0, 2)).toEqual({
      path: 0,
      down: false,
      end: { x: 106, z: 40 },
    })
    // Somewhere no stair starts from.
    expect(nearestStair(paths, { x: 0, z: 0, y: -12 }, -30, 2)).toBeNull()
    expect(nearestStair([], { x: 0, z: 0, y: 0 }, -30, 2)).toBeNull()
  })
})
