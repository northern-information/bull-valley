// The wire protocol between the game and the valley server: one file,
// imported by both the client (net.ts) and the Worker (worker/*.ts), so the
// two can never drift. Pure: no DOM, no Workers types, no Three. Frames are
// JSON text; every number the server stores is checked here first.

import { OUTFIT_IDS } from './outfits.ts'
import type { ExtractKind, XZ } from './interfaces.ts'
import type { OutfitId } from './outfits.ts'

// Bump whenever a frame changes shape. A client on an older build is
// closed with CLOSE.badVersion and reloads.
export const PROTOCOL_VERSION = 1

// The one WebSocket route; everything else on the Worker is a static asset.
export const WS_PATH = '/ws'

// One valley for everyone: the Durable Object's name. Dev builds may pick
// another instance with ?valley=<id> so parallel e2e specs never meet.
export const VALLEY_NAME = 'bull-valley'
export const VALLEY_PARAM = 'valley'

// A player's name: 1 to NAME_MAX characters after normalizeName().
export const NAME_MAX = 16

// The survey is about 5 km across; nothing legitimate is this far out.
export const MAX_COORD = 20_000

// How a figure stands this instant. Riders stand in the bed, so there is
// no seated pose yet.
export const PEER_POSES = ['stand', 'walk', 'crouch'] as const
export type PeerPose = (typeof PEER_POSES)[number]

// Where a player is and how they stand. y is the height the feet stand on
// (the ground, or the truck bed), so a peer needs no terrain to place a
// figure. yaw follows the player: 0 faces -Z.
export interface PeerStateWire {
  x: number
  y: number
  z: number
  yaw: number
  pose: PeerPose
  riding: boolean
}

// A player as the server knows them. `at` is null until their first state
// frame; a figure is only drawn once it is placed.
export interface PeerWire {
  id: string
  name: string
  outfit: OutfitId
  at: PeerStateWire | null
}

// --- The shared raid -------------------------------------------------------
// One truck, one clock, shared pickups. The server owns this state; the
// rules are in sharedraid.ts and every change comes down as a RaidMessage.

// Where a player is in the raid, as the server tracks it.
export type MemberPhase = 'LOBBY' | 'RIDING' | 'ON_FOOT' | 'EXTRACTED'

export interface MemberWire {
  id: string
  name: string
  phase: MemberPhase
  // Standing in the bed during the lobby, waiting on the others.
  boarded: boolean
}

// A whistle for the truck: who, from where the truck was, to where they
// stood, and when. Every client plans the same road between the two.
export interface TruckCall {
  by: string
  from: XZ
  to: XZ
  at: number
}

export type DepartReason = 'all-aboard' | 'clock'

export interface RaidWire {
  // Counts up with every fresh lobby.
  epoch: number
  phase: 'LOBBY' | 'OUT'
  // Server ms. The clients derive the countdown and the truck's position
  // from these, never from their own frame time.
  startedAt: number
  loadoutEndsAt: number
  departedAt: number | null
  departReason: DepartReason | null
  // Who was in the bed when it left, in seat order.
  riders: string[]
  // Indices into world.pickups, in the order they were taken.
  taken: number[]
  call: TruckCall | null
  members: MemberWire[]
}

// Why a raid frame was sent; the client's toasts hang off it.
export type RaidReason =
  | 'joined'
  | 'left'
  | 'boarded'
  | 'unboarded'
  | 'depart'
  | 'hop-out'
  | 'taken'
  | 'call'
  | 'truck-free'
  | 'extracted'
  | 'hurry'
  | 'reset'

// --- Client → server -------------------------------------------------------

export interface HelloMessage {
  type: 'hello'
  v: number
  name: string
  outfit: OutfitId
  // How many pickups this build placed. A raid is shared by index, so a
  // client built from a different placement is turned away.
  pickups: number
}

export interface BoardMessage {
  type: 'board'
}

export interface UnboardMessage {
  type: 'unboard'
}

export interface HopOutMessage {
  type: 'hop-out'
}

export interface TakeMessage {
  type: 'take'
  index: number
}

export interface CallMessage {
  type: 'call'
  from: XZ
  to: XZ
}

export interface ExtractMessage {
  type: 'extract'
  kind: ExtractKind
}

// Dev-server only: the Worker stamps the socket, and production ignores
// these. hurry rewrites the lobby clock; reset empties the valley.
export type DevMessage =
  { type: 'dev'; op: 'hurry'; seconds: number } | { type: 'dev'; op: 'reset' }

export interface StateMessage extends PeerStateWire {
  type: 'state'
}

export interface PingMessage {
  type: 'ping'
  // The sender's clock when it sent the ping; echoed in the pong.
  t: number
}

export type ClientMessage =
  | HelloMessage
  | StateMessage
  | PingMessage
  | BoardMessage
  | UnboardMessage
  | HopOutMessage
  | TakeMessage
  | CallMessage
  | ExtractMessage
  | DevMessage

// What a client may be refused for.
export type NackRe = Exclude<ClientMessage['type'], 'hello' | 'state' | 'ping'>

// --- Server → client -------------------------------------------------------

export interface WelcomeMessage {
  type: 'welcome'
  id: string
  // The server's clock at send time; the client's clock.ts measures the
  // offset from it.
  serverNow: number
  peers: PeerWire[]
  raid: RaidWire
  phase: MemberPhase
}

// The whole shared raid after a change, and why. raid is null only after a
// reset, when the valley is waiting for its next player.
export interface RaidMessage {
  type: 'raid'
  reason: RaidReason
  raid: RaidWire | null
  // Who did it, for 'joined', 'left', 'boarded', 'unboarded', 'hop-out',
  // 'taken', 'call', 'extracted'.
  by?: string
  // For 'taken'.
  index?: number
  // For 'extracted'.
  kind?: ExtractKind
}

export interface NackMessage {
  type: 'nack'
  re: NackRe
  reason: string
  index?: number
}

export interface PeerJoinedMessage {
  type: 'peer-joined'
  peer: PeerWire
}

export interface PeerStateMessage extends PeerStateWire {
  type: 'peer-state'
  id: string
}

export interface PeerLeftMessage {
  type: 'peer-left'
  id: string
}

export interface PongMessage {
  type: 'pong'
  t: number
  serverNow: number
}

export interface ErrorMessage {
  type: 'error'
  code: string
  message: string
}

export type ServerMessage =
  | WelcomeMessage
  | PeerJoinedMessage
  | PeerStateMessage
  | PeerLeftMessage
  | RaidMessage
  | NackMessage
  | PongMessage
  | ErrorMessage

// Application close codes (the 4xxx range is ours per RFC 6455). The client
// treats every 4xxx close as final and does not reconnect.
export const CLOSE = {
  malformed: 4001,
  badName: 4002,
  badOutfit: 4003,
  badVersion: 4004,
  staleBuild: 4005,
  replaced: 4006,
  serverError: 4500,
} as const

// --- Names -----------------------------------------------------------------

// Canonical form of a typed name: composed Unicode, no control or format
// characters, single spaces, trimmed. Length is not clamped here; a name
// that is too long after this is invalid, not truncated.
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Valid names are already normalized and within length, counted in code
// points so a name of sixteen accented letters passes.
export function isValidName(name: unknown): name is string {
  if (typeof name !== 'string') return false
  if (name !== normalizeName(name)) return false
  const length = Array.from(name).length
  return length >= 1 && length <= NAME_MAX
}

// --- Validation ------------------------------------------------------------

export function isOutfitId(value: unknown): value is OutfitId {
  return typeof value === 'string' && OUTFIT_IDS.some((id) => id === value)
}

export function isPeerPose(value: unknown): value is PeerPose {
  return PEER_POSES.some((pose) => pose === value)
}

const EXTRACT_KINDS: readonly ExtractKind[] = ['truck', 'fuel', 'keep']

export function isExtractKind(value: unknown): value is ExtractKind {
  return EXTRACT_KINDS.some((kind) => kind === value)
}

function isCoord(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_COORD
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseXZ(value: unknown): XZ | null {
  if (!isRecord(value)) return null
  const { x, z } = value
  return isCoord(x) && isCoord(z) ? { x, z } : null
}

// A state as a client may send it: finite coordinates within the survey, a
// known pose, a boolean riding flag.
export function parsePeerState(value: unknown): PeerStateWire | null {
  if (!isRecord(value)) return null
  const { x, y, z, yaw, pose, riding } = value
  if (!isCoord(x) || !isCoord(y) || !isCoord(z)) return null
  if (typeof yaw !== 'number' || !Number.isFinite(yaw)) return null
  if (!isPeerPose(pose)) return null
  if (typeof riding !== 'boolean') return null
  return { x, y, z, yaw, pose, riding }
}

// Parses one text frame from a client. Returns null for anything that is
// not a well-formed message, so the server never stores an unchecked value.
// A hello with a bad name or outfit still parses; the server decides which
// close code those deserve.
export function parseClientMessage(text: string): ClientMessage | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  switch (value.type) {
    case 'hello': {
      const { v, name, outfit, pickups } = value
      if (typeof v !== 'number' || !Number.isInteger(v)) return null
      if (typeof name !== 'string' || typeof outfit !== 'string') return null
      if (typeof pickups !== 'number' || !Number.isInteger(pickups)) return null
      if (pickups < 0) return null
      // The outfit is checked by the server with isOutfitId; the type here
      // is widened deliberately so a bad id reaches that check.
      return { type: 'hello', v, name, outfit: outfit as OutfitId, pickups }
    }
    case 'board':
    case 'unboard':
    case 'hop-out':
      return { type: value.type }
    case 'take': {
      const { index } = value
      if (typeof index !== 'number' || !Number.isInteger(index)) return null
      if (index < 0) return null
      return { type: 'take', index }
    }
    case 'call': {
      const from = parseXZ(value.from)
      const to = parseXZ(value.to)
      return from && to ? { type: 'call', from, to } : null
    }
    case 'extract': {
      const { kind } = value
      return isExtractKind(kind) ? { type: 'extract', kind } : null
    }
    case 'dev': {
      if (value.op === 'reset') return { type: 'dev', op: 'reset' }
      if (value.op === 'hurry') {
        const { seconds } = value
        if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
          return null
        }
        return { type: 'dev', op: 'hurry', seconds }
      }
      return null
    }
    case 'state': {
      const state = parsePeerState(value)
      return state ? { type: 'state', ...state } : null
    }
    case 'ping': {
      const { t } = value
      if (typeof t !== 'number' || !Number.isFinite(t)) return null
      return { type: 'ping', t }
    }
    default:
      return null
  }
}

// Parses one text frame from the server. The client trusts its server, so
// this only guards against a garbled frame.
export function parseServerMessage(text: string): ServerMessage | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value) || typeof value.type !== 'string') return null
  return value as unknown as ServerMessage
}
