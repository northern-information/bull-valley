// The wire protocol between the game and the valley server: one file,
// imported by both the client (net.ts) and the Worker (worker/*.ts), so the
// two can never drift. Pure: no DOM, no Workers types, no Three. Frames are
// JSON text; every number the server stores is checked here first.

import { OUTFIT_IDS } from './outfits.ts'
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

// --- Client → server -------------------------------------------------------

export interface HelloMessage {
  type: 'hello'
  v: number
  name: string
  outfit: OutfitId
}

export interface StateMessage extends PeerStateWire {
  type: 'state'
}

export interface PingMessage {
  type: 'ping'
  // The sender's clock when it sent the ping; echoed in the pong.
  t: number
}

export type ClientMessage = HelloMessage | StateMessage | PingMessage

// --- Server → client -------------------------------------------------------

export interface WelcomeMessage {
  type: 'welcome'
  id: string
  // The server's clock at send time; the client's clock.ts measures the
  // offset from it.
  serverNow: number
  peers: PeerWire[]
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
      const { v, name, outfit } = value
      if (typeof v !== 'number' || !Number.isInteger(v)) return null
      if (typeof name !== 'string' || typeof outfit !== 'string') return null
      // The outfit is checked by the server with isOutfitId; the type here
      // is widened deliberately so a bad id reaches that check.
      return { type: 'hello', v, name, outfit: outfit as OutfitId }
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
