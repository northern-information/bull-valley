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

import { CONFIG } from './config.ts'
import type { ExtractKind, XZ } from './interfaces.ts'
import type { OutfitId } from './outfits.ts'
import type {
  DepartReason,
  MemberPhase,
  MemberWire,
  NackMessage,
  NackRe,
  RaidMessage,
  RaidReason,
  RaidWire,
  TruckCall,
} from './protocol.ts'

export interface Member {
  id: string
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
  call: TruckCall | null
  // How many pickups the build that opened this raid placed.
  pickups: number
}

// Everything the server persists.
export interface Valley {
  epoch: number
  raid: SharedRaid | null
  members: Record<string, Member>
}

export type ValleyAction =
  | {
      type: 'join'
      id: string
      name: string
      outfit: OutfitId
      pickups: number
    }
  | { type: 'leave'; id: string }
  | { type: 'board'; id: string }
  | { type: 'unboard'; id: string }
  | { type: 'hop-out'; id: string }
  | { type: 'take'; id: string; index: number }
  | { type: 'call'; id: string; from: XZ; to: XZ }
  | { type: 'extract'; id: string; kind: ExtractKind }
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
  // To the actor alone.
  reply?: NackMessage
  // The lobby alarm: a server time to arm, null to clear, undefined to
  // leave as it is.
  alarm?: number | null
  // A join that must be refused: the client's pickups do not match the
  // raid's, so its indices mean something else.
  reject?: 'stale-build'
}

export function createValley(): Valley {
  return { epoch: 0, raid: null, members: {} }
}

const ACTIVE: readonly MemberPhase[] = ['LOBBY', 'RIDING', 'ON_FOOT']

export function toWire(valley: Valley): RaidWire | null {
  const { raid } = valley
  if (!raid) return null
  const members: MemberWire[] = Object.values(valley.members).map(
    ({ id, name, phase, boarded }) => ({ id, name, phase, boarded })
  )
  const { pickups: _pickups, ...rest } = raid
  return { ...rest, members }
}

function frame(
  valley: Valley,
  reason: RaidReason,
  detail: Partial<Pick<RaidMessage, 'by' | 'index' | 'kind'>> = {}
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
          raid: {
            epoch: valley.epoch + 1,
            phase: 'LOBBY',
            startedAt: now,
            loadoutEndsAt,
            departedAt: null,
            departReason: null,
            riders: [],
            taken: [],
            call: null,
            pickups: action.pickups,
          },
        }
        alarm = loadoutEndsAt
      } else if (next.raid.pickups !== action.pickups) {
        return { valley, broadcast: [], reject: 'stale-build' }
      }
      const raid = next.raid
      if (!raid) throw new Error('unreachable: a join always has a raid')
      // Rule 2.
      const member: Member = {
        id: action.id,
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
      if (action.index >= raid.pickups) {
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
      return {
        valley: next,
        broadcast: [
          frame(next, 'taken', { by: action.id, index: action.index }),
        ],
      }
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

    case 'reset': {
      const next = withRaid(valley, null)
      return { valley: next, broadcast: [frame(next, 'reset')], alarm: null }
    }
  }
}
