// The wire protocol between the game and the valley server: one file,
// imported by both the client (net.ts) and the Worker (worker/*.ts), so the
// two can never drift. Pure: no DOM, no Workers types, no Three. Frames are
// JSON text; every number the server stores is checked here first.

import { USERNAME_MAX } from './account.ts'
import { isWaterMap } from './waterside.ts'
import type { CorpseWire } from './corpses.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { Drop } from './drops.ts'
import type { Grave } from './graves.ts'
import type { Inventory, Metres, ShopStock, XZ } from './interfaces.ts'
import type { TruckRoutes, TruckState } from './marx.ts'
import type { MazePlace } from './maze.ts'
import type { OutfitId } from './outfits.ts'
import type { Burst, ShadeKind } from './shadowmen.ts'
import type { StandLedger } from './stand.ts'
import type { WaterMap } from './waterside.ts'

// Bump whenever a frame changes shape. A client on an older build is
// closed with CLOSE.badVersion and does not knock again.
export const PROTOCOL_VERSION = 23

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
const STATIONS_MAX = 64

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
// frame; a figure is only drawn once it is placed. cosmetics: what they
// wear over the outfit, as their account holds it (cosmetics.ts), never
// the client's word.
export interface PeerWire {
  id: string
  name: string
  outfit: OutfitId
  cosmetics: CosmeticId[]
  at: PeerStateWire | null
}

// One pickup as this build placed it: what lies there and how many. The
// hello carries every one, in world.pickups order, so the valley knows what
// a take puts in the pack.
export interface PickupSpec {
  kind: string
  count: number
}

// --- The shared world ------------------------------------------------------
// One persistent valley: Matthew Marx's truck, shared pickups, shelves and
// drops. The server owns this state; the rules are in sharedworld.ts and
// every change comes down as a WorldMessage.

// A raider in the valley, as the others see them.
export interface MemberWire {
  id: string
  name: string
}

export interface WorldWire {
  // The Central day the pickups, shelves and drops belong to; they all
  // come back when it turns.
  day: string
  // Indices into world.pickups taken today, in the order they went.
  taken: number[]
  // Every Citgo's shelf stock, indexed like world.fuelPoints. A unit one
  // raider buys is off the shelf for everyone.
  shelves: ShopStock[]
  // What raiders have dropped and nobody has taken up yet.
  drops: Drop[]
  // A tombstone for every shadowman burnt, carved with its name; they stay
  // when the day turns.
  graves: Grave[]
  // Where raiders fell and have not yet taken their things back
  // (sharedworld.ts rule 18); a body lies whatever the day.
  corpses: CorpseWire[]
  // Matthew Marx's truck: its leg, stamped with server ms, and who is in
  // the bed (marx.ts). Every client drives the same leg (truckplan.ts).
  truck: TruckState
  members: MemberWire[]
}

// Where an account last stood on foot, to come back to.
export interface Place {
  x: number
  z: number
  yaw: number
}

// The berry bushes: the one at the spawn Citgo (0) and the ring at the
// maze's heart (1 on), one berry a day each per account, the day turning
// at midnight Central (daily.ts). The server decides; the client reads
// this, in the welcome and in every DailyMessage.
export interface DailyWire {
  // The bushes this account has had today's berry off.
  collected: number[]
  // Server ms of the next midnight Central, when the bushes fill again.
  resetsAt: number
}

// Why a world frame was sent; the client's chat-log lines hang off it.
export type WorldReason =
  | 'joined'
  | 'left'
  | 'boarded'
  | 'hopped-out'
  | 'called'
  | 'ferry'
  | 'depart'
  | 'home'
  | 'donuts'
  | 'back'
  | 'taken'
  | 'bought'
  | 'dropped'
  | 'drop-taken'
  | 'spilled'
  | 'fell'
  | 'looted'
  | 'refill'
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
  // stations. The world is shared by index into both, so a client built
  // from a different placement is turned away.
  pickups: PickupSpec[]
  stations: number
  // Where each station stands, in world.fuelPoints order (its forecourt is
  // a haven from the shadowmen), and the survey's size: the valley steps
  // the shadowmen with them (sharedworld.ts rule 11).
  havens: XZ[]
  metres: Metres
  // Where the water's edges run (waterside.ts): the shadow spiders come up
  // more often near them (rule 11).
  water: WaterMap
  // Where the corn maze lies, or null: the valley steps the Caretaker in
  // it (rule 13).
  maze: MazePlace | null
  // Where Marx parks and how long his joyride takes: the valley never
  // knows the roads (marx.ts).
  truck: TruckRoutes
  // Where the Cabbage Stand stands, or null: the valley tends each
  // account's stand only for a raider beside it (rule 20).
  stand: XZ | null
}

export interface BoardMessage {
  type: 'board'
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

// One unit of `kind` out of the pack, used. The valley takes it off the
// account's pack and answers with a PackMessage, or a nack when there is
// none to use.
export interface UseMessage {
  type: 'use'
  kind: string
}

// `count` of `kind` set down a little ahead of the raider, out of the
// pack. The valley places it where the raider's last state frame put
// them, and refuses a drop the pack cannot cover.
export interface DropMessage {
  type: 'drop'
  kind: string
  count: number
}

// Drop `drop` (its id), taken up. First to ask wins, as with a pickup.
export interface TakeDropMessage {
  type: 'take-drop'
  drop: number
}

// This raider's things taken back off their body `corpse` (its id), into
// the pack (sharedworld.ts rule 18). Only the account that fell may.
export interface LootMessage {
  type: 'loot'
  corpse: number
}

// `count` of `kind` out of the pack into the account's locker (stow), or
// out of the locker into the pack (unstow), at a Citgo (rule 19). The
// valley checks the raider's last state frame put them at one.
export interface StowMessage {
  type: 'stow' | 'unstow'
  kind: string
  count: number
}

// The account's Cabbage Stand, tended (sharedworld.ts rule 20): `count`
// of `kind` out of the pack onto its table, what it has banked collected
// into the wallet, or the next level bought. The valley checks the
// raider's last state frame put them beside it, and answers with a
// StandMessage and a PackMessage, or a nack.
export type StandTendMessage =
  | { type: 'stand-stock'; kind: string; count: number }
  | { type: 'stand-collect' }
  | { type: 'stand-upgrade' }

// Today's berry off bush `bush`, please. The valley answers with a
// DailyMessage either way.
export interface CollectMessage {
  type: 'collect'
  bush: number
}

// Cosmetic `offer` from Moab Coldë, paid for out of the pack
// (sharedworld.ts rule 14). The valley answers with a PackMessage that
// carries it, or a nack.
export interface TradeMessage {
  type: 'trade'
  offer: string
}

// Dev-server only: the Worker stamps the socket, and production ignores
// these. hurry brings the truck's next change to `seconds` from now;
// reset opens the world afresh.
export type DevMessage =
  | { type: 'dev'; op: 'hurry'; seconds: number }
  | { type: 'dev'; op: 'reset' }
  // A shadowman (or a shadow spider) standing still at (x, z), for the
  // specs.
  | { type: 'dev'; op: 'shadowman'; x: number; z: number; spider?: boolean }
  // The Caretaker moved to (x, z), for the specs.
  | { type: 'dev'; op: 'caretaker'; x: number; z: number }
  // A quiet valley for the specs: the crossing shadowmen never rush, and
  // only the ones a spec places do.
  | { type: 'dev'; op: 'calm' }
  // `count` of `kind` into this raider's pack, for the specs.
  | { type: 'dev'; op: 'grant'; kind: string; count: number }

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
  | HopOutMessage
  | TakeMessage
  | BuyMessage
  | CallMessage
  | CollectMessage
  | UseMessage
  | DropMessage
  | TakeDropMessage
  | LootMessage
  | StowMessage
  | StandTendMessage
  | TradeMessage
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
  world: WorldWire
  // Where this account last stood on foot, or null for the spawn Citgo.
  place: Place | null
  // Which bushes still have a berry for this account today.
  daily: DailyWire
  // The account's pack, wallet and cosmetics, as the valley keeps them.
  pack: Inventory
  cash: number
  cosmetics: CosmeticId[]
  // What the account's locker holds (rule 19), and the ids of its bodies
  // lying in the valley (rule 18).
  stash: Inventory
  corpses: number[]
  // The account's progress through the season (season.ts).
  season: SeasonWire
  // The account's progress on the daily task (dailytask.ts).
  task: TaskWire
  // The account's Cabbage Stand (stand.ts).
  stand: StandLedger
}

// The account's Cabbage Stand after it was tended (rule 20), to every
// socket signed in to it: what was done, the ledger as the valley wrote
// it, and for a collect the cents paid into the wallet. A pack frame
// follows with the pack and the wallet.
export interface StandMessage {
  type: 'stand'
  re: 'stock' | 'collect' | 'upgrade'
  stand: StandLedger
  cents?: number
}

// An account's progress through the season (sharedworld.ts rule 15): the
// season's id (season.ts SEASON.id), how many times the account has had a
// beam on the Caretaker as it came apart, and whether the reward is paid.
export interface SeasonWire {
  season: string
  kills: number
  claimed: boolean
}

// The account was credited with unmaking the Caretaker. Sent to every
// socket signed in to it; `rewarded` when this unmaking finished the
// season and paid its reward (a pack frame follows with it).
export interface SeasonMessage {
  type: 'season'
  season: SeasonWire
  rewarded: boolean
}

// An account's progress on the daily task (sharedworld.ts rule 16): the
// task's id (dailytask.ts DAILY_TASK.id), the Central day it counts
// (daily.ts dayKey; empty before the first burn), how many shadowmen the
// account has burned that day, and whether that day's reward is paid.
export interface TaskWire {
  task: string
  day: string
  count: number
  claimed: boolean
}

// The account was credited with burning a shadowman. Sent to every socket
// signed in to it; `rewarded` when this burn finished the day's task and
// paid its reward (a pack frame follows with it).
export interface TaskMessage {
  type: 'task'
  task: TaskWire
  rewarded: boolean
}

// The account's pack, wallet (cents), cosmetics and locker, and the ids of
// its bodies lying in the valley, after a change: a berry, a pickup, a
// purchase, a use, a trade, a fall, a body looted, a move to or from the
// locker. Sent to every socket signed in to the account. The client's pack
// and cash are these, whatever it guessed in the meantime.
export interface PackMessage {
  type: 'pack'
  pack: Inventory
  cash: number
  cosmetics: CosmeticId[]
  stash: Inventory
  corpses: number[]
}

// The answer to a collect at bush `bush`: `picked` when a berry came off
// it, false when this account already had today's. `daily` is the bushes
// as they stand after the answer.
export interface DailyMessage {
  type: 'daily'
  bush: number
  daily: DailyWire
  picked: boolean
}

// The whole shared world after a change, and why. world is null only
// after a dev reset, until the next arrival opens it again.
export interface WorldMessage {
  type: 'world'
  reason: WorldReason
  world: WorldWire | null
  // Who did it, for 'joined', 'left', 'boarded', 'hopped-out', 'called',
  // 'ferry', 'taken', 'bought', 'dropped', 'drop-taken', 'fell', 'looted'.
  by?: string
  // For 'taken'.
  index?: number
  // For 'bought'.
  station?: number
  // For 'bought', 'dropped' and 'drop-taken': the kind.
  item?: string
  // For 'dropped' and 'drop-taken': the drop's id, and how many were set
  // down or taken up.
  drop?: number
  count?: number
  // For 'fell' and 'looted': the body's id.
  corpse?: number
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
  // For 'take-drop'.
  drop?: number
  // For 'loot'.
  corpse?: number
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
// bursting in a beam (0 to 1), and the raider it is rushing. A shadow
// spider says so; a shadowman sends no kind.
export interface ShadowmanWire {
  id: number
  kind?: Extract<ShadeKind, 'spider'>
  x: number
  z: number
  burn: number
  target: string | null
}

// The Caretaker as the valley sends it (rule 15): where it floats, how
// far through being unmade by two beams (0 to 1), and the raider it hunts.
export interface CaretakerWire {
  x: number
  z: number
  burn: number
  target: string | null
}

// Every step of the valley's shadowmen (CONFIG.shadowmen.tickHz a second),
// to everyone: all of them, and the ones that burst this step; the
// Caretaker, null while it is unmade, and where it was unmade this step.
export interface ShadowmenMessage {
  type: 'shadowmen'
  shadowmen: ShadowmanWire[]
  bursts: Burst[]
  caretaker: CaretakerWire | null
  unmade: XZ | null
}

// A shadowman, or the Caretaker, touched this raider.
export interface StruckMessage {
  type: 'struck'
  by?: 'caretaker'
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
  | WorldMessage
  | NackMessage
  | DailyMessage
  | PackMessage
  | PeerChatMessage
  | PongMessage
  | ErrorMessage
  | ShadowmenMessage
  | StruckMessage
  | SeasonMessage
  | TaskMessage
  | StandMessage

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

// The longest joyride the valley believes: a day.
const JOYRIDE_MS_MAX = 24 * 60 * 60 * 1000

// A hello's truck: where it parks, and how long its joyride takes.
function parseRoutes(value: unknown): TruckRoutes | null {
  if (!isRecord(value)) return null
  const home = parseXZ(value.home)
  const { joyrideMs } = value
  if (!home || typeof joyrideMs !== 'number') return null
  if (!Number.isFinite(joyrideMs) || joyrideMs < 0) return null
  if (joyrideMs > JOYRIDE_MS_MAX) return null
  return { home, joyrideMs }
}

// A hello's maze: a place in the survey and a finite turn. Undefined for
// anything else, so a null (no maze) stays apart from a bad one.
function parseMazePlace(value: unknown): MazePlace | undefined {
  const at = parseXZ(value)
  if (!at || !isRecord(value)) return undefined
  const { yaw } = value
  if (typeof yaw !== 'number' || !Number.isFinite(yaw)) return undefined
  return { ...at, yaw }
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
      const water = isWaterMap(value.water) ? value.water : null
      const maze = value.maze === null ? null : parseMazePlace(value.maze)
      const truck = parseRoutes(value.truck)
      const stand = value.stand === null ? null : parseXZ(value.stand)
      // An older build sends none of them; it still parses as far as its
      // version, which the server then refuses.
      if (
        v === PROTOCOL_VERSION &&
        (!havens ||
          !metres ||
          !water ||
          maze === undefined ||
          !truck ||
          (stand === null && value.stand !== null))
      ) {
        return null
      }
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
        water: water ?? { cell: 100, cols: 1, rows: 1, bits: 'AA==' },
        maze: maze ?? null,
        truck: truck ?? { home: { x: 0, z: 0 }, joyrideMs: 0 },
        stand,
      }
    }
    case 'board':
    case 'hop-out':
    case 'rename':
      return { type: value.type }
    case 'collect': {
      const { bush } = value
      return isCount(bush) ? { type: 'collect', bush } : null
    }
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
    case 'drop': {
      const { kind, count } = value
      if (!isKind(kind) || !isCount(count) || count < 1) return null
      return { type: 'drop', kind, count }
    }
    case 'take-drop': {
      const { drop } = value
      return isCount(drop) ? { type: 'take-drop', drop } : null
    }
    case 'loot': {
      const { corpse } = value
      return isCount(corpse) ? { type: 'loot', corpse } : null
    }
    case 'stow':
    case 'unstow': {
      const { kind, count } = value
      if (!isKind(kind) || !isCount(count) || count < 1) return null
      return { type: value.type, kind, count }
    }
    case 'stand-stock': {
      const { kind, count } = value
      if (!isKind(kind) || !isCount(count) || count < 1) return null
      return { type: 'stand-stock', kind, count }
    }
    case 'stand-collect':
    case 'stand-upgrade':
      return { type: value.type }
    case 'trade': {
      // Which offers there are is the valley's to check.
      const { offer } = value
      return isKind(offer) ? { type: 'trade', offer } : null
    }
    case 'call': {
      const from = parseXZ(value.from)
      const to = parseXZ(value.to)
      return from && to ? { type: 'call', from, to } : null
    }
    case 'dev': {
      if (value.op === 'reset') return { type: 'dev', op: 'reset' }
      if (value.op === 'calm') return { type: 'dev', op: 'calm' }
      if (value.op === 'hurry') {
        const { seconds } = value
        if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
          return null
        }
        return { type: 'dev', op: 'hurry', seconds }
      }
      if (value.op === 'grant') {
        const { kind, count } = value
        if (!isKind(kind) || !isCount(count) || count < 1) return null
        return { type: 'dev', op: 'grant', kind, count }
      }
      if (value.op === 'shadowman') {
        const at = parseXZ(value)
        if (!at) return null
        return value.spider === true
          ? { type: 'dev', op: 'shadowman', ...at, spider: true }
          : { type: 'dev', op: 'shadowman', ...at }
      }
      if (value.op === 'caretaker') {
        const at = parseXZ(value)
        return at ? { type: 'dev', op: value.op, ...at } : null
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
