import { describe, expect, it } from 'vitest'
import {
  ringItems,
  stepIndex,
  syncIndex,
  wrapDelta,
} from '../../src/carousel.js'
import { STARTING_INVENTORY } from '../../src/inventory.js'
import { createRaid } from '../../src/raid.js'

const kinds = (items) => items.map((item) => item.kind)
const empty = { ...STARTING_INVENTORY, marlboro: 0, joints: 0 }
const shop = {
  marlboro: 2,
  camel: 0,
  parliament: 1,
  newport: 0,
  djarum: 0,
  joints: 2,
  monster: 0,
  'monster-ultra': 0,
  'red-bull': 2,
  'rip-it': 0,
  rockstar: 0,
  nos: 0,
  sack: 1,
}

describe('ringItems', () => {
  it('shows only what the player carries, in item order', () => {
    const inv = { ...empty, newport: 1, camel: 3, joints: 1 }
    expect(kinds(ringItems(inv, createRaid(0), null))).toEqual([
      'camel',
      'newport',
      'joints',
    ])
  })

  it('is empty when the pockets are', () => {
    expect(ringItems(empty, createRaid(0), null)).toEqual([])
  })

  it('adds tailgate stock the player does not carry, buyable not usable', () => {
    const items = ringItems({ ...empty, camel: 1 }, createRaid(0), shop)
    expect(kinds(items)).toEqual([
      'marlboro',
      'camel',
      'parliament',
      'joints',
      'red-bull',
      'sack',
    ])
    const marlboro = items[0]
    expect(marlboro).toMatchObject({
      stock: 0,
      tailgate: 2,
      canUse: false,
      canBuy: true,
    })
    expect(items[1]).toMatchObject({ stock: 1, tailgate: 0, canBuy: false })
  })

  it('leaves tailgate null away from the tailgate', () => {
    const [item] = ringItems({ ...empty, djarum: 1 }, createRaid(0), null)
    expect(item).toMatchObject({ tailgate: null, canUse: true, canBuy: false })
  })

  it('carries drinks after joints, buyable but never usable', () => {
    const inv = { ...empty, nos: 1, joints: 1 }
    const items = ringItems(inv, createRaid(0), shop)
    expect(kinds(items).slice(-4)).toEqual([
      'joints',
      'red-bull',
      'nos',
      'sack',
    ])
    expect(items.find((item) => item.kind === 'nos')).toMatchObject({
      stock: 1,
      tailgate: 0,
      canUse: false,
      canBuy: false,
    })
    expect(items.find((item) => item.kind === 'red-bull')).toMatchObject({
      stock: 0,
      tailgate: 2,
      canUse: false,
      canBuy: true,
    })
  })

  it('carries cabbages as read-only cargo', () => {
    const raid = { ...createRaid(0), carrying: 2 }
    const items = ringItems(empty, raid, null)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'cabbage',
      stock: 2,
      canUse: false,
      canBuy: false,
    })
  })

  it('shows an owned sack, never for sale twice', () => {
    const raid = { ...createRaid(0), sack: true }
    const items = ringItems(empty, raid, { ...shop, sack: 0 })
    const sack = items.find((item) => item.kind === 'sack')
    expect(sack).toMatchObject({ stock: 1, tailgate: 0, canBuy: false })
    expect(
      kinds(ringItems(empty, createRaid(0), { ...shop, sack: 0 }))
    ).not.toContain('sack')
  })
})

describe('stepIndex', () => {
  it('wraps both ways', () => {
    expect(stepIndex(2, 3, 1)).toBe(0)
    expect(stepIndex(0, 3, -1)).toBe(2)
    expect(stepIndex(1, 3, 1)).toBe(2)
  })

  it('stays at 0 on an empty ring', () => {
    expect(stepIndex(0, 0, 1)).toBe(0)
  })
})

describe('syncIndex', () => {
  const items = [{ kind: 'camel' }, { kind: 'joints' }]

  it('follows the selected kind when the ring shifts', () => {
    expect(syncIndex(items, 'joints', 2)).toBe(1)
  })

  it('stays at the same slot, clamped, when the kind left', () => {
    expect(syncIndex(items, 'marlboro', 0)).toBe(0)
    expect(syncIndex(items, 'newport', 5)).toBe(1)
  })

  it('is 0 on an empty ring', () => {
    expect(syncIndex([], 'camel', 3)).toBe(0)
  })
})

describe('wrapDelta', () => {
  it('takes the short way round', () => {
    expect(wrapDelta(0, 1, 5)).toBe(1)
    expect(wrapDelta(0, 4, 5)).toBe(-1)
    expect(wrapDelta(4, 0, 5)).toBe(1)
    expect(wrapDelta(4.5, 0, 5)).toBe(0.5)
  })

  it('is 0 on an empty ring', () => {
    expect(wrapDelta(0, 0, 0)).toBe(0)
  })
})
