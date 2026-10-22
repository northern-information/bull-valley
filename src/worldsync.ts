// The client's side of the shared world, pure. The valley sends every
// change as a whole WorldWire snapshot (sharedworld.ts toWire); this reads
// one and says what it means for this raider: whether a take, a sale or a
// drop was theirs, where they sit in the bed, and what the truck is up to.
// No three.js, no DOM.

import { GIFTS } from './book.ts'
import { useOf } from './held.ts'
import type { Leg, TruckState } from './marx.ts'
import type { Portal } from './portals.ts'
import type { WorldMessage, WorldWire } from './protocol.ts'

// What a 'taken', 'bought', 'dropped' or 'drop-taken' snapshot settled,
// and whether it was this raider's: a pickup taken (into our pack, or gone
// from the valley), a shelf unit sold (into our pocket, or only off the
// shelf), something set down, or a drop taken up (sharedworld.ts rule 12).
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
    WorldMessage,
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

export function aboard(world: WorldWire | null, me: string | null): boolean {
  return !!world && me !== null && world.truck.riders.includes(me)
}

// Rule 3: whether this raider may pick where the truck goes: it is parked
// at the Citgo and they are the first one in its bed, or it is empty and
// they are climbing in. A whistled truck only ever goes home.
export function charterable(
  truck: TruckState | null,
  me: string | null
): boolean {
  if (!truck || me === null || truck.leg.kind !== 'parked') return false
  return truck.riders.length === 0 || truck.riders[0] === me
}

// The bed as this raider holds it: in it or not, and whether a board is
// asked and not yet answered.
interface BedState {
  aboard: boolean
  pendingBoard: boolean
}

// What a snapshot makes of the bed for this raider. The valley's word on
// who is in it stands, except while our own board is still unanswered
// (we sit in the bed on trust until then). letOff: we were in the bed and
// are not now, by the valley's word, so we step off beside the truck.
// rolling: the truck is leaving with us in it.
interface BedChange extends BedState {
  letOff: boolean
  rolling: boolean
}

export function reconcileBed(
  world: WorldWire,
  me: string | null,
  state: BedState,
  reason: WorldMessage['reason']
): BedChange {
  const inBed = aboard(world, me)
  const pendingBoard = state.pendingBoard && !inBed
  return {
    aboard: pendingBoard ? state.aboard : inBed,
    pendingBoard,
    letOff: state.aboard && !inBed && !pendingBoard,
    rolling: reason === 'depart' && inBed,
  }
}

// Which bed seat is this raider's: by the order they climbed in. Seat 0
// with no valley.
export function seatOf(world: WorldWire | null, me: string | null): number {
  if (!world || me === null) return 0
  return Math.max(0, world.truck.riders.indexOf(me))
}

// Whether a leg is a new one: a different kind, or the same kind started
// at another moment (a fresh countdown is not a new leg).
export function newLeg(before: Leg | null, after: Leg): boolean {
  if (!before || before.kind !== after.kind) return true
  if (before.at !== after.at) return true
  if (before.kind === 'parked' && after.kind === 'parked') {
    return (before.from === null) !== (after.from === null)
  }
  return false
}

// Seconds until the truck leaves with whoever is in the bed, or null when
// no countdown runs. Never below 0.
export function countdown(
  truck: TruckState | null,
  now: number
): number | null {
  const leg = truck?.leg
  if (leg?.kind !== 'parked' || leg.leavesAt === null) return null
  return Math.max(0, Math.ceil((leg.leavesAt - now) / 1000))
}

// The countdown as m:ss.
export function clockText(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// Whether `me` may climb into the truck as it stands: parked at the
// Citgo, or answering their own whistle.
export function boardable(leg: Leg | null, me: string | null): boolean {
  if (!leg) return false
  if (leg.kind === 'parked') return true
  return leg.kind === 'called' && me !== null && leg.by === me
}

// What a snapshot says of the Citgo portals for this raider
// (sharedworld.ts rule 28), who last knew their own as `myPortal` (its id,
// or null): one opened and whether it was theirs, their own as it stands
// now (its id, or null), and whether their own just closed. Opening a
// second closes the first, but that is no closing to tell of.
interface PortalNews {
  opened: { portal: Portal; mine: boolean } | null
  mine: number | null
  closed: boolean
}

export function portalNews(
  msg: Pick<WorldMessage, 'reason' | 'by' | 'portal'>,
  wire: WorldWire,
  me: string | null,
  myPortal: number | null
): PortalNews {
  const found =
    msg.reason === 'portal-opened' && msg.portal !== undefined
      ? wire.portals.find((p) => p.id === msg.portal)
      : undefined
  const opened = found
    ? { portal: found, mine: me !== null && msg.by === me }
    : null
  if (opened?.mine) return { opened, mine: opened.portal.id, closed: false }
  const standing =
    myPortal !== null && wire.portals.some((p) => p.id === myPortal)
  return {
    opened,
    mine: standing ? myPortal : null,
    closed: myPortal !== null && !standing,
  }
}

// Rule 37: the gifts a pack frame brought, kinds the valley gives for a
// first meeting (Marx's whistle) that the pack held none of before and
// holds now.
export function giftsIn(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>
): string[] {
  return Object.values(GIFTS).filter(
    (kind) => (before[kind] ?? 0) <= 0 && (after[kind] ?? 0) > 0
  )
}

// What a pack frame brought that the hand has a use of its own for (the
// flashlight, the jar, a rod, the phone, the whistle; held.ts useOf), and
// the pack held none of before: each goes onto the bar, as Minecraft puts
// what is picked up there.
export function toolsIn(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>
): string[] {
  return Object.keys(after).filter(
    (kind) =>
      (before[kind] ?? 0) <= 0 &&
      (after[kind] ?? 0) > 0 &&
      useOf(kind, false) !== null
  )
}
