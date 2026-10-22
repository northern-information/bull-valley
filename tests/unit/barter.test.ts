import { describe, expect, it } from 'vitest'
import {
  covers,
  evenUp,
  offerWorth,
  payable,
  spareIn,
} from '../../src/barter.ts'

// A trader who counts a penny at 1, a dime at 10 and a quarter at 25, and
// takes nothing else.
const COINS: Record<string, number> = { penny: 1, dime: 10, quarter: 25 }
const worthOf = (kind: string) => COINS[kind] ?? 0

describe('the trade window’s arithmetic', () => {
  it('counts an offer by what each unit is worth to him', () => {
    expect(offerWorth({ penny: 3, dime: 2 }, worthOf)).toBe(23)
    expect(offerWorth({ button: 9 }, worthOf)).toBe(0)
    expect(covers(30, 30)).toBe(true)
    expect(covers(29.9, 30)).toBe(false)
  })

  it('names what a pack could pay with, in its own order', () => {
    expect(
      payable({ dime: 1, button: 4, penny: 0, quarter: 2 }, worthOf)
    ).toEqual(['dime', 'quarter'])
  })

  it('finds the units he could hand back and still be covered', () => {
    expect(spareIn(30, { dime: 3 }, worthOf)).toEqual([])
    expect(spareIn(30, { dime: 3, penny: 1 }, worthOf)).toEqual(['penny'])
    expect(spareIn(30, { quarter: 3 }, worthOf)).toEqual(['quarter'])
    // Over, but no one unit can come back: what a whole unit costs.
    expect(spareIn(30, { quarter: 2 }, worthOf)).toEqual([])
  })

  it('evens up cheapest first, trims the dearest spare, and keeps what it can', () => {
    const pack = { penny: 100, dime: 10, quarter: 4 }
    expect(evenUp(30, pack, {}, worthOf)).toEqual({ penny: 30 })
    // A quarter down: five pennies top it up.
    expect(evenUp(30, pack, { quarter: 1 }, worthOf)).toEqual({
      quarter: 1,
      penny: 5,
    })
    // Three quarters is a quarter too many; two have none to spare.
    expect(evenUp(30, pack, { quarter: 3 }, worthOf)).toEqual({ quarter: 2 })
    // Out of pennies, dimes.
    expect(evenUp(30, { penny: 4, dime: 10 }, {}, worthOf)).toEqual({
      dime: 3,
    })
    // Not enough in the whole pack.
    expect(evenUp(30, { penny: 4, dime: 2 }, {}, worthOf)).toBeNull()
    // More on the table than the pack holds, or what he will not take,
    // goes.
    expect(evenUp(30, { dime: 3 }, { dime: 9, button: 2 }, worthOf)).toEqual({
      dime: 3,
    })
  })
})
