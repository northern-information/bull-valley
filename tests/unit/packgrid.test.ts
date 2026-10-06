import { describe, expect, it } from 'vitest'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { packItemOf, packItems } from '../../src/packgrid.ts'
import { createRaid } from '../../src/raid.ts'
import type { PackItem } from '../../src/interfaces.ts'

const kinds = (items: PackItem[]) => items.map((item) => item.kind)
const empty = { ...STARTING_INVENTORY, marlboro: 0, joints: 0 }
describe('packItems', () => {
  it('shows only what the player carries, in item order', () => {
    const inv = { ...empty, newport: 1, camel: 3, joints: 1 }
    expect(kinds(packItems(inv, createRaid(0)))).toEqual([
      'camel',
      'newport',
      'joints',
    ])
  })

  it('is empty when the pockets are', () => {
    expect(packItems(empty, createRaid(0))).toEqual([])
  })

  it('lets cigarettes be used', () => {
    const [item] = packItems({ ...empty, djarum: 1 }, createRaid(0))
    expect(item).toMatchObject({ kind: 'djarum', stock: 1, canUse: true })
  })

  it('carries drinks after joints, never usable', () => {
    const inv = { ...empty, nos: 1, joints: 1 }
    const items = packItems(inv, createRaid(0))
    expect(kinds(items)).toEqual(['joints', 'nos'])
    expect(items[1]).toMatchObject({ stock: 1, canUse: false })
  })

  it('carries medicine after drinks, never usable', () => {
    const inv = { ...empty, benadryl: 2, 'ice-mountain': 1, aspirin: 1 }
    const items = packItems(inv, createRaid(0))
    expect(kinds(items)).toEqual(['ice-mountain', 'aspirin', 'benadryl'])
    expect(items[2]).toMatchObject({ stock: 2, canUse: false })
  })

  it('carries cabbages as read-only cargo', () => {
    const raid = { ...createRaid(0), carrying: 2 }
    const items = packItems(empty, raid)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'cabbage',
      stock: 2,
      canUse: false,
    })
  })

  it('shows the sack only once it is owned', () => {
    expect(kinds(packItems(empty, createRaid(0)))).not.toContain('sack')
    const raid = { ...createRaid(0), sack: true }
    const sack = packItems(empty, raid).find((item) => item.kind === 'sack')
    expect(sack).toMatchObject({ stock: 1, canUse: false })
  })
})

describe('packItemOf', () => {
  it('keeps a used-up item at 0', () => {
    expect(packItemOf('camel', empty, createRaid(0))).toMatchObject({
      kind: 'camel',
      stock: 0,
      canUse: true,
    })
  })

  it('shows cabbages and the sack from the raid', () => {
    const raid = { ...createRaid(0), carrying: 2, sack: true }
    expect(packItemOf('cabbage', empty, raid)).toMatchObject({ stock: 2 })
    expect(packItemOf('sack', empty, raid)).toMatchObject({ stock: 1 })
    expect(packItemOf('sack', empty, createRaid(0))).toMatchObject({
      stock: 0,
    })
  })

  it('is null for a kind the game does not know', () => {
    expect(packItemOf('anvil', empty, createRaid(0))).toBeNull()
  })
})
