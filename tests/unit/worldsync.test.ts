import { describe, expect, it } from 'vitest'
import {
  aboard,
  boardable,
  clockText,
  countdown,
  newLeg,
  seatOf,
  settledBy,
} from '../../src/worldsync.ts'
import type { Leg } from '../../src/marx.ts'
import type { WorldWire } from '../../src/protocol.ts'

const T0 = 1_000_000

const world = (leg: Leg, riders: string[] = []): WorldWire => ({
  day: '2026-10-07',
  taken: [],
  shelves: [],
  drops: [],
  graves: [],
  corpses: [],
  truck: { leg, riders },
  members: [],
})
const parked = (leavesAt: number | null = null): Leg => ({
  kind: 'parked',
  at: T0,
  from: null,
  leavesAt,
})

describe('the bed', () => {
  it('says who is aboard, and in which seat', () => {
    const w = world(parked(T0 + 60_000), ['b', 'a'])
    expect(aboard(w, 'a')).toBe(true)
    expect(aboard(w, 'c')).toBe(false)
    expect(aboard(null, 'a')).toBe(false)
    expect(aboard(w, null)).toBe(false)
    expect(seatOf(w, 'a')).toBe(1)
    expect(seatOf(w, 'b')).toBe(0)
    // Not aboard, or no valley: the first seat.
    expect(seatOf(w, 'c')).toBe(0)
    expect(seatOf(null, 'a')).toBe(0)
  })

  it('lets a raider climb in at the Citgo, or into the truck they whistled', () => {
    expect(boardable(parked(), 'a')).toBe(true)
    const called: Leg = {
      kind: 'called',
      at: T0,
      by: 'a',
      from: { x: 0, z: 0 },
      to: { x: 9, z: 9 },
      rest: true,
    }
    expect(boardable(called, 'a')).toBe(true)
    expect(boardable(called, 'b')).toBe(false)
    expect(boardable(called, null)).toBe(false)
    expect(boardable({ kind: 'donuts', at: T0 }, 'a')).toBe(false)
    expect(boardable(null, 'a')).toBe(false)
  })
})

describe('the countdown', () => {
  it('counts the whole seconds left, never below zero', () => {
    const w = world(parked(T0 + 60_000), ['a']).truck
    expect(countdown(w, T0)).toBe(60)
    expect(countdown(w, T0 + 59_001)).toBe(1)
    expect(countdown(w, T0 + 70_000)).toBe(0)
    expect(countdown(world(parked()).truck, T0)).toBeNull()
    expect(countdown(world({ kind: 'joyride', at: T0 }).truck, T0)).toBeNull()
    expect(countdown(null, T0)).toBeNull()
  })

  it('reads as m:ss', () => {
    expect(clockText(60)).toBe('1:00')
    expect(clockText(9)).toBe('0:09')
  })
})

describe('newLeg', () => {
  it('is new for another kind, another start, or a drive home begun', () => {
    expect(newLeg(null, parked())).toBe(true)
    expect(newLeg(parked(), { kind: 'donuts', at: T0 })).toBe(true)
    expect(
      newLeg({ kind: 'donuts', at: T0 }, { kind: 'donuts', at: T0 + 1 })
    ).toBe(true)
    const home: Leg = {
      kind: 'parked',
      at: T0,
      from: { kind: 'donuts', at: T0 - 9, cut: T0 },
      leavesAt: null,
    }
    expect(newLeg(parked(), home)).toBe(true)
    // A countdown starting or stopping is not a new leg.
    expect(newLeg(parked(), parked(T0 + 60_000))).toBe(false)
    expect(newLeg(parked(T0 + 60_000), parked())).toBe(false)
  })
})

describe('settledBy', () => {
  const none = { take: null, sale: null, dropped: null, dropTaken: null }

  it("says what a take or a sale settled, and whether it was this raider's", () => {
    expect(settledBy({ reason: 'taken', by: 'a', index: 3 }, 'a')).toEqual({
      ...none,
      take: { index: 3, mine: true },
    })
    expect(settledBy({ reason: 'taken', by: 'b', index: 3 }, 'a').take).toEqual(
      { index: 3, mine: false }
    )
    expect(
      settledBy({ reason: 'bought', by: 'a', station: 1, item: 'pbr' }, 'a')
    ).toEqual({ ...none, sale: { station: 1, item: 'pbr', mine: true } })
    // Played alone there is no id, and nothing the valley settled is ours.
    expect(
      settledBy({ reason: 'bought', by: 'a', station: 1, item: 'pbr' }, null)
        .sale?.mine
    ).toBe(false)
  })

  it('says what was set down and what was taken up, and by whom', () => {
    const detail = { by: 'a', item: 'cabbage', drop: 4, count: 2 }
    expect(settledBy({ reason: 'dropped', ...detail }, 'a')).toEqual({
      ...none,
      dropped: { kind: 'cabbage', count: 2, mine: true },
    })
    expect(settledBy({ reason: 'drop-taken', ...detail }, 'b')).toEqual({
      ...none,
      dropTaken: { drop: 4, kind: 'cabbage', count: 2, mine: false },
    })
  })

  it('settles nothing without the detail, or for any other reason', () => {
    expect(settledBy({ reason: 'taken', by: 'a' }, 'a')).toEqual(none)
    expect(settledBy({ reason: 'bought', by: 'a', station: 0 }, 'a')).toEqual(
      none
    )
    expect(settledBy({ reason: 'joined', by: 'a', index: 2 }, 'a')).toEqual(
      none
    )
    expect(
      settledBy({ reason: 'dropped', by: 'a', item: 'joints', count: 1 }, 'a')
    ).toEqual(none)
    expect(
      settledBy({ reason: 'drop-taken', by: 'a', item: 'joints', drop: 1 }, 'a')
    ).toEqual(none)
  })
})
