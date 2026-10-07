import { describe, expect, it } from 'vitest'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { contentsOf } from '../../src/items.ts'
import { PACK_TABS, packItemOf, packItems } from '../../src/packgrid.ts'
import { createRaid } from '../../src/raid.ts'
import type { Inventory, PackItem } from '../../src/interfaces.ts'

const kinds = (items: PackItem[]) => items.map((item) => item.kind)
const empty: Inventory = { ...STARTING_INVENTORY, marlboro: 0, joints: 0 }
const consumables = (inv: Inventory, raid = createRaid(0)) =>
  packItems(inv, raid, 'consumables')

describe('PACK_TABS', () => {
  it('opens on consumables, with loot beside it', () => {
    expect(PACK_TABS).toEqual(['consumables', 'loot', 'materials'])
  })
})

describe('packItems', () => {
  it('shows only what the player carries, in item order', () => {
    const inv = { ...empty, newport: 1, camel: 3, joints: 1 }
    expect(kinds(consumables(inv))).toEqual(['camel', 'newport', 'joints'])
  })

  it('is empty when the pockets are', () => {
    for (const tab of PACK_TABS) {
      expect(packItems(empty, createRaid(0), tab)).toEqual([])
    }
  })

  it('lets cigarettes be used', () => {
    const [item] = consumables({ ...empty, djarum: 1 })
    expect(item).toMatchObject({ kind: 'djarum', stock: 1, canUse: true })
  })

  it('counts packs, with what is left in the open one', () => {
    const per = contentsOf('marlboro')
    const [item] = consumables({ ...empty, marlboro: per * 2 + 3 })
    expect(item).toMatchObject({ stock: 3, left: 3 })
    const [full] = consumables({ ...empty, marlboro: per })
    expect(full).toMatchObject({ stock: 1, left: per })
  })

  it('counts one-to-a-container items as they are', () => {
    const [item] = consumables({ ...empty, joints: 2 })
    expect(item).toMatchObject({ stock: 2, left: null })
  })

  it('carries drinks after joints, to be drunk', () => {
    const items = consumables({ ...empty, nos: 1, joints: 1 })
    expect(kinds(items)).toEqual(['joints', 'nos'])
    expect(items[1]).toMatchObject({ stock: 1, canUse: true })
  })

  it('carries medicine after drinks, never usable', () => {
    const inv = { ...empty, benadryl: 2, 'ice-mountain': 1, aspirin: 1 }
    const items = consumables(inv)
    expect(kinds(items)).toEqual(['ice-mountain', 'aspirin', 'benadryl'])
    expect(items[2]).toMatchObject({ stock: 1, left: 2, canUse: false })
  })

  it('keeps berries and cabbages in loot, and out of consumables', () => {
    const inv = { ...empty, berries: 1, camel: 1 }
    const raid = { ...createRaid(0), carrying: 2 }
    expect(kinds(packItems(inv, raid, 'loot'))).toEqual(['berries', 'cabbage'])
    expect(kinds(consumables(inv, raid))).toEqual(['camel'])
    expect(packItems(inv, raid, 'materials')).toEqual([])
  })

  it('carries cabbages as read-only cargo', () => {
    const raid = { ...createRaid(0), carrying: 2 }
    const items = packItems(empty, raid, 'loot')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'cabbage',
      stock: 2,
      canUse: false,
    })
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

  it('shows cabbages from the raid', () => {
    const raid = { ...createRaid(0), carrying: 2 }
    expect(packItemOf('cabbage', empty, raid)).toMatchObject({ stock: 2 })
  })

  it('is null for a kind the game does not know', () => {
    expect(packItemOf('anvil', empty, createRaid(0))).toBeNull()
    expect(packItemOf('sack', empty, createRaid(0))).toBeNull()
  })
})
