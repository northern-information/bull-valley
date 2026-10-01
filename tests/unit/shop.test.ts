import { describe, expect, it } from 'vitest'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { getItem, shopStock } from '../../src/items.ts'
import { createRaid, STATES } from '../../src/raid.ts'
import { buy } from '../../src/shop.ts'
import type { ShopState } from '../../src/shop.ts'

function fresh(): ShopState {
  return {
    raid: createRaid(0),
    stock: shopStock(),
    inventory: { ...STARTING_INVENTORY },
  }
}

describe('buy', () => {
  it('moves one item from the tailgate to the inventory', () => {
    const state = fresh()
    const before = Object.freeze({ ...state.stock })
    const { next, toast } = buy(state, 'marlboro', 5)
    expect(next?.stock.marlboro).toBe(before.marlboro - 1)
    expect(next?.inventory.marlboro).toBe(state.inventory.marlboro + 1)
    expect(next?.raid).toBe(state.raid)
    expect(toast).toBe(getItem('marlboro').bought)
    // The input is never changed.
    expect(state.stock).toEqual(before)
  })

  it('says the tailgate is bare once the stock runs out', () => {
    let state = fresh()
    for (let i = 0; i < getItem('marlboro').shopCap; i++) {
      const { next } = buy(state, 'marlboro', 5)
      if (!next) throw new Error('expected a sale')
      state = next
    }
    expect(buy(state, 'marlboro', 5)).toEqual({
      next: null,
      toast: 'The tailgate is bare.',
    })
  })

  it('sells the sack once, into the raid and not the inventory', () => {
    const state = fresh()
    const { next, toast } = buy(state, 'sack', 5)
    expect(next?.raid.sack).toBe(true)
    expect(next?.stock.sack).toBe(0)
    expect(next?.inventory).toBe(state.inventory)
    expect(toast).toBe(getItem('sack').bought)
    if (!next) throw new Error('expected a sale')
    expect(buy(next, 'sack', 6)).toEqual({ next: null, toast: null })
  })

  it('sells no sack after the loadout', () => {
    const state = fresh()
    const riding = { ...state, raid: { ...state.raid, state: STATES.RIDING } }
    expect(buy(riding, 'sack', 5)).toEqual({ next: null, toast: null })
  })
})
