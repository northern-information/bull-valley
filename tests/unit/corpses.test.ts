import { describe, expect, it } from 'vitest'
import {
  corpseWire,
  emptied,
  fallen,
  isEmpty,
  nearestCorpse,
  recover,
} from '../../src/corpses.ts'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import type { Corpse } from '../../src/corpses.ts'

const body = (id: number, x: number, z: number): Corpse => ({
  id,
  x,
  z,
  yaw: 0,
  name: 'Raider',
  outfit: 'coleman',
  items: { joints: 1 },
})

describe('a fall', () => {
  it('leaves every kind the pack holds on the body, and nothing else', () => {
    expect(
      fallen({ joints: 2, marlboro: 0, pebbles: 4, 'gold-bullion': 1.6 })
    ).toEqual({ joints: 2, 'gold-bullion': 1 })
    expect(fallen({ joints: -3 })).toEqual({})
  })

  it('leaves no body for an empty pack', () => {
    expect(isEmpty(fallen({ joints: 0 }))).toBe(true)
    expect(isEmpty({})).toBe(true)
    expect(isEmpty({ joints: 1 })).toBe(false)
  })

  it('empties the pack, every kind at zero', () => {
    const empty = emptied(STARTING_INVENTORY)
    expect(Object.keys(empty)).toEqual(Object.keys(STARTING_INVENTORY))
    expect(Object.values(empty).every((n) => n === 0)).toBe(true)
  })
})

describe('taking it back', () => {
  it('puts the things back on top of what the pack holds now', () => {
    expect(
      recover({ joints: 1, berries: 2 }, { joints: 2, marlboro: 5 })
    ).toEqual({ joints: 3, berries: 2, marlboro: 5 })
    expect(recover({ joints: 1 }, { joints: 0 })).toEqual({ joints: 1 })
  })

  it('shows a body without what it holds', () => {
    expect(corpseWire(body(3, 1, 2))).toEqual({
      id: 3,
      x: 1,
      z: 2,
      yaw: 0,
      name: 'Raider',
      outfit: 'coleman',
    })
  })

  it('finds the nearest of your own bodies within reach', () => {
    const bodies = [body(0, 0, 0), body(1, 1, 0), body(2, 0.5, 0)]
    const at = { x: 0.9, z: 0 }
    expect(nearestCorpse(bodies, [0, 1, 2], at, 2)?.id).toBe(1)
    // Another's body is never yours to take.
    expect(nearestCorpse(bodies, [0, 2], at, 2)?.id).toBe(2)
    expect(nearestCorpse(bodies, [0], at, 0.5)).toBeNull()
    expect(nearestCorpse(bodies, [], at, 10)).toBeNull()
  })
})
