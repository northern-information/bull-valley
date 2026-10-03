import { describe, expect, it } from 'vitest'
import {
  ringItems,
  stepIndex,
  syncIndex,
  wrapDelta,
} from '../../src/carousel.ts'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { createRaid } from '../../src/raid.ts'
import type { RingItem } from '../../src/interfaces.ts'

const kinds = (items: RingItem[]) => items.map((item) => item.kind)
const empty = { ...STARTING_INVENTORY, marlboro: 0, joints: 0 }
describe('ringItems', () => {
  it('shows only what the player carries, in item order', () => {
    const inv = { ...empty, newport: 1, camel: 3, joints: 1 }
    expect(kinds(ringItems(inv, createRaid(0)))).toEqual([
      'camel',
      'newport',
      'joints',
    ])
  })

  it('is empty when the pockets are', () => {
    expect(ringItems(empty, createRaid(0))).toEqual([])
  })

  it('lets cigarettes be used', () => {
    const [item] = ringItems({ ...empty, djarum: 1 }, createRaid(0))
    expect(item).toMatchObject({ kind: 'djarum', stock: 1, canUse: true })
  })

  it('carries drinks after joints, never usable', () => {
    const inv = { ...empty, nos: 1, joints: 1 }
    const items = ringItems(inv, createRaid(0))
    expect(kinds(items)).toEqual(['joints', 'nos'])
    expect(items[1]).toMatchObject({ stock: 1, canUse: false })
  })

  it('carries medicine after drinks, never usable', () => {
    const inv = { ...empty, benadryl: 2, 'ice-mountain': 1, aspirin: 1 }
    const items = ringItems(inv, createRaid(0))
    expect(kinds(items)).toEqual(['ice-mountain', 'aspirin', 'benadryl'])
    expect(items[2]).toMatchObject({ stock: 2, canUse: false })
  })

  it('carries cabbages as read-only cargo', () => {
    const raid = { ...createRaid(0), carrying: 2 }
    const items = ringItems(empty, raid)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'cabbage',
      stock: 2,
      canUse: false,
    })
  })

  it('shows the sack only once it is owned', () => {
    expect(kinds(ringItems(empty, createRaid(0)))).not.toContain('sack')
    const raid = { ...createRaid(0), sack: true }
    const sack = ringItems(empty, raid).find((item) => item.kind === 'sack')
    expect(sack).toMatchObject({ stock: 1, canUse: false })
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
  const ring = (kind: string): RingItem => ({
    kind,
    label: kind,
    blurb: '',
    stock: 1,
    canUse: false,
  })
  const items = [ring('camel'), ring('joints')]

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
