// The wire protocol between the game and the valley server: one file,
// imported by both the client (net.ts) and the Worker (worker/*.ts), so the
// two can never drift. Pure: no DOM, no Workers types, no Three. Frames are
// JSON text; every number the server stores is checked here first.

import { USERNAME_MAX } from './account.ts'
import type {
  ExtractKind,
  Inventory,
  Metres,
  ShopStock,
  XZ,
} from './interfaces.ts'
import type { OutfitId } from './outfits.ts'
import type { Burst } from './shadowmen.ts'

// Bump whenever a frame changes shape. A client on an older build is
// closed with CLOSE.badVersion and does not knock again.
export const PROTOCOL_VERSION = 12

// The one WebSocket route; the Worker also answers /auth, and everything
// else is a static asset.
export const WS_PATH = '/ws'

// One valley for everyone: the Durable Object's name. Dev builds may pick
// another instance with ?valley=<id> so parallel e2e specs never meet.
export const VALLEY_NAME = 'bull-valley'
export const VALLEY_PARAM = 'valley'

// A player's name: 1 to NAME_MAX characters after normalizeName(). It is
// the account's username (account.ts isValidUsername, narrower still),
// stamped on the socket by the Worker; the client never sends one.
export const NAME_MAX = USERNAME_MAX

// A chat line: 1 to CHAT_MAX characters after normalizeChat().
export const CHAT_MAX = 120

// More pickups than any build places; a longer hello is refused.
export const PICKUPS_MAX = 1000

// More Citgo stations than any build places.
export const STATIONS_MAX = 64

// An item id or a pickup kind on the wire: items.ts ids are short.
const KIND_MAX = 64

// The survey is about 5 km across; nothing legitimate is this far out.
export const MAX_COORD = 20_000

// How a figure stands this instant. Riders stand in the bed, so there is
// no seated pose yet.
export const PEER_POSES = ['stand', 'walk', 'crouch'] as const
export type PeerPose = (typeof PEER_POSES)[number]

// Where a player is and how they stand. y is the height the feet stand on
// (the ground, or the truck bed), so a peer needs no terrain to place a
// figure. yaw follows the player: 0 faces -Z; pitch is up positive. light:
// the flashlight is up and on. The valley aims each raider's beam from
// these (shadowmen.ts beamFrom).
export interface PeerStateWire {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  pose: PeerPose
  riding: boolean
  light: boolean
}

// A player as the server knows them. `at` is null until their first state
// frame; a figure is only drawn once it is placed.
export interface PeerWire {
  id: string
  name: string
  outfit: OutfitId
  at: PeerStateWire | null
}

// One pickup as this build placed it: what lies there and how many. The
// hello carries every one, in world.pickups order, so the valley knows what
// a take puts in the pack.
export interface PickupSpec {
  kind: string
  count: number
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
  // The account's cargo this raid (sharedraid.ts Cargo): cabbages in the
  // arms.
  carrying: number
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
  // Every Citgo's shelf stock, indexed like world.fuelPoints. A unit one
  // player buys is off the shelf for everyone.
  shelves: ShopStock[]
  call: TruckCall | null
  members: MemberWire[]
}

// The berry bush at the spawn Citgo: one berry a day per account, the day
// turning at midnight Central (daily.ts). The server decides; the client
// reads this, in the welcome and in every DailyMessage.
export interface DailyWire {
  // Whether this account has had today's berry.
  collected: boolean
  // Server ms of the next midnight Central, when the bush fills again.
  resetsAt: number
}

// Why a raid frame was sent; the client's chat-log lines hang off it.
export type RaidReason =
  | 'joined'
  | 'left'
  | 'boarded'
  | 'unboarded'
  | 'depart'
  | 'hop-out'
  | 'taken'
  | 'bought'
  | 'call'
  | 'truck-free'
  | 'extracted'
  | 'hurry'
  | 'reset'

// --- Client → server -------------------------------------------------------

// Who is saying hello comes from the session cookie on the upgrade, not
// from the frame.
export interface HelloMessage {
  type: 'hello'
  v: number
  outfit: OutfitId
  // Every pickup this build placed, in world.pickups order, and how many
  // stations. A raid is shared by index into both, so a client built from
  // a different placement is turned away.
  pickups: PickupSpec[]
  stations: number
  // Where each station stands, in world.fuelPoints order (its forecourt is
  // a haven from the shadowmen), and the survey's size: the valley steps
  // the shadowmen with them (sharedraid.ts rule 13).
  havens: XZ[]
  metres: Metres
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

// Unit `unit` of `kind` (its slot on the facing) off station `station`'s
// shelf, paid for out of the account's wallet. The valley says whether
// that unit was still there and whether the wallet covers it.
export interface BuyMessage {
  type: 'buy'
  station: number
  kind: string
  unit: number
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

// One unit of `kind` out of the pack, used. The valley takes it off the
// account's pack and answers with a PackMessage, or a nack when there is
// none to use.
export interface UseMessage {
  type: 'use'
  kind: string
}

// Today's berry off the bush, please. The valley answers with a
// DailyMessage either way.
export interface CollectMessage {
  type: 'collect'
}

// Dev-server only: the Worker stamps the socket, and production ignores
// these. hurry rewrites the lobby clock; reset empties the valley.
export type DevMessage =
  | { type: 'dev'; op: 'hurry'; seconds: number }
  | { type: 'dev'; op: 'reset' }
  // A shadowman standing still at (x, z), for the specs.
  | { type: 'dev'; op: 'shadowman'; x: number; z: number }

// One line to everyone in the valley. The valley echoes it back to the
// sender too, so every client shows the server's copy.
export interface ChatMessage {
  type: 'chat'
  text: string
}

// Gron changed this raider's character. The outfit is checked by the
// server against the select's roster (characters.ts isSelectable), like
// the hello's.
export interface AppearanceMessage {
  type: 'appearance'
  outfit: OutfitId
}

// Gron changed this raider's username (PUT /auth/username). The frame names
// nothing: the valley reads the account's new username itself, so a client
// can never claim a name.
export interface RenameMessage {
  type: 'rename'
}

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
  | BuyMessage
  | CallMessage
  | ExtractMessage
  | CollectMessage
  | UseMessage
  | ChatMessage
  | AppearanceMessage
  | RenameMessage
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
  // Whether the bush has a berry for this account today.
  daily: DailyWire
  // The account's pack and wallet, as the valley keeps them.
  pack: Inventory
  cash: number
}

// The account's pack and wallet (cents) after a change: a berry, a pickup,
// a purchase, a use. Sent to every socket signed in to the account. The
// client's pack and cash are these, whatever it guessed in the meantime.
export interface PackMessage {
  type: 'pack'
  pack: Inventory
  cash: number
}

// The answer to a collect: `picked` when a berry came off the bush, false
// when this account already had today's. `daily` is the bush as it stands
// after the answer.
export interface DailyMessage {
  type: 'daily'
  daily: DailyWire
  picked: boolean
}

// The whole shared raid after a change, and why. raid is null only after a
// reset, when the valley is waiting for its next player.
export interface RaidMessage {
  type: 'raid'
  reason: RaidReason
  raid: RaidWire | null
  // Who did it, for 'joined', 'left', 'boarded', 'unboarded', 'hop-out',
  // 'taken', 'bought', 'call', 'extracted'.
  by?: string
  // For 'taken'.
  index?: number
  // For 'bought'.
  station?: number
  item?: string
  // For 'extracted'.
  kind?: ExtractKind
}

export interface NackMessage {
  type: 'nack'
  re: NackRe
  reason: string
  // For 'take'.
  index?: number
  // For 'buy'.
  station?: number
  item?: string
}

export interface PeerJoinedMessage {
  type: 'peer-joined'
  peer: PeerWire
}

// A raider already here changed their name or character at Gron. Sent to
// everyone, the raider included, so their own name follows the valley's.
export interface PeerUpdatedMessage {
  type: 'peer-updated'
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

// A chat line as the valley says it: the sender's id and name as the
// server holds them, and the server's clock when it arrived.
export interface PeerChatMessage {
  type: 'chat'
  id: string
  name: string
  text: string
  at: number
}

// One shadowman as the valley sends it: where it is, how far through
// bursting in a beam (0 to 1), and the raider it is rushing.
export interface ShadowmanWire {
  id: number
  x: number
  z: number
  burn: number
  target: string | null
}

// Every step of the valley's shadowmen (CONFIG.shadowmen.tickHz a second),
// to everyone: all of them, and the ones that burst this step.
export interface ShadowmenMessage {
  type: 'shadowmen'
  shadowmen: ShadowmanWire[]
  bursts: Burst[]
}

// A shadowman touched this raider.
export interface StruckMessage {
  type: 'struck'
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
  | PeerUpdatedMessage
  | PeerStateMessage
  | PeerLeftMessage
  | RaidMessage
  | NackMessage
  | DailyMessage
  | PackMessage
  | PeerChatMessage
  | PongMessage
  | ErrorMessage
  | ShadowmenMessage
  | StruckMessage

// Application close codes (the 4xxx range is ours per RFC 6455). The client
// treats every 4xxx close as final and does not reconnect.
export const CLOSE = {
  malformed: 4001,
  badName: 4002,
  badOutfit: 4003,
  badVersion: 4004,
  staleBuild: 4005,
  replaced: 4006,
  // No signed-in account with a username on the upgrade: the client sends
  // the player back to sign in.
  unauthenticated: 4007,
  serverError: 4500,
} as const

// --- Names and chat --------------------------------------------------------

// Canonical form of typed text: composed Unicode, no control or format
// characters, single spaces, trimmed. Length is not clamped here; text that
// is too long after this is invalid, not truncated.
function normalizeText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Normalized and within 1..max, counted in code points so a line of
// accented letters is not cut short.
function isValidText(text: unknown, max: number): text is string {
  if (typeof text !== 'string') return false
  if (text !== normalizeText(text)) return false
  const length = Array.from(text).length
  return length >= 1 && length <= max
}

export const normalizeName = normalizeText
export const normalizeChat = normalizeText

export function isValidName(name: unknown): name is string {
  return isValidText(name, NAME_MAX)
}

export function isValidChat(text: unknown): text is string {
  return isValidText(text, CHAT_MAX)
}

// --- Validation ------------------------------------------------------------

function isPeerPose(value: unknown): value is PeerPose {
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

// A non-negative integer: an index or a count.
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isKind(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= KIND_MAX
  )
}

// A hello's pickups: at most PICKUPS_MAX, each a kind and a count.
function parsePickups(value: unknown): PickupSpec[] | null {
  if (!Array.isArray(value) || value.length > PICKUPS_MAX) return null
  const specs: PickupSpec[] = []
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) return null
    const { kind, count } = entry
    if (!isKind(kind) || !isCount(count)) return null
    specs.push({ kind, count })
  }
  return specs
}

function parseXZ(value: unknown): XZ | null {
  if (!isRecord(value)) return null
  const { x, z } = value
  return isCoord(x) && isCoord(z) ? { x, z } : null
}

// A hello's havens: one place per station.
function parseHavens(value: unknown, stations: number): XZ[] | null {
  if (!Array.isArray(value) || value.length !== stations) return null
  const havens: XZ[] = []
  for (const entry of value as unknown[]) {
    const at = parseXZ(entry)
    if (!at) return null
    havens.push(at)
  }
  return havens
}

function parseMetres(value: unknown): Metres | null {
  if (!isRecord(value)) return null
  const { width, height } = value
  const ok = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 2 * MAX_COORD
  return ok(width) && ok(height) ? { width, height } : null
}

// A state as a client may send it: finite coordinates within the survey, a
// known pose, boolean riding and light flags.
export function parsePeerState(value: unknown): PeerStateWire | null {
  if (!isRecord(value)) return null
  const { x, y, z, yaw, pitch, pose, riding, light } = value
  if (!isCoord(x) || !isCoord(y) || !isCoord(z)) return null
  if (typeof yaw !== 'number' || !Number.isFinite(yaw)) return null
  if (typeof pitch !== 'number' || !(Math.abs(pitch) <= Math.PI / 2)) {
    return null
  }
  if (!isPeerPose(pose)) return null
  if (typeof riding !== 'boolean') return null
  if (typeof light !== 'boolean') return null
  return { x, y, z, yaw, pitch, pose, riding, light }
}

// Parses one text frame from a client. Returns null for anything that is
// not a well-formed message, so the server never stores an unchecked value.
// A hello with a bad outfit still parses; the server decides which
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
      const { v, outfit, pickups, stations } = value
      if (typeof v !== 'number' || !Number.isInteger(v)) return null
      if (typeof outfit !== 'string') return null
      if (!isCount(stations) || stations > STATIONS_MAX) return null
      const specs = parsePickups(pickups)
      if (!specs) return null
      const havens = parseHavens(value.havens, stations)
      const metres = parseMetres(value.metres)
      // An older build sends neither; it still parses as far as its
      // version, which the server then refuses.
      if (v === PROTOCOL_VERSION && (!havens || !metres)) return null
      // The outfit is checked by the server (characters.ts isSelectable); the type here
      // is widened deliberately so a bad id reaches that check. An older
      // build's hello still parses (its name is ignored), so it is told its
      // version is stale rather than that the frame is malformed.
      return {
        type: 'hello',
        v,
        outfit: outfit as OutfitId,
        pickups: specs,
        stations,
        havens: havens ?? [],
        metres: metres ?? { width: 0, height: 0 },
      }
    }
    case 'board':
    case 'unboard':
    case 'hop-out':
    case 'collect':
    case 'rename':
      return { type: value.type }
    case 'appearance': {
      // Widened like the hello's, so a bad id reaches the server's check.
      const { outfit } = value
      return typeof outfit === 'string'
        ? { type: 'appearance', outfit: outfit as OutfitId }
        : null
    }
    case 'take': {
      const { index } = value
      if (!isCount(index)) return null
      return { type: 'take', index }
    }
    case 'buy': {
      const { station, kind, unit } = value
      if (!isCount(station) || !isCount(unit) || !isKind(kind)) return null
      return { type: 'buy', station, kind, unit }
    }
    case 'use': {
      const { kind } = value
      return isKind(kind) ? { type: 'use', kind } : null
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
      if (value.op === 'shadowman') {
        const at = parseXZ(value)
        return at ? { type: 'dev', op: 'shadowman', ...at } : null
      }
      return null
    }
    case 'chat': {
      const { text } = value
      return isValidChat(text) ? { type: 'chat', text } : null
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
