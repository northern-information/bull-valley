import { describe, expect, it } from 'vitest'
import {
  angelOf,
  atGrave,
  atShovel,
  candelabraOf,
  celestialPlaceOf,
  FENCE_POSTS,
  fenceOf,
  gatePiersOf,
  graveOf,
  inPrecinct,
  shovelOf,
  stonesOf,
} from '../../src/celestialyard.ts'
import { CONFIG } from '../../src/config.ts'
import { worldToMaze } from '../../src/maze.ts'

const C = CONFIG.celestial
const YARD = { x: 100, z: -40 }
const JERICHO = { x: 900, z: 560 }
const PLACE = celestialPlaceOf(YARD, JERICHO)
const local = (at: { x: number; z: number }) => worldToMaze(PLACE, at)

describe('the celestial graveyard', () => {
  it('turns its gate toward Jericho', () => {
    const toward = local(JERICHO)
    expect(toward.x).toBeGreaterThan(0)
    expect(Math.abs(toward.z)).toBeLessThan(1e-6)
    const [a, b] = gatePiersOf(PLACE).map(local)
    expect(a.x).toBeGreaterThan(C.radius - 1)
    expect(b.z - a.z).toBeCloseTo(C.gate)
  })

  it('stands the angel at the end of the avenue, her grave at her feet', () => {
    expect(local(angelOf(PLACE)).x).toBeCloseTo(C.angelAt)
    expect(local(graveOf(PLACE)).x).toBeCloseTo(C.grave.at)
    expect(local(graveOf(PLACE)).x).toBeGreaterThan(C.angelAt)
  })

  it('puts the shovel inside the gate, off the avenue', () => {
    const heap = local(shovelOf(PLACE))
    expect(Math.hypot(heap.x, heap.z)).toBeLessThan(C.radius)
    expect(Math.abs(heap.z)).toBeGreaterThan(C.avenue / 2)
  })

  it('reaches the heap and the grave only from near them', () => {
    const heap = shovelOf(PLACE)
    const grave = graveOf(PLACE)
    expect(atShovel(PLACE, heap)).toBe(true)
    expect(atShovel(PLACE, grave)).toBe(false)
    expect(atShovel(PLACE, null)).toBe(false)
    expect(atGrave(PLACE, grave)).toBe(true)
    expect(atGrave(PLACE, heap)).toBe(false)
    const edge = { x: grave.x + C.graveReach + 1, z: grave.z }
    expect(atGrave(PLACE, edge)).toBe(false)
    expect(atGrave(PLACE, edge, 2)).toBe(true)
  })

  it('fences the circle but for the gate', () => {
    const runs = fenceOf(PLACE)
    expect(runs).toHaveLength(FENCE_POSTS)
    for (const { a } of runs) {
      expect(Math.hypot(a.x - YARD.x, a.z - YARD.z)).toBeCloseTo(C.radius)
      // None stands across the gate's gap.
      const at = local(a)
      expect(Math.abs(at.z) >= C.gate / 2 - 1e-6 || at.x < 0).toBe(true)
    }
    expect(inPrecinct(PLACE, YARD.x, YARD.z)).toBe(true)
    expect(inPrecinct(PLACE, YARD.x + C.radius + 3, YARD.z)).toBe(false)
    expect(inPrecinct(PLACE, YARD.x + C.radius + 3, YARD.z, 5)).toBe(true)
  })

  it('strews the monuments the same every time, clear of the way in', () => {
    const stones = stonesOf(PLACE)
    expect(stones).toEqual(stonesOf(PLACE))
    expect(stones.length).toBeGreaterThan(C.stones / 2)
    for (const [i, s] of stones.entries()) {
      const at = local(s)
      expect(Math.hypot(at.x, at.z)).toBeLessThan(C.radius)
      expect(Math.abs(at.z) < C.avenue / 2 && at.x > C.angelAt).toBe(false)
      for (const t of stones.slice(i + 1)) {
        expect(Math.hypot(s.x - t.x, s.z - t.z)).toBeGreaterThanOrEqual(
          C.spacing
        )
      }
    }
  })

  it('lines the avenue with candelabra in pairs', () => {
    const spots = candelabraOf(PLACE)
    expect(spots.length % 2).toBe(0)
    for (const spot of spots) {
      expect(Math.abs(local(spot).z)).toBeGreaterThan(C.avenue / 2)
    }
  })
})
