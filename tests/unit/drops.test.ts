import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  centsOf,
  DIMES,
  dimesFor,
  dropAmount,
  dropSpot,
  GOLD_BULLION,
  isCash,
  spillsOf,
  takeUp,
  TWENTY,
} from '../../src/drops.ts'
import { contentsOf } from '../../src/items.ts'
import { mulberry32 } from '../../src/rng.ts'

describe('dimes', () => {
  it('are cash, and nothing else is', () => {
    expect(isCash(DIMES)).toBe(true)
    expect(isCash('cabbage')).toBe(false)
  })

  it('come min to max from a burst, every count reached', () => {
    const { min, max } = CONFIG.shadowmen.dimes
    const rng = mulberry32(7)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) seen.add(dimesFor(rng))
    expect(Math.min(...seen)).toBe(min)
    expect(Math.max(...seen)).toBe(max)
    expect(seen.size).toBe(max - min + 1)
  })
})

describe('a twenty', () => {
  it('is cash worth $20, as dimes are worth 10 cents', () => {
    expect(isCash(TWENTY)).toBe(true)
    expect(centsOf(TWENTY)).toBe(2000)
    expect(centsOf(DIMES)).toBe(10)
    expect(centsOf('cabbage')).toBe(0)
  })

  it('is what a spider leaves, one bill where it burst', () => {
    const spills = spillsOf(
      [
        { x: 1, z: 2, kind: 'spider' },
        { x: 3, z: 4, kind: 'man' },
      ],
      null,
      mulberry32(3)
    )
    expect(spills[0]).toEqual({ x: 1, z: 2, kind: TWENTY, count: 1 })
    expect(spills[1]).toMatchObject({ x: 3, z: 4, kind: DIMES })
  })
})

describe('spillsOf', () => {
  it('leaves dimes at each burst, and two 1 troy ounce bars where the Caretaker was unmade', () => {
    const rng = mulberry32(3)
    const spills = spillsOf([{ x: 1, z: 2 }], { x: 5, z: 6 }, rng)
    expect(spills).toHaveLength(3)
    expect(spills[0]).toMatchObject({ x: 1, z: 2, kind: DIMES })
    const bars = spills.slice(1)
    expect(CONFIG.caretaker.bullion).toBe(2)
    for (const bar of bars) {
      expect(bar).toMatchObject({ kind: GOLD_BULLION, count: 1 })
      expect(Math.hypot(bar.x - 5, bar.z - 6)).toBeLessThan(0.5)
    }
    // Side by side, never on top of each other.
    const [one, two] = bars
    expect(Math.hypot(one.x - two.x, one.z - two.z)).toBeGreaterThan(0.2)
    expect(isCash(GOLD_BULLION)).toBe(false)
  })

  it('leaves nothing when nothing burst or was unmade', () => {
    expect(spillsOf([], null, mulberry32(3))).toEqual([])
  })
})

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
