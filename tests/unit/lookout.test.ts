import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  LADDER_FOOT,
  LADDER_TOP,
  LOOKOUT,
  lookoutPlace,
  lookoutToWorld,
  lookoutWalls,
  onLookout,
} from '../../src/lookout.ts'
import { mazeToWorld } from '../../src/maze.ts'

const MAZE = { x: 300, z: -120, yaw: 1.1 }

describe('the lookout tower', () => {
  it('stands in the maze’s frame, turned as the maze is', () => {
    const place = lookoutPlace(MAZE)
    const at = mazeToWorld(MAZE, CONFIG.maze.lookout.at)
    expect(place.x).toBeCloseTo(at.x)
    expect(place.z).toBeCloseTo(at.z)
    expect(place.yaw).toBe(MAZE.yaw)
    const middle = lookoutToWorld(MAZE, { x: 0, z: 0 })
    expect(middle.x).toBeCloseTo(at.x)
    expect(middle.z).toBeCloseTo(at.z)
  })

  it('counts a point over the deck as on it, and a step past as not', () => {
    const over = (x: number, z: number, margin?: number) =>
      onLookout(MAZE, lookoutToWorld(MAZE, { x, z }), margin)
    const h = LOOKOUT.half
    expect(over(0, 0)).toBe(true)
    expect(over(h - 0.1, -(h - 0.1))).toBe(true)
    expect(over(h + 0.1, 0)).toBe(false)
    expect(over(0, -h - 0.1)).toBe(false)
    expect(over(h + 0.5, 0, 1)).toBe(true)
  })

  it('walls the footprint all round, corner to corner', () => {
    const sides = lookoutWalls().filter((w) => w.half === LOOKOUT.wallHalf)
    expect(sides).toHaveLength(4)
    sides.forEach((w, i) => {
      const next = sides[(i + 1) % sides.length]
      expect(w.b).toEqual(next.a)
      expect(Math.max(Math.abs(w.a.x), Math.abs(w.a.z))).toBe(LOOKOUT.half)
    })
    // A post at each leg's foot, outside the square.
    const legs = lookoutWalls().filter((w) => w.half === LOOKOUT.legHalf)
    expect(legs).toHaveLength(4)
    for (const leg of legs) {
      expect(Math.abs(leg.a.x)).toBeGreaterThan(LOOKOUT.half)
    }
  })

  it('puts the ladder’s foot off the deck and its top on it', () => {
    const foot = lookoutToWorld(MAZE, LADDER_FOOT)
    const top = lookoutToWorld(MAZE, LADDER_TOP)
    expect(onLookout(MAZE, foot)).toBe(false)
    expect(onLookout(MAZE, top)).toBe(true)
    // Clear of the walls either side, with room for a raider.
    const room = LOOKOUT.wallHalf + CONFIG.player.radius
    expect(-LOOKOUT.half - LADDER_FOOT.x).toBeGreaterThan(room)
    expect(LADDER_TOP.x + LOOKOUT.half).toBeGreaterThan(room)
  })
})
