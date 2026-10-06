import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { getItem } from '../../src/items.ts'
import { advance, createRaid, EVENTS } from '../../src/raid.ts'
import { buy, settle } from '../../src/shop.ts'
import { freshStock } from '../../src/store.ts'
import { unitsLeft } from './stock.ts'
import type { ShopState } from '../../src/shop.ts'

function fresh(over: Partial<ShopState> = {}): ShopState {
  return {
    raid: createRaid(0),
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
    const { next, line } = buy(state, 1, 'marlboro', 0, 5)
    expect(next?.stock[1].marlboro).toEqual([false, true, true])
    expect(unitsLeft(next?.stock[0], 'marlboro')).toBe(CONFIG.store.perItem)
    expect(next?.inventory.marlboro).toBe(state.inventory.marlboro + 1)
    expect(next?.cash).toBe(state.cash - getItem('marlboro').price)
    expect(next?.raid).toBe(state.raid)
    expect(line).toBe(getItem('marlboro').bought)
    // The input is never changed.
    expect(state.stock).toEqual(before)
  })

  it('takes the unit picked, and says sold out once it is gone', () => {
    const { next } = buy(fresh(), 0, 'pbr', 2, 5)
    if (!next) throw new Error('expected a sale')
    expect(next.stock[0].pbr).toEqual([true, true, false])
    expect(buy(next, 0, 'pbr', 2, 5)).toEqual({
      next: null,
      line: copy('log.sold_out'),
    })
    // Its neighbours are still there.
    expect(buy(next, 0, 'pbr', 0, 5).next?.stock[0].pbr).toEqual([
      false,
      true,
      false,
    ])
  })

  it('says sold out for a slot past the facing', () => {
    expect(buy(fresh(), 0, 'pbr', CONFIG.store.perItem, 5)).toEqual({
      next: null,
      line: copy('log.sold_out'),
    })
  })

  it('refuses a sale the cash cannot cover, saying by how much', () => {
    const state = fresh({ cash: 2000 })
    expect(buy(state, 0, 'grey-goose', 0, 5)).toEqual({
      next: null,
      line: "You're $9.99 short.",
    })
  })

  it('sells the sack as gear, on foot too, and only once', () => {
    const onFoot = advance(createRaid(0), EVENTS.TIMER_EXPIRED, 300)
    const { next, line } = buy(fresh({ raid: onFoot }), 0, 'sack', 0, 301)
    expect(next?.raid.sack).toBe(true)
    expect(next?.inventory).toEqual(STARTING_INVENTORY)
    expect(next?.cash).toBe(CONFIG.store.startingCash - getItem('sack').price)
    expect(line).toBe(getItem('sack').bought)
    if (!next) throw new Error('expected a sale')
    expect(buy(next, 0, 'sack', 1, 302)).toEqual({
      next: null,
      line: copy('log.have_sack'),
    })
  })

  it('sells no sack while riding the bed', () => {
    const riding = advance(createRaid(0), EVENTS.BOARD_TRUCK, 1)
    expect(buy(fresh({ raid: riding }), 0, 'sack', 0, 2)).toEqual({
      next: null,
      line: null,
    })
  })

  it('ignores an unknown station or item', () => {
    expect(buy(fresh(), 9, 'marlboro', 0, 5)).toEqual({
      next: null,
      line: null,
    })
    expect(buy(fresh(), 0, 'nope', 0, 5)).toEqual({ next: null, line: null })
  })

  it('sells no forage: the berries are the bush’s to give', () => {
    expect(buy(fresh(), 0, 'berries', 0, 5)).toEqual({
      next: null,
      line: null,
    })
    expect(settle(fresh(), 'berries', 5)).toEqual({ next: null, line: null })
  })
})

describe('settle', () => {
  it('pays and pockets without touching any shelf', () => {
    const state = fresh()
    const { next, line } = settle(state, 'marlboro', 5)
    expect(next?.inventory.marlboro).toBe(state.inventory.marlboro + 1)
    expect(next?.cash).toBe(state.cash - getItem('marlboro').price)
    expect(next?.raid).toBe(state.raid)
    expect(next && 'stock' in next).toBe(false)
    expect(line).toBe(getItem('marlboro').bought)
  })

  it('refuses short cash, a second sack, and an unknown kind', () => {
    expect(settle(fresh({ cash: 1 }), 'pbr', 5).next).toBeNull()
    const sacked = advance(createRaid(0), EVENTS.BUY_SACK, 1)
    expect(settle(fresh({ raid: sacked }), 'sack', 5)).toEqual({
      next: null,
      line: copy('log.have_sack'),
    })
    expect(settle(fresh(), 'moonrock', 5)).toEqual({ next: null, line: null })
  })
})
