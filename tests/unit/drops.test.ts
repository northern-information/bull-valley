import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { dropAmount, dropSpot, takeUp } from '../../src/drops.ts'
import { contentsOf } from '../../src/items.ts'

describe('dropAmount', () => {
  it('drops the open container, or one of anything else', () => {
    const pack = contentsOf('marlboro')
    expect(pack).toBeGreaterThan(1)
    // A full pack and an open one of 7: the open one goes.
    expect(dropAmount('marlboro', pack + 7, false)).toBe(7)
    // Two full packs: one of them.
    expect(dropAmount('marlboro', pack * 2, false)).toBe(pack)
    expect(dropAmount('joints', 5, false)).toBe(1)
    expect(dropAmount('cabbage', 3, false)).toBe(1)
  })

  it('drops the whole stack, and nothing from nothing', () => {
    expect(dropAmount('marlboro', 27, true)).toBe(27)
    expect(dropAmount('cabbage', 3, true)).toBe(3)
    expect(dropAmount('joints', 0, false)).toBe(0)
    expect(dropAmount('joints', 0, true)).toBe(0)
  })
})

describe('dropSpot', () => {
  it('lands ahead of the raider, spread round a small circle by id', () => {
    const at = { x: 10, z: 20, yaw: 0 }
    const { ahead, scatter } = CONFIG.drops
    const spots = [0, 1, 2, 3].map((id) => dropSpot(at, id))
    for (const spot of spots) {
      // Ahead is -z at yaw 0.
      const centre = { x: at.x, z: at.z - ahead }
      expect(Math.hypot(spot.x - centre.x, spot.z - centre.z)).toBeCloseTo(
        scatter
      )
    }
    const keys = new Set(
      spots.map((s) => `${s.x.toFixed(3)},${s.z.toFixed(3)}`)
    )
    expect(keys.size).toBe(spots.length)
    // Facing +x (yaw -π/2), it lands at larger x.
    expect(dropSpot({ ...at, yaw: -Math.PI / 2 }, 0).x).toBeGreaterThan(at.x)
  })
})

describe('takeUp', () => {
  const drop = { id: 3, kind: 'cabbage', count: 3, x: 0, z: 0 }

  it('takes all that the room allows, leaving the rest', () => {
    expect(takeUp(drop, Infinity)).toEqual({ taken: 3, left: null })
    expect(takeUp(drop, 3)).toEqual({ taken: 3, left: null })
    expect(takeUp(drop, 1)).toEqual({ taken: 1, left: { ...drop, count: 2 } })
    expect(takeUp(drop, 0)).toEqual({ taken: 0, left: drop })
  })
})
