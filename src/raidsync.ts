// The client's side of the shared raid, pure. The valley sends every change
// as a whole RaidWire snapshot (sharedraid.ts toWire); this reads one
// against the snapshot before it and says how this raider's own Raid moves
// and what the client should show. No three.js, no DOM.

import { advance, EVENTS, STATES } from './raid.ts'
import type { Raid } from './interfaces.ts'
import type { RaidMessage, RaidReason, RaidWire } from './protocol.ts'

// How a raider still in the lobby saw the truck go: aboard, left behind as
// it pulled out, or arriving after it had already gone.
export type Departure = 'rider' | 'left-behind' | 'long-gone'

export interface Reconciled {
  raid: Raid
  // The truck left with this snapshot, so it drives from wire.departedAt.
  departed: boolean
  // How it went for this raider; null unless they were in the lobby.
  departure: Departure | null
  // A new whistle: this raider's own, someone else's, or none.
  whistle: 'mine' | 'other' | null
}

// Move `raid` through `wire`, the snapshot after `previous` (null for the
// first). `me` is this socket's id, `clock` the raid clock in seconds.
// What the raider carries is the valley's word, whatever this client
// guessed in the meantime.
export function reconcile(
  raid: Raid,
  previous: RaidWire | null,
  wire: RaidWire,
  me: string | null,
  reason: RaidReason,
  clock: number
): Reconciled {
  // The lobby clock, in raid clock seconds.
  let next: Raid = {
    ...raid,
    loadoutEndsAt: (wire.loadoutEndsAt - wire.startedAt) / 1000,
  }

  const mine = wire.members.find((m) => m.id === me)
  if (mine) {
    next = { ...next, carrying: mine.carrying }
  }

  // The truck left: with us, or without us, or before we got here.
  const departed =
    wire.phase === 'OUT' &&
    (previous === null ||
      previous.epoch !== wire.epoch ||
      previous.phase === 'LOBBY')
  let departure: Departure | null = null
  if (departed && next.state === STATES.LOADOUT) {
    const rider = me !== null && wire.riders.includes(me)
    next = advance(
      next,
      rider ? EVENTS.BOARD_TRUCK : EVENTS.TIMER_EXPIRED,
      clock
    )
    departure = rider
      ? 'rider'
      : reason === 'depart'
        ? 'left-behind'
        : 'long-gone'
  }

  // A whistle, answered for everyone.
  const call = wire.call
  let whistle: Reconciled['whistle'] = null
  if (call && (!previous?.call || previous.call.at !== call.at)) {
    whistle = call.by === me ? 'mine' : 'other'
    if (whistle === 'mine') next = advance(next, EVENTS.CALL_TRUCK, clock)
  }

  return { raid: next, departed, departure, whistle }
}

// What a 'taken', 'bought', 'dropped' or 'drop-taken' snapshot settled,
// and whether it was this raider's: a pickup taken (into our arms, or gone
// from the valley), a shelf unit sold (into our pocket, or only off the
// shelf), something set down, or a drop taken up (sharedraid.ts rule 14).
export interface Settled {
  take: { index: number; mine: boolean } | null
  sale: { station: number; item: string; mine: boolean } | null
  dropped: { kind: string; count: number; mine: boolean } | null
  dropTaken: {
    drop: number
    kind: string
    count: number
    mine: boolean
  } | null
}

export function settledBy(
  msg: Pick<
    RaidMessage,
    'reason' | 'by' | 'index' | 'station' | 'item' | 'drop' | 'count'
  >,
  me: string | null
): Settled {
  const mine = me !== null && msg.by === me
  const { item, drop, count } = msg
  const aDrop = item !== undefined && drop !== undefined && count !== undefined
  return {
    take:
      msg.reason === 'taken' && msg.index !== undefined
        ? { index: msg.index, mine }
        : null,
    sale:
      msg.reason === 'bought' && msg.station !== undefined && item
        ? { station: msg.station, item, mine }
        : null,
    dropped:
      msg.reason === 'dropped' && aDrop ? { kind: item, count, mine } : null,
    dropTaken:
      msg.reason === 'drop-taken' && aDrop
        ? { drop, kind: item, count, mine }
        : null,
  }
}

// Which bed seat is this raider's: by boarding order in the lobby, by the
// valley's rider order once the truck has left. Seat 0 with no valley.
export function seatOf(wire: RaidWire | null, me: string | null): number {
  if (!wire || me === null) return 0
  const order =
    wire.phase === 'LOBBY'
      ? wire.members.filter((m) => m.boarded).map((m) => m.id)
      : wire.riders
  return Math.max(0, order.indexOf(me))
}

// How many in the lobby are aboard, of how many; null unless at least two
// are waiting, since a headcount of one says nothing.
export function lobbyCount(
  wire: RaidWire | null
): { boarded: number; total: number } | null {
  if (!wire) return null
  const lobby = wire.members.filter((m) => m.phase === 'LOBBY')
  if (lobby.length < 2) return null
  return {
    boarded: lobby.filter((m) => m.boarded).length,
    total: lobby.length,
  }
}

// Where the truck goes once it has left: the joyride with whoever is
// aboard, or, when the clock ran out on an empty bed, Matthew Marx's donuts
// in the field by the corn maze (donuts.ts) until someone whistles.
export function departureKind(wire: RaidWire): 'joyride' | 'donuts' {
  return wire.riders.length === 0 ? 'donuts' : 'joyride'
}
