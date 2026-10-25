import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { INDUSTRIAL, parkOrigin } from '../../src/industrial.ts'
import { lairsOf, nearLair } from '../../src/lairs.ts'
import { MOAT } from '../../src/moat.ts'
import { toLocal } from '../../src/store.ts'
import { STRIP_MALL } from '../../src/stripmall.ts'

// A station turned off true, so the lairs must turn with it.
const STATION = { x: 100, z: -50, yaw: 0.7, y: 0 }

describe("the spiders' lairs", () => {
  const [dishes, castle, plaza, park] = lairsOf(STATION)
  const local = (p: { x: number; z: number }) => toLocal(STATION, p.x, p.z)

  it('rounds the dish array behind the Citgo, out to its corners', () => {
    const { rows, cols, first, spacing } = CONFIG.dishes
    const middle = local(dishes)
    expect(middle.x).toBeCloseTo(first - ((rows - 1) * spacing) / 2)
    expect(middle.z).toBeCloseTo(0)
    expect(dishes.radius).toBeCloseTo(
      Math.hypot(((rows - 1) * spacing) / 2, ((cols - 1) * spacing) / 2)
    )
  })

  it("rounds Castle Entropy's moat, out to its farthest outer corner", () => {
    const middle = local(castle)
    expect(middle.x).toBeCloseTo(CONFIG.castle.at.x)
    expect(middle.z).toBeCloseTo(CONFIG.castle.at.z)
    for (const p of MOAT.outer) {
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(castle.radius + 1e-9)
    }
  })

  it('rounds Bull Valley Plaza, back from its front wall', () => {
    const middle = local(plaza)
    expect(middle.x).toBeCloseTo(CONFIG.stripMall.at.x - STRIP_MALL.depth / 2)
    expect(middle.z).toBeCloseTo(CONFIG.stripMall.at.z)
    expect(plaza.radius).toBeCloseTo(
      Math.hypot(STRIP_MALL.depth / 2, STRIP_MALL.length / 2)
    )
  })

  it('rounds the industrial park, out to every corner of its asphalt', () => {
    const { x0, x1, z0, z1 } = INDUSTRIAL.pad
    const origin = parkOrigin(STATION)
    for (const [x, z] of [
      [x0, z0],
      [x0, z1],
      [x1, z0],
      [x1, z1],
    ]) {
      const p = local({
        x: origin.x + Math.cos(origin.yaw) * x - Math.sin(origin.yaw) * z,
        z: origin.z + Math.sin(origin.yaw) * x + Math.cos(origin.yaw) * z,
      })
      const m = local(park)
      expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeCloseTo(park.radius)
    }
    expect(local(park).x).toBeLessThan(CONFIG.industrial.at.x)
  })

  it('is near within its reach past the edge, and not past it', () => {
    const lairs = [{ x: 0, z: 0, radius: 40 }]
    expect(nearLair(lairs, { x: 0, z: 0 }, 120)).toBe(true)
    expect(nearLair(lairs, { x: 160, z: 0 }, 120)).toBe(true)
    expect(nearLair(lairs, { x: 0, z: 161 }, 120)).toBe(false)
    expect(nearLair([], { x: 0, z: 0 }, 120)).toBe(false)
  })
})
