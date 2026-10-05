// The shared raid, as the server runs it: one lobby at the gas station, one
// truck, one clock, shared pickups. Pure and Three-free: a reducer over a
// Valley value that returns the next value, the frames to send, and the
// alarm to arm. worker/ValleyDO.ts is the plumbing around it; the client
// reads the resulting RaidWire in main.ts. tests/unit/sharedraid.test.ts
// holds every rule.
//
// The rules:
// 1. A lobby forms when the first player arrives in an empty valley.
// 2. A player who joins a lobby is in it; one who joins after the truck
//    left is on foot at the station.
// 3. The truck leaves when everyone in the lobby is aboard, or when the
//    clock runs out, with whoever is aboard. Walking away is allowed: the
//    truck does not wait for anyone who never boards.
// 4. A pickup goes to whoever asks first; the rest are told it is gone.
// 5. One whistle at a time: the called truck is the caller's until they
//    extract or leave.
// 6. Extracting takes you out of the raid; your figure goes with you.
// 7. When no one is left in the raid, the valley resets for the next one.
// 8. The Citgo shelves are shared: a unit one player buys is off the shelf
//    for everyone, and the shelves fill again with the next lobby. Cash is
//    each player's own; the valley only keeps count of what is left.
// 9. The berry bush gives each account one berry a day, the day turning at
//    midnight Central (daily.ts), whatever the raid is doing. The valley
//    remembers only the accounts that have had today's berry. Two sockets
//    signed in to one account share one berry; the name shown is only the
//    account's handle.
// 10. Gron, by the berry bush, changes a raider's name and character at any
//    time. The change touches only how they are shown: their place in the
//    raid, their berry and their whistle stay theirs.
// 11. Every item a raider carries is their account's (the pack), kept by
//    the valley and never by the client: the day's berry, a pickup that is
//    not a cabbage, and a unit bought off a shelf go into it, and a use
//    takes one out. The valley holds the pack; this reducer says what
//    changes (Reduced.pack) and worker/ValleyDO.ts writes it.

import { CONFIG } from './config.ts'
import { collectedToday, dayKey, nextMidnight } from './daily.ts'
import { INVENTORY_KINDS } from './items.ts'
import { freshStock } from './store.ts'
import type { ExtractKind, ShopStock, XZ } from './interfaces.ts'
import type { OutfitId } from './outfits.ts'
import type {
  DailyMessage,
  DailyWire,
  DepartReason,
  MemberPhase,
  MemberWire,
  NackMessage,
  NackRe,
  PickupSpec,
  RaidMessage,
  RaidReason,
  RaidWire,
  TruckCall,
} from './protocol.ts'

export interface Member {
  id: string
  // The signed-in account (worker/auth.ts). Never on the wire.
  account: string
  name: string
  outfit: OutfitId
  phase: MemberPhase
  boarded: boolean
}

export interface SharedRaid {
  epoch: number
  phase: 'LOBBY' | 'OUT'
  startedAt: number
  loadoutEndsAt: number
  departedAt: number | null
  departReason: DepartReason | null
  riders: string[]
  taken: number[]
  shelves: ShopStock[]
  call: TruckCall | null
  // The pickups and the station count the build that opened this raid
  // placed.
  pickups: PickupSpec[]
  stations: number
}

// Everything the server persists.
export interface Valley {
  epoch: number
  raid: SharedRaid | null
  members: Record<string, Member>
  // Account -> the Central day (daily.ts dayKey) that account last took a
  // berry. Pruned to today's accounts on every pick, so it never grows.
  dailies: Record<string, string>
}

export type ValleyAction =
  | {
      type: 'join'
      id: string
      account: string
      name: string
      outfit: OutfitId
      pickups: PickupSpec[]
      stations: number
    }
  | { type: 'leave'; id: string }
  | { type: 'board'; id: string }
  | { type: 'unboard'; id: string }
  | { type: 'hop-out'; id: string }
  | { type: 'take'; id: string; index: number }
  | { type: 'buy'; id: string; station: number; kind: string }
  | { type: 'call'; id: string; from: XZ; to: XZ }
  | { type: 'extract'; id: string; kind: ExtractKind }
  | { type: 'collect'; id: string }
  | { type: 'use'; id: string; kind: string }
  // Rule 10: a new name, a new character, or both.
  | { type: 'appearance'; id: string; name?: string; outfit?: OutfitId }
  // The lobby clock ran out.
  | { type: 'clock' }
  | { type: 'hurry'; seconds: number }
  | { type: 'reset' }

export interface ValleyContext {
  // Server ms.
  now: number
  // Ids with an open socket right now, so a member whose close was never
  // heard does not hold up the truck. On a join, the joiner is not yet
  // among them.
  present: readonly string[]
}

export interface Reduced {
  valley: Valley
  // To everyone in the valley, the actor included.
  broadcast: RaidMessage[]
  // A refusal, to the actor alone.
  reply?: NackMessage
  // The bush's answer to a collect, to the actor alone.
  daily?: DailyMessage
  // The lobby alarm: a server time to arm, null to clear, undefined to
  // leave as it is.
  alarm?: number | null
  // A join that must be refused: the client's pickups do not match the
  // raid's, so its indices mean something else.
  reject?: 'stale-build'
  // Rule 11: what goes into or out of an account's pack. A debit is only
  // taken when the pack holds the unit; the valley checks.
  pack?: PackChange
}

export interface PackChange {
  account: string
  kind: string
  // Positive into the pack, negative out of it.
  delta: number
}

// Whether `kind` is carried in the pack (items.ts INVENTORY_KINDS). A
// cabbage rides in the arms and the sack is the raid's, so neither is.
export function isPackKind(kind: string): boolean {
  return INVENTORY_KINDS.includes(kind)
}

function samePickups(a: readonly PickupSpec[], b: readonly PickupSpec[]) {
  return (
    a.length === b.length &&
    a.every((spec, i) => spec.kind === b[i].kind && spec.count === b[i].count)
  )
}

export function createValley(): Valley {
  return { epoch: 0, raid: null, members: {}, dailies: {} }
}

// The bush as `account` finds it at `now`: whether today's berry is gone,
// and when the next day begins.
export function dailyFor(
  valley: Valley,
  account: string,
  now: number
): DailyWire {
  return {
    collected: collectedToday(valley.dailies[account], now),
    resetsAt: nextMidnight(now),
  }
}

const ACTIVE: readonly MemberPhase[] = ['LOBBY', 'RIDING', 'ON_FOOT']

export function toWire(valley: Valley): RaidWire | null {
  const { raid } = valley
  if (!raid) return null
  const members: MemberWire[] = Object.values(valley.members).map(
    ({ id, name, phase, boarded }) => ({ id, name, phase, boarded })
  )
  const { pickups: _pickups, stations: _stations, ...rest } = raid
  return { ...rest, members }
}

function frame(
  valley: Valley,
  reason: RaidReason,
  detail: Partial<
    Pick<RaidMessage, 'by' | 'index' | 'kind' | 'station' | 'item'>
  > = {}
): RaidMessage {
  return { type: 'raid', reason, raid: toWire(valley), ...detail }
}

function nack(re: NackRe, reason: string, index?: number): NackMessage {
  return index === undefined
    ? { type: 'nack', re, reason }
    : { type: 'nack', re, reason, index }
}

function lobbyMembers(valley: Valley): Member[] {
  return Object.values(valley.members).filter((m) => m.phase === 'LOBBY')
}

// Everyone in the lobby is aboard, and there is someone to leave with.
function allAboard(valley: Valley): boolean {
  const lobby = lobbyMembers(valley)
  return lobby.length > 0 && lobby.every((m) => m.boarded)
}

function withMember(valley: Valley, member: Member): Valley {
  return { ...valley, members: { ...valley.members, [member.id]: member } }
}

function withRaid(valley: Valley, raid: SharedRaid | null): Valley {
  return { ...valley, raid }
}

function depart(
  valley: Valley,
  now: number,
  reason: DepartReason
): { valley: Valley; frames: RaidMessage[] } {
  const raid = valley.raid
  if (!raid || raid.phase !== 'LOBBY') return { valley, frames: [] }
  const riders = lobbyMembers(valley)
    .filter((m) => m.boarded)
    .map((m) => m.id)
  const members = { ...valley.members }
  for (const m of Object.values(members)) {
    if (m.phase !== 'LOBBY') continue
    members[m.id] = {
      ...m,
      phase: m.boarded ? 'RIDING' : 'ON_FOOT',
      boarded: false,
    }
  }
  const next: Valley = {
    ...valley,
    members,
    raid: {
      ...raid,
      phase: 'OUT',
      departedAt: now,
      departReason: reason,
      riders,
    },
  }
  return { valley: next, frames: [frame(next, 'depart')] }
}

// Nobody is left in the raid: wipe it so the next arrival starts fresh.
// Members who extracted and are still connected stay listed, out of it.
function maybeReset(
  valley: Valley,
  frames: RaidMessage[]
): { valley: Valley; frames: RaidMessage[]; reset: boolean } {
  if (!valley.raid) return { valley, frames, reset: false }
  const anyone = Object.values(valley.members).some((m) =>
    ACTIVE.includes(m.phase)
  )
  if (anyone) return { valley, frames, reset: false }
  const next = withRaid(valley, null)
  return {
    valley: next,
    frames: [...frames, frame(next, 'reset')],
    reset: true,
  }
}

function freeTruck(
  valley: Valley,
  id: string,
  frames: RaidMessage[]
): { valley: Valley; frames: RaidMessage[] } {
  const raid = valley.raid
  if (!raid?.call || raid.call.by !== id) return { valley, frames }
  const next = withRaid(valley, { ...raid, call: null })
  return { valley: next, frames: [...frames, frame(next, 'truck-free')] }
}

export function reduce(
  valley: Valley,
  action: ValleyAction,
  { now, present }: ValleyContext
): Reduced {
  switch (action.type) {
    case 'join': {
      // Members whose sockets are gone without a word are dropped first.
      const members: Record<string, Member> = {}
      for (const m of Object.values(valley.members)) {
        if (present.includes(m.id)) members[m.id] = m
      }
      let next: Valley = { ...valley, members }
      let alarm: number | undefined
      // Rule 1: an empty valley gets a fresh lobby.
      if (!next.raid || Object.keys(members).length === 0) {
        const loadoutEndsAt = now + CONFIG.raid.loadoutSeconds * 1000
        next = {
          epoch: valley.epoch + 1,
          members: {},
          // The bush keeps its day across raids.
          dailies: valley.dailies,
          raid: {
            epoch: valley.epoch + 1,
            phase: 'LOBBY',
            startedAt: now,
            loadoutEndsAt,
            departedAt: null,
            departReason: null,
            riders: [],
            taken: [],
            shelves: freshStock(action.stations),
            call: null,
            pickups: action.pickups,
            stations: action.stations,
          },
        }
        alarm = loadoutEndsAt
      } else if (
        !samePickups(next.raid.pickups, action.pickups) ||
        next.raid.stations !== action.stations
      ) {
        return { valley, broadcast: [], reject: 'stale-build' }
      }
      const raid = next.raid
      if (!raid) throw new Error('unreachable: a join always has a raid')
      // Rule 2.
      const member: Member = {
        id: action.id,
        account: action.account,
        name: action.name,
        outfit: action.outfit,
        phase: raid.phase === 'LOBBY' ? 'LOBBY' : 'ON_FOOT',
        boarded: false,
      }
      next = withMember(next, member)
      const reduced: Reduced = {
        valley: next,
        broadcast: [frame(next, 'joined', { by: action.id })],
      }
      if (alarm !== undefined) reduced.alarm = alarm
      return reduced
    }

    case 'leave': {
      const member = valley.members[action.id]
      if (!member) return { valley, broadcast: [] }
      const members = { ...valley.members }
      delete members[action.id]
      let next: Valley = { ...valley, members }
      let frames: RaidMessage[] = []
      if (!next.raid) return { valley: next, broadcast: frames }
      frames.push(frame(next, 'left', { by: action.id }))
      ;({ valley: next, frames } = freeTruck(next, action.id, frames))
      let alarm: number | null | undefined
      // Rule 3: the one who left may have been the one everyone waited on.
      if (next.raid?.phase === 'LOBBY' && allAboard(next)) {
        const left = depart(next, now, 'all-aboard')
        next = left.valley
        frames.push(...left.frames)
        alarm = null
      }
      const settled = maybeReset(next, frames)
      const reduced: Reduced = {
        valley: settled.valley,
        broadcast: settled.frames,
      }
      if (settled.reset) reduced.alarm = null
      else if (alarm !== undefined) reduced.alarm = alarm
      return reduced
    }

    case 'board': {
      const member = valley.members[action.id]
      if (
        !member ||
        valley.raid?.phase !== 'LOBBY' ||
        member.phase !== 'LOBBY'
      ) {
        return { valley, broadcast: [], reply: nack('board', 'not-in-lobby') }
      }
      if (member.boarded) {
        return { valley, broadcast: [], reply: nack('board', 'aboard') }
      }
      const next = withMember(valley, { ...member, boarded: true })
      if (allAboard(next)) {
        const left = depart(next, now, 'all-aboard')
        return { valley: left.valley, broadcast: left.frames, alarm: null }
      }
      return {
        valley: next,
        broadcast: [frame(next, 'boarded', { by: action.id })],
      }
    }

    case 'unboard': {
      const member = valley.members[action.id]
      if (!member?.boarded || member.phase !== 'LOBBY') {
        return { valley, broadcast: [], reply: nack('unboard', 'not-aboard') }
      }
      const next = withMember(valley, { ...member, boarded: false })
      return {
        valley: next,
        broadcast: [frame(next, 'unboarded', { by: action.id })],
      }
    }

    case 'clock': {
      const left = depart(valley, now, 'clock')
      return { valley: left.valley, broadcast: left.frames, alarm: null }
    }

    case 'hop-out': {
      const member = valley.members[action.id]
      if (!member || member.phase !== 'RIDING') {
        return { valley, broadcast: [], reply: nack('hop-out', 'not-riding') }
      }
      const next = withMember(valley, { ...member, phase: 'ON_FOOT' })
      return {
        valley: next,
        broadcast: [frame(next, 'hop-out', { by: action.id })],
      }
    }

    case 'take': {
      const member = valley.members[action.id]
      const raid = valley.raid
      if (!member || !raid || member.phase === 'EXTRACTED') {
        return {
          valley,
          broadcast: [],
          reply: nack('take', 'not-in-raid', action.index),
        }
      }
      const spec = raid.pickups[action.index] as PickupSpec | undefined
      if (!spec) {
        return {
          valley,
          broadcast: [],
          reply: nack('take', 'no-such-pickup', action.index),
        }
      }
      // Rule 4.
      if (raid.taken.includes(action.index)) {
        return {
          valley,
          broadcast: [],
          reply: nack('take', 'gone', action.index),
        }
      }
      const next = withRaid(valley, {
        ...raid,
        taken: [...raid.taken, action.index],
      })
      const reduced: Reduced = {
        valley: next,
        broadcast: [
          frame(next, 'taken', { by: action.id, index: action.index }),
        ],
      }
      // Rule 11.
      if (isPackKind(spec.kind) && spec.count > 0) {
        reduced.pack = {
          account: member.account,
          kind: spec.kind,
          delta: spec.count,
        }
      }
      return reduced
    }

    case 'buy': {
      const member = valley.members[action.id]
      const raid = valley.raid
      const { station, kind } = action
      const refuse = (reason: string): Reduced => ({
        valley,
        broadcast: [],
        reply: { type: 'nack', re: 'buy', reason, station, item: kind },
      })
      if (!member || !raid || member.phase === 'EXTRACTED') {
        return refuse('not-in-raid')
      }
      const shelf = raid.shelves[station] as ShopStock | undefined
      if (!shelf || !Object.hasOwn(shelf, kind)) return refuse('no-such-shelf')
      // Rule 8.
      if (!(shelf[kind] > 0)) return refuse('sold-out')
      const shelves = raid.shelves.map((s, i) =>
        i === station ? { ...s, [kind]: s[kind] - 1 } : s
      )
      const next = withRaid(valley, { ...raid, shelves })
      const reduced: Reduced = {
        valley: next,
        broadcast: [
          frame(next, 'bought', { by: action.id, station, item: kind }),
        ],
      }
      // Rule 11.
      if (isPackKind(kind)) {
        reduced.pack = { account: member.account, kind, delta: 1 }
      }
      return reduced
    }

    case 'call': {
      const member = valley.members[action.id]
      const raid = valley.raid
      if (
        !member ||
        !raid ||
        raid.phase !== 'OUT' ||
        member.phase !== 'ON_FOOT'
      ) {
        return { valley, broadcast: [], reply: nack('call', 'not-on-foot') }
      }
      // Rule 5.
      if (raid.call) {
        return { valley, broadcast: [], reply: nack('call', 'busy') }
      }
      const next = withRaid(valley, {
        ...raid,
        call: { by: action.id, from: action.from, to: action.to, at: now },
      })
      return {
        valley: next,
        broadcast: [frame(next, 'call', { by: action.id })],
      }
    }

    case 'extract': {
      const member = valley.members[action.id]
      if (!member || !valley.raid || member.phase === 'EXTRACTED') {
        return { valley, broadcast: [], reply: nack('extract', 'not-in-raid') }
      }
      // Rule 6.
      let next = withMember(valley, {
        ...member,
        phase: 'EXTRACTED',
        boarded: false,
      })
      let frames = [
        frame(next, 'extracted', { by: action.id, kind: action.kind }),
      ]
      ;({ valley: next, frames } = freeTruck(next, action.id, frames))
      let alarm: number | null | undefined
      // Leaving the lobby for good counts as never boarding.
      if (next.raid?.phase === 'LOBBY' && allAboard(next)) {
        const left = depart(next, now, 'all-aboard')
        next = left.valley
        frames.push(...left.frames)
        alarm = null
      }
      // Rule 7.
      const settled = maybeReset(next, frames)
      const reduced: Reduced = {
        valley: settled.valley,
        broadcast: settled.frames,
      }
      if (settled.reset) reduced.alarm = null
      else if (alarm !== undefined) reduced.alarm = alarm
      return reduced
    }

    case 'collect': {
      const member = valley.members[action.id]
      if (!member) {
        return {
          valley,
          broadcast: [],
          reply: nack('collect', 'not-in-valley'),
        }
      }
      // Rule 9.
      const daily = dailyFor(valley, member.account, now)
      if (daily.collected) {
        return {
          valley,
          broadcast: [],
          daily: { type: 'daily', daily, picked: false },
        }
      }
      const today = dayKey(now)
      const dailies: Record<string, string> = {}
      for (const [account, day] of Object.entries(valley.dailies)) {
        if (day === today) dailies[account] = day
      }
      dailies[member.account] = today
      const next: Valley = { ...valley, dailies }
      return {
        valley: next,
        broadcast: [],
        daily: {
          type: 'daily',
          daily: dailyFor(next, member.account, now),
          picked: true,
        },
        // Rule 11.
        pack: { account: member.account, kind: 'berries', delta: 1 },
      }
    }

    case 'use': {
      // Rule 11. Whether the pack holds one is the valley's to check.
      const member = valley.members[action.id]
      if (!member) {
        return { valley, broadcast: [], reply: nack('use', 'not-in-valley') }
      }
      if (!isPackKind(action.kind)) {
        return { valley, broadcast: [], reply: nack('use', 'not-an-item') }
      }
      return {
        valley,
        broadcast: [],
        pack: { account: member.account, kind: action.kind, delta: -1 },
      }
    }

    case 'hurry': {
      const raid = valley.raid
      if (!raid || raid.phase !== 'LOBBY') {
        return { valley, broadcast: [], reply: nack('dev', 'no-lobby') }
      }
      const loadoutEndsAt = now + Math.max(0, action.seconds) * 1000
      const next = withRaid(valley, { ...raid, loadoutEndsAt })
      return {
        valley: next,
        broadcast: [frame(next, 'hurry')],
        alarm: loadoutEndsAt,
      }
    }

    case 'appearance': {
      // Rule 10. The raid frames carry no outfit, and the names in them are
      // read only for who is boarded, so the change goes out to the others
      // as a peer-updated frame (ValleyDO), not as a raid frame.
      const member = valley.members[action.id]
      if (!member) return { valley, broadcast: [] }
      const next = withMember(valley, {
        ...member,
        name: action.name ?? member.name,
        outfit: action.outfit ?? member.outfit,
      })
      return { valley: next, broadcast: [] }
    }

    case 'reset': {
      const next = withRaid(valley, null)
      return { valley: next, broadcast: [frame(next, 'reset')], alarm: null }
    }
  }
}
