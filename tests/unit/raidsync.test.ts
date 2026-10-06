import { describe, expect, it } from 'vitest'
import { advance, createRaid, EVENTS, STATES } from '../../src/raid.ts'
import {
  departureKind,
  lobbyCount,
  reconcile,
  seatOf,
  settledBy,
} from '../../src/raidsync.ts'
import type { MemberWire, RaidWire } from '../../src/protocol.ts'

function member(id: string, extra: Partial<MemberWire> = {}): MemberWire {
  return {
    id,
    name: id,
    phase: 'LOBBY',
    boarded: false,
    carrying: 0,
    ...extra,
  }
}

function wire(extra: Partial<RaidWire> = {}): RaidWire {
  return {
    epoch: 1,
    phase: 'LOBBY',
    startedAt: 1_000_000,
    loadoutEndsAt: 1_300_000,
    departedAt: null,
    departReason: null,
    riders: [],
    taken: [],
    shelves: [],
    call: null,
    members: [member('a'), member('b')],
    ...extra,
  }
}

const out = (extra: Partial<RaidWire> = {}) =>
  wire({ phase: 'OUT', departedAt: 1_200_000, riders: ['a'], ...extra })

describe('reconcile', () => {
  it('sets the lobby clock from the server timestamps', () => {
    const r = reconcile(createRaid(0), null, wire(), 'a', 'joined', 0)
    expect(r.raid.loadoutEndsAt).toBe(300)
    expect(r.departed).toBe(false)
    expect(r.departure).toBeNull()
    expect(r.whistle).toBeNull()
  })

  it("takes the account's haul from the valley", () => {
    const w = wire({
      members: [member('a', { carrying: 2 })],
    })
    const r = reconcile(createRaid(0), null, w, 'a', 'taken', 0)
    expect(r.raid.carrying).toBe(2)
  })

  it('rides a raider who was aboard when the truck left', () => {
    const r = reconcile(createRaid(0), wire(), out(), 'a', 'depart', 200)
    expect(r.departed).toBe(true)
    expect(r.departure).toBe('rider')
    expect(r.raid.state).toBe(STATES.RIDING)
  })

  it('leaves behind a raider who was not aboard', () => {
    const r = reconcile(createRaid(0), wire(), out(), 'b', 'depart', 200)
    expect(r.departure).toBe('left-behind')
    expect(r.raid.state).toBe(STATES.ON_FOOT)
  })

  it('tells a raider who joins after the truck left that it is long gone', () => {
    const r = reconcile(createRaid(0), null, out(), 'b', 'joined', 200)
    expect(r.departed).toBe(true)
    expect(r.departure).toBe('long-gone')
    expect(r.raid.state).toBe(STATES.ON_FOOT)
  })

  it('treats a new epoch that is already out as a fresh departure', () => {
    const r = reconcile(
      createRaid(0),
      out(),
      out({ epoch: 2 }),
      'a',
      'depart',
      200
    )
    expect(r.departed).toBe(true)
  })

  it('does not depart twice on the same raid', () => {
    const riding = advance(createRaid(0), EVENTS.BOARD_TRUCK, 10)
    const r = reconcile(riding, out(), out(), 'a', 'taken', 210)
    expect(r.departed).toBe(false)
    expect(r.departure).toBeNull()
    expect(r.raid.state).toBe(STATES.RIDING)
  })

  it('drives the truck but moves no raid for one already on foot', () => {
    const onFoot = advance(createRaid(0), EVENTS.TIMER_EXPIRED, 400)
    const r = reconcile(onFoot, null, out(), 'a', 'joined', 400)
    expect(r.departed).toBe(true)
    expect(r.departure).toBeNull()
    expect(r.raid.state).toBe(STATES.ON_FOOT)
  })

  it("answers this raider's own whistle and notes another's", () => {
    const onFoot = advance(createRaid(0), EVENTS.TIMER_EXPIRED, 400)
    const call = { by: 'a', from: { x: 0, z: 0 }, to: { x: 1, z: 1 }, at: 5 }
    const mine = reconcile(onFoot, out(), out({ call }), 'a', 'call', 410)
    expect(mine.whistle).toBe('mine')
    expect(mine.raid.truckCalled).toBe(true)
    const theirs = reconcile(onFoot, out(), out({ call }), 'b', 'call', 410)
    expect(theirs.whistle).toBe('other')
    expect(theirs.raid.truckCalled).toBe(false)
  })

  it('answers a whistle once', () => {
    const call = { by: 'a', from: { x: 0, z: 0 }, to: { x: 1, z: 1 }, at: 5 }
    const r = reconcile(
      createRaid(0),
      out({ call }),
      out({ call }),
      'a',
      'taken',
      410
    )
    expect(r.whistle).toBeNull()
  })
})

describe('seatOf', () => {
  it('seats by boarding order in the lobby', () => {
    const w = wire({
      members: [
        member('a', { boarded: true }),
        member('b'),
        member('c', { boarded: true }),
      ],
    })
    expect(seatOf(w, 'a')).toBe(0)
    expect(seatOf(w, 'c')).toBe(1)
  })

  it("seats by the valley's rider order once out", () => {
    expect(seatOf(out({ riders: ['b', 'a'] }), 'a')).toBe(1)
  })

  it('falls back to the first seat', () => {
    expect(seatOf(null, 'a')).toBe(0)
    expect(seatOf(wire(), null)).toBe(0)
    expect(seatOf(out(), 'z')).toBe(0)
  })
})

describe('lobbyCount', () => {
  it('counts the lobby aboard', () => {
    const w = wire({
      members: [
        member('a', { boarded: true }),
        member('b'),
        member('c', { phase: 'ON_FOOT' }),
      ],
    })
    expect(lobbyCount(w)).toEqual({ boarded: 1, total: 2 })
  })

  it('says nothing for one raider or none', () => {
    expect(lobbyCount(null)).toBeNull()
    expect(lobbyCount(wire({ members: [member('a')] }))).toBeNull()
  })
})

describe('departureKind', () => {
  it('drives the joyride with anyone aboard', () => {
    expect(departureKind(out())).toBe('joyride')
  })

  it('does donuts when the clock ran out on an empty bed', () => {
    expect(departureKind(out({ riders: [], departReason: 'clock' }))).toBe(
      'donuts'
    )
  })
})

describe('settledBy', () => {
  it("says what a take or a sale settled, and whether it was this raider's", () => {
    expect(settledBy({ reason: 'taken', by: 'a', index: 3 }, 'a')).toEqual({
      take: { index: 3, mine: true },
      sale: null,
    })
    expect(settledBy({ reason: 'taken', by: 'b', index: 3 }, 'a').take).toEqual(
      { index: 3, mine: false }
    )
    expect(
      settledBy({ reason: 'bought', by: 'a', station: 1, item: 'pbr' }, 'a')
    ).toEqual({ take: null, sale: { station: 1, item: 'pbr', mine: true } })
    // Played alone there is no id, and nothing the valley settled is ours.
    expect(
      settledBy({ reason: 'bought', by: 'a', station: 1, item: 'pbr' }, null)
        .sale?.mine
    ).toBe(false)
  })

  it('settles nothing without the detail, or for any other reason', () => {
    const none = { take: null, sale: null }
    expect(settledBy({ reason: 'taken', by: 'a' }, 'a')).toEqual(none)
    expect(settledBy({ reason: 'bought', by: 'a', station: 0 }, 'a')).toEqual(
      none
    )
    expect(settledBy({ reason: 'joined', by: 'a', index: 2 }, 'a')).toEqual(
      none
    )
  })
})
