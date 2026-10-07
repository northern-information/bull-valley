import { describe, expect, it } from 'vitest'
import { NO_EFFECTS } from '../../src/hotbar.ts'
import {
  addItem,
  consume,
  KINDS,
  STARTING_INVENTORY,
  toInventory,
  useItem,
} from '../../src/inventory.ts'
import { getItem, tripSecondsOf } from '../../src/items.ts'
import type { Inventory } from '../../src/interfaces.ts'

describe('inventory', () => {
  it('adds and uses items without going negative', () => {
    let inv: Inventory = { ...STARTING_INVENTORY, marlboro: 1, joints: 0 }
    inv = addItem(inv, 'joints', 2)
    expect(inv.joints).toBe(2)
    const used = useItem(inv, 'marlboro')
    expect(used.used).toBe(true)
    expect(used.inv.marlboro).toBe(0)
    const empty = useItem(used.inv, 'marlboro')
    expect(empty.used).toBe(false)
    expect(empty.inv.marlboro).toBe(0)
  })

  it('starts with every kind present', () => {
    expect(Object.keys(STARTING_INVENTORY).sort()).toEqual([...KINDS].sort())
    expect(STARTING_INVENTORY).toMatchObject({ marlboro: 2, joints: 1 })
  })

  it('fills missing kinds, clamps bad counts, and drops strangers', () => {
    // Junk on purpose: what a garbled frame or a stale row could hold.
    const inv = toInventory({ camel: -3, parliament: 'x', joints: 2.9, x: 4 })
    expect(inv.camel).toBe(0)
    expect(inv.parliament).toBe(0)
    expect(inv.joints).toBe(2)
    expect(inv.djarum).toBe(0)
    expect(inv).not.toHaveProperty('x')
    expect(toInventory(null)).toEqual(toInventory({}))
  })
})

describe('consume', () => {
  const pack: Inventory = { ...STARTING_INVENTORY, marlboro: 2, joints: 1 }

  it('smokes a cigarette, then lets it smoulder', () => {
    const r = consume(pack, 'marlboro', NO_EFFECTS, 10)
    if (!r.used) throw new Error('not used')
    const { smokeSeconds = 0, emberSeconds = 0 } = getItem('marlboro')
    expect(r.inv.marlboro).toBe(1)
    expect(r.effects.smoking).toEqual({ start: 10, end: 10 + smokeSeconds })
    expect(r.effects.ember).toEqual({
      start: 10 + smokeSeconds,
      end: 10 + smokeSeconds + emberSeconds,
    })
    expect(r.effects.perception).toEqual(NO_EFFECTS.perception)
  })

  it('will not light a second cigarette while one burns', () => {
    const r = consume(pack, 'marlboro', NO_EFFECTS, 10)
    if (!r.used) throw new Error('not used')
    expect(consume(r.inv, 'camel', r.effects, 11)).toEqual({
      used: false,
      reason: 'smoking',
    })
  })

  it('sparks a joint into perception, even mid-smoke', () => {
    const smoking = { ...NO_EFFECTS, smoking: { start: 0, end: 50 } }
    const r = consume(pack, 'joints', smoking, 10)
    if (!r.used) throw new Error('not used')
    expect(r.inv.joints).toBe(0)
    expect(r.effects.perception).toEqual({
      start: 10,
      end: 10 + (getItem('joints').perceptionSeconds ?? 0),
    })
    expect(r.effects.smoking).toEqual({ start: 0, end: 50 })
  })

  it('drinks a drink into a trip, and nothing else', () => {
    const r = consume({ ...pack, pbr: 1 }, 'pbr', NO_EFFECTS, 10)
    if (!r.used) throw new Error('not used')
    expect(r.inv.pbr).toBe(0)
    expect(r.effects).toEqual({
      ...NO_EFFECTS,
      trip: { start: 10, end: 10 + tripSecondsOf('pbr') },
    })
  })

  it('starts each trip afresh, keeping a longer one going', () => {
    const r = consume(pack, 'joints', NO_EFFECTS, 10)
    if (!r.used) throw new Error('not used')
    const end = 10 + tripSecondsOf('joints')
    expect(r.effects.trip).toEqual({ start: 10, end })
    const lit = consume(r.inv, 'marlboro', r.effects, 20)
    if (!lit.used) throw new Error('not used')
    expect(lit.effects.trip).toEqual({ start: 20, end })
    const later = consume(lit.inv, 'marlboro', lit.effects, end + 100)
    if (!later.used) throw new Error('not used')
    expect(later.effects.trip).toEqual({
      start: end + 100,
      end: end + 100 + tripSecondsOf('marlboro'),
    })
  })

  it('says why nothing happened', () => {
    expect(consume({ ...pack, joints: 0 }, 'joints', NO_EFFECTS, 0)).toEqual({
      used: false,
      reason: 'empty',
    })
    expect(consume(pack, 'aspirin', NO_EFFECTS, 0)).toEqual({
      used: false,
      reason: 'unusable',
    })
    expect(consume(pack, 'nope', NO_EFFECTS, 0)).toEqual({
      used: false,
      reason: 'unusable',
    })
  })
})
