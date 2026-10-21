import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { itemLine } from '../../src/itemcopy.ts'
import { contentsOf, getItem } from '../../src/items.ts'
import { buy, buyRefusal, settle } from '../../src/shop.ts'
import { formatCash, freshStock, shelfPrice } from '../../src/store.ts'
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
    expect(line).toBe(itemLine('marlboro', 'bought'))
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
  })
})

describe('settle', () => {
  it('pays and pockets without touching any shelf', () => {
    const state = fresh()
    const { next, line } = settle(state, 'marlboro', getItem('marlboro').price)
    expect(next?.inventory.marlboro).toBe(
      state.inventory.marlboro + contentsOf('marlboro')
    )
    expect(next?.cash).toBe(state.cash - getItem('marlboro').price)
    expect(next && 'stock' in next).toBe(false)
    expect(line).toBe(itemLine('marlboro', 'bought'))
  })

  it('refuses short cash', () => {
    expect(settle(fresh({ cash: 1 }), 'pbr', 99).next).toBeNull()
  })

  it('charges the dearer price once a shelf has sold some', () => {
    const state = fresh()
    const first = buy(state, 0, 'pbr', 0).next
    const second = first && buy(first, 0, 'pbr', 1).next
    expect(first?.cash).toBe(state.cash - getItem('pbr').price)
    expect(second?.cash).toBe(
      (first?.cash ?? 0) - (shelfPrice('pbr', [false, true, true]) ?? 0)
    )
  })
})

describe('buyRefusal', () => {
  it('says why the valley would not sell', () => {
    const price = getItem('marlboro').price
    expect(buyRefusal('sold-out', 'marlboro', 0)).toBe(copy('log.sold_out'))
    expect(buyRefusal('short', 'marlboro', price - 25)).toBe(
      copy('log.short', { amount: formatCash(25) })
    )
    expect(buyRefusal('short', undefined, 0)).toBe(copy('log.refused'))
    expect(buyRefusal('not-visited', 'marlboro', 0)).toBe(
      copy('dialup.citgo.not_visited')
    )
    expect(buyRefusal('not-in-valley', 'marlboro', 0)).toBe(
      copy('dialup.citgo.no_world')
    )
    expect(buyRefusal('what', 'marlboro', 0)).toBe(copy('log.refused'))
  })
})

describe('shelfPrice', () => {
  it('puts the price up for each unit already sold, to a price ending in 9', () => {
    const { surge } = CONFIG.store
    expect(shelfPrice('pbr', [true, true, true])).toBe(99)
    expect(shelfPrice('pbr', undefined)).toBe(99)
    const second = shelfPrice('pbr', [false, true, true]) ?? 0
    const third = shelfPrice('pbr', [false, false, true]) ?? 0
    expect(second % 10).toBe(9)
    expect(second).toBeGreaterThanOrEqual(99 * surge)
    expect(second).toBeLessThan(99 * surge + 10)
    expect(third).toBeGreaterThanOrEqual(99 * surge ** 2)
    expect(third).toBeGreaterThan(second)
  })

  it('has none for what no shelf sells', () => {
    expect(shelfPrice('berries', [true])).toBeUndefined()
    expect(shelfPrice('moonrock', [true])).toBeUndefined()
  })
})
