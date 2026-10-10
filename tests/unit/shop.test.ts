import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { contentsOf, getItem } from '../../src/items.ts'
import { buy, settle } from '../../src/shop.ts'
import { freshStock } from '../../src/store.ts'
import { unitsLeft } from './stock.ts'
import type { ShopState } from '../../src/shop.ts'

function fresh(over: Partial<ShopState> = {}): ShopState {
  return {
    stock: freshStock(2),
    inventory: { ...STARTING_INVENTORY },
    cash: CONFIG.store.startingCash,
    ...over,
  }
}

describe('buy', () => {
  it('moves one unit off that station’s shelf, for its price', () => {
    const state = fresh()
    const before = state.stock.map((s) => Object.freeze({ ...s }))
    const { next, line } = buy(state, 1, 'marlboro', 0)
    expect(next?.stock[1].marlboro).toEqual([false, true, true])
    expect(unitsLeft(next?.stock[0], 'marlboro')).toBe(CONFIG.store.perItem)
    expect(next?.inventory.marlboro).toBe(
      state.inventory.marlboro + contentsOf('marlboro')
    )
    expect(next?.cash).toBe(state.cash - getItem('marlboro').price)
    expect(line).toBe(getItem('marlboro').bought)
    // The input is never changed.
    expect(state.stock).toEqual(before)
  })

  it('takes the unit picked, and says sold out once it is gone', () => {
    const { next } = buy(fresh(), 0, 'pbr', 2)
    if (!next) throw new Error('expected a sale')
    expect(next.stock[0].pbr).toEqual([true, true, false])
    expect(buy(next, 0, 'pbr', 2)).toEqual({
      next: null,
      line: copy('log.sold_out'),
    })
    // Its neighbours are still there.
    expect(buy(next, 0, 'pbr', 0).next?.stock[0].pbr).toEqual([
      false,
      true,
      false,
    ])
  })

  it('says sold out for a slot past the facing', () => {
    expect(buy(fresh(), 0, 'pbr', CONFIG.store.perItem)).toEqual({
      next: null,
      line: copy('log.sold_out'),
    })
  })

  it('refuses a sale the cash cannot cover, saying by how much', () => {
    const state = fresh({ cash: 2000 })
    expect(buy(state, 0, 'grey-goose', 0)).toEqual({
      next: null,
      line: copy('log.short', { amount: '$9.99' }),
    })
  })

  it('ignores an unknown station or item', () => {
    expect(buy(fresh(), 9, 'marlboro', 0)).toEqual({
      next: null,
      line: null,
    })
    expect(buy(fresh(), 0, 'nope', 0)).toEqual({ next: null, line: null })
  })

  it('sells no forage: the berries are the bush’s to give', () => {
    expect(buy(fresh(), 0, 'berries', 0)).toEqual({
      next: null,
      line: null,
    })
    expect(settle(fresh(), 'berries')).toEqual({ next: null, line: null })
  })
})

describe('settle', () => {
  it('pays and pockets without touching any shelf', () => {
    const state = fresh()
    const { next, line } = settle(state, 'marlboro')
    expect(next?.inventory.marlboro).toBe(
      state.inventory.marlboro + contentsOf('marlboro')
    )
    expect(next?.cash).toBe(state.cash - getItem('marlboro').price)
    expect(next && 'stock' in next).toBe(false)
    expect(line).toBe(getItem('marlboro').bought)
  })

  it('refuses short cash and an unknown kind', () => {
    expect(settle(fresh({ cash: 1 }), 'pbr').next).toBeNull()
    expect(settle(fresh(), 'moonrock')).toEqual({ next: null, line: null })
  })
})
