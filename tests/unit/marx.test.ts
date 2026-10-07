import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  arrive,
  board,
  call,
  createTruck,
  homeAt,
  hopOut,
  hurry,
  isAboard,
  leave,
  nextChange,
  refused,
  settleTruck,
  TO_DOOR_SECONDS,
} from '../../src/marx.ts'
import type { TruckState } from '../../src/marx.ts'

const T0 = 1_000_000
const SEC = 1000
const { readSeconds, donutSeconds, countdownSeconds, donutHomeSeconds } =
  CONFIG.truck
const ROUTES = { home: { x: 0, z: 0 }, joyrideMs: 600 * SEC }

// The truck after `action`, which must not be refused.
function ok(result: TruckState | { refused: string }): TruckState {
  if (refused(result)) throw new Error(`refused: ${result.refused}`)
  return result
}

describe("Marx's day", () => {
  it('reads at the Citgo, then does donuts, then comes home and reads again', () => {
    const truck = createTruck(T0)
    expect(truck.leg).toEqual({
      kind: 'parked',
      at: T0,
      from: null,
      leavesAt: null,
    })
    const read = T0 + readSeconds * SEC
    expect(nextChange(truck, ROUTES)).toBe(read)
    expect(settleTruck(truck, read - 1, ROUTES).changes).toEqual([])
    const donuts = settleTruck(truck, read, ROUTES)
    expect(donuts.changes).toEqual(['donuts'])
    expect(donuts.truck.leg).toEqual({ kind: 'donuts', at: read })
    const back = read + donutSeconds * SEC
    const home = settleTruck(truck, back, ROUTES)
    expect(home.changes).toEqual(['donuts', 'back'])
    expect(home.truck.leg).toEqual({
      kind: 'parked',
      at: back,
      from: { kind: 'donuts', at: read, cut: back },
      leavesAt: null,
    })
    // The drive home is part of his reading time.
    const leg = home.truck.leg
    if (leg.kind !== 'parked') throw new Error('not parked')
    expect(homeAt(leg, ROUTES)).toBe(back + donutHomeSeconds * SEC)
    expect(nextChange(home.truck, ROUTES)).toBe(
      back + (donutHomeSeconds + readSeconds) * SEC
    )
  })

  it('catches up on days with nobody about, and gives up on weeks', () => {
    const truck = createTruck(T0)
    const cycle = (readSeconds + donutSeconds + donutHomeSeconds) * SEC
    const later = settleTruck(truck, T0 + 3 * cycle + 1, ROUTES)
    expect(later.changes).toEqual([
      'donuts',
      'back',
      'donuts',
      'back',
      'donuts',
      'back',
    ])
    const weeks = settleTruck(truck, T0 + 14 * 24 * 3600 * SEC, ROUTES)
    expect(weeks.truck.leg).toEqual({
      kind: 'parked',
      at: T0 + 14 * 24 * 3600 * SEC,
      from: null,
      leavesAt: null,
    })
  })

  it('comes home from his donuts when someone arrives', () => {
    const parked = createTruck(T0)
    expect(arrive(parked, T0 + 5)).toBe(parked)
    const donuts: TruckState = { leg: { kind: 'donuts', at: T0 }, riders: [] }
    expect(arrive(donuts, T0 + 40 * SEC).leg).toEqual({
      kind: 'parked',
      at: T0 + 40 * SEC,
      from: { kind: 'donuts', at: T0, cut: T0 + 40 * SEC },
      leavesAt: null,
    })
  })
})

describe('the bed and the countdown', () => {
  it('starts the countdown when the first raider climbs in, and keeps it', () => {
    let truck = ok(board(createTruck(T0), 'a', T0 + 10 * SEC))
    const leaves = T0 + (10 + countdownSeconds) * SEC
    expect(truck.leg).toMatchObject({ kind: 'parked', leavesAt: leaves })
    expect(truck.riders).toEqual(['a'])
    // A second rider does not wind it back.
    truck = ok(board(truck, 'b', T0 + 30 * SEC))
    expect(truck.leg).toMatchObject({ leavesAt: leaves })
    expect(truck.riders).toEqual(['a', 'b'])
    expect(board(truck, 'a', T0 + 31 * SEC)).toEqual({ refused: 'aboard' })
    // No donuts with anyone in the bed: the countdown is the next change.
    expect(nextChange(truck, ROUTES)).toBe(leaves)
  })

  it('stops the countdown when the bed is empty again', () => {
    let truck = ok(board(createTruck(T0), 'a', T0))
    truck = ok(board(truck, 'b', T0))
    truck = ok(hopOut(truck, 'a'))
    expect(truck.leg).toMatchObject({ leavesAt: T0 + countdownSeconds * SEC })
    truck = ok(hopOut(truck, 'b'))
    expect(truck.leg).toMatchObject({ kind: 'parked', leavesAt: null })
    expect(hopOut(truck, 'b')).toEqual({ refused: 'not-aboard' })
  })

  it('leaves on the joyride with whoever is aboard, and lets them off at home', () => {
    const truck = ok(board(createTruck(T0), 'a', T0))
    const leaves = T0 + countdownSeconds * SEC
    const out = settleTruck(truck, leaves, ROUTES)
    expect(out.changes).toEqual(['depart'])
    expect(out.truck).toEqual({
      leg: { kind: 'joyride', at: leaves },
      riders: ['a'],
    })
    // Over the side on the way: nothing else changes.
    expect(ok(hopOut(out.truck, 'a'))).toEqual({
      leg: { kind: 'joyride', at: leaves },
      riders: [],
    })
    const home = settleTruck(out.truck, leaves + ROUTES.joyrideMs, ROUTES)
    expect(home.changes).toEqual(['home'])
    expect(home.truck).toEqual({
      leg: {
        kind: 'parked',
        at: leaves + ROUTES.joyrideMs,
        from: null,
        leavesAt: null,
      },
      riders: [],
    })
  })

  it('cannot be boarded while it is away', () => {
    const donuts: TruckState = { leg: { kind: 'donuts', at: T0 }, riders: [] }
    expect(board(donuts, 'a', T0)).toEqual({ refused: 'gone' })
    const joyride: TruckState = {
      leg: { kind: 'joyride', at: T0 },
      riders: [],
    }
    expect(board(joyride, 'a', T0)).toEqual({ refused: 'gone' })
  })
})

describe('the whistle', () => {
  const from = { x: 10, z: 0 }
  const to = { x: 500, z: 300 }

  it('brings the empty truck from the Citgo or the field to the whistler', () => {
    const fromRest = ok(call(createTruck(T0), 'a', from, to, T0 + 5))
    expect(fromRest.leg).toEqual({
      kind: 'called',
      at: T0 + 5,
      by: 'a',
      from,
      to,
      rest: true,
    })
    const donuts: TruckState = { leg: { kind: 'donuts', at: T0 }, riders: [] }
    expect(ok(call(donuts, 'a', from, to, T0 + 5)).leg).toMatchObject({
      kind: 'called',
      rest: false,
    })
    // It waits for its caller.
    expect(nextChange(fromRest, ROUTES)).toBeNull()
    expect(settleTruck(fromRest, T0 + 1e9, ROUTES).changes).toEqual([])
  })

  it('answers one whistle at a time, and never with anyone aboard', () => {
    const called = ok(call(createTruck(T0), 'a', from, to, T0))
    expect(call(called, 'b', from, to, T0)).toEqual({ refused: 'busy' })
    const loaded = ok(board(createTruck(T0), 'b', T0))
    expect(call(loaded, 'a', from, to, T0)).toEqual({ refused: 'busy' })
    const joyride: TruckState = {
      leg: { kind: 'joyride', at: T0 },
      riders: [],
    }
    expect(call(joyride, 'a', from, to, T0)).toEqual({ refused: 'busy' })
  })

  it('takes its caller home, and no one else', () => {
    const called = ok(call(createTruck(T0), 'a', from, to, T0))
    expect(board(called, 'b', T0 + 60 * SEC)).toEqual({ refused: 'not-yours' })
    const ferry = ok(board(called, 'a', T0 + 60 * SEC))
    expect(ferry).toEqual({
      leg: { kind: 'ferry', at: T0 + 60 * SEC, from, to },
      riders: ['a'],
    })
    // Generously long: the straight line home, twice over, and the slack.
    const due = nextChange(ferry, ROUTES)
    const straight = Math.hypot(to.x, to.z) / CONFIG.truck.speed
    expect(due).toBeGreaterThan(T0 + (60 + straight) * SEC)
    const home = settleTruck(ferry, due ?? 0, ROUTES)
    expect(home.changes).toEqual(['home'])
    expect(home.truck.riders).toEqual([])
  })

  it('turns for home when its caller leaves', () => {
    const called = ok(call(createTruck(T0), 'a', from, to, T0))
    expect(leave(called, 'b', T0 + 9)).toBe(called)
    expect(leave(called, 'a', T0 + 9).leg).toEqual({
      kind: 'parked',
      at: T0 + 9,
      from: { kind: 'called', at: T0, from, to, rest: true, cut: T0 + 9 },
      leavesAt: null,
    })
  })
})

describe('leaving the valley', () => {
  it('takes a raider out of the bed, and the countdown with the last', () => {
    const truck = ok(board(createTruck(T0), 'a', T0))
    const gone = leave(truck, 'a', T0 + 1)
    expect(isAboard(gone, 'a')).toBe(false)
    expect(gone.leg).toMatchObject({ kind: 'parked', leavesAt: null })
  })
})

describe('hurry (dev)', () => {
  it('brings the next change to `seconds` from now', () => {
    const now = T0 + 7 * SEC
    const parked = hurry(createTruck(T0), now, 2, ROUTES)
    expect(nextChange(parked, ROUTES)).toBe(now + 2 * SEC)
    const counting = hurry(ok(board(createTruck(T0), 'a', T0)), now, 0, ROUTES)
    expect(nextChange(counting, ROUTES)).toBe(now)
    const called = ok(
      call(createTruck(T0), 'a', { x: 0, z: 0 }, { x: 1, z: 1 }, T0)
    )
    expect(hurry(called, now, 0, ROUTES)).toBe(called)
  })
})

describe("Marx's walk to his door", () => {
  it('takes a few seconds', () => {
    expect(TO_DOOR_SECONDS).toBeGreaterThan(2)
    expect(TO_DOOR_SECONDS).toBeLessThan(6)
  })
})
