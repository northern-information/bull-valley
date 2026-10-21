// The wire protocol between the game and the valley server: one file,
// imported by both the client (net.ts) and the Worker (worker/*.ts), so the
// two can never drift. Pure: no DOM, no Workers types, no Three. Frames are
// JSON text; every number the server stores is checked here first.

import { USERNAME_MAX } from './account.ts'
import { EMOTE_IDS } from './emotes.ts'
import { isFallHeight } from './fall.ts'
import { isBait, toPondPlace } from './fishing.ts'
import { isHealth } from './health.ts'
import { isFileBody, isFileId, isFileName } from './laptop.ts'
import { isQuestStep } from './quests.ts'
import { isResearchLine } from './recycling.ts'
import { isWaterMap } from './waterside.ts'
import type { CitgoLog } from './citgos.ts'
import type { CorpseWire } from './corpses.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { DealerStock } from './dealer.ts'
import type { Drop } from './drops.ts'
import type { ExpeditionOutcome, ExpeditionRun } from './expeditions.ts'
import type { Hurt } from './fall.ts'
import type { FinishId } from './finishes.ts'
import type {
  AnglerWire,
  Bait,
  CatchOutcome,
  HookWire,
  PondPlace,
} from './fishing.ts'
import type { Grave } from './graves.ts'
import type { Inventory, Metres, ShopStock, XZ } from './interfaces.ts'
import type { LaptopFileInfo } from './laptop.ts'
import type { TruckRoutes, TruckState } from './marx.ts'
import type { MazePlace } from './maze.ts'
import type { OutfitId } from './outfits.ts'
import type { Portal } from './portals.ts'
import type { QuestId, QuestStage, QuestStep } from './quests.ts'
import type { Research, ResearchLine } from './recycling.ts'
import type { Burst, ShadeKind, TruckPose } from './shadowmen.ts'
import type { StandLedger } from './stand.ts'
import type { TunnelKind } from './tunnelshades.ts'
import type { WaterMap } from './waterside.ts'

// Bump whenever a frame changes shape. A client on an older build is
// closed with CLOSE.badVersion and does not knock again.
export const PROTOCOL_VERSION = 43

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

// More Book of Shadows entries than one discover frame may name (book.ts
// has fewer in all).
export const DISCOVER_MAX = 128

// More Citgo stations than any build places.
const STATIONS_MAX = 64
// How many berry bushes a hello may place.
const BUSHES_MAX = 16

// An item id or a pickup kind on the wire: items.ts ids are short.
const KIND_MAX = 64
// The longest peer id a hello may name as its last (a UUID is 36).
const ID_MAX = 64

// The survey is about 5 km across; nothing legitimate is this far out.
export const MAX_COORD = 20_000
// No count on the wire is more than this; what a pack holds is checked
// against the pack, this only keeps the arithmetic sane.
export const COUNT_MAX = 1_000_000
// No frame from a client is longer than this: the hello, with every pickup
// and the water map, is the biggest at a few tens of thousands.
export const FRAME_MAX = 256_000

// How a figure stands this instant: standing, walking, crouched, or one of
// the emotes (emotes.ts EMOTES), each named as it is typed. Riders stand
// in the bed.
export const PEER_POSES = ['stand', 'walk', 'crouch', ...EMOTE_IDS] as const
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
  // What the left hand holds in place of the flashlight (held.ts), for
  // everyone to see; missing while it holds the flashlight. Only a raider
  // holding the flashlight burns a shadow with it.
  held?: HeldWire
}

export type HeldWire = 'jar' | 'rod'

// A player as the server knows them. `at` is null until their first state
// frame; a figure is only drawn once it is placed. cosmetics: what they
// wear over the outfit, as their account holds it (cosmetics.ts), never
// the client's word. level: their account's (progression.ts), read by the
// valley from D1.
export interface PeerWire {
  id: string
  name: string
  outfit: OutfitId
  cosmetics: CosmeticId[]
  level: number
  // Their geometrie left and whole (sharedworld.ts rule 24), stamped by the
  // valley from Valley.wounds as it sends the peer; missing only on the
  // valley's own record of a socket, never on what a client hears.
  health?: number
  max?: number
  at: PeerStateWire | null
  // Dialed in from Bull Valley Dial-Up (sharedworld.ts rule 29): in the
  // valley, but never placed in it, so never drawn.
  dialup?: true
  // Rule 35: their crew's tag, as D1 holds it, shown on their name tag;
  // missing while in no crew.
  crew?: string
}

// One pickup as this build placed it: what lies there and how many. The
// hello carries every one, in world.pickups order, so the valley knows what
// a take puts in the pack.
export interface PickupSpec {
  kind: string
  count: number
  // Where it lies: the valley gives it only to a raider in reach.
  x: number
  z: number
  // The walled room it lies in, as the ring of its corners, when it lies
  // behind walls (the Video Vault's office): the valley gives it only to
  // a raider standing in the room, never one reaching through the wall.
  within?: XZ[]
}

// --- The shared world ------------------------------------------------------
// One persistent valley: Matthew Marx's truck, shared pickups, shelves and
// drops. The server owns this state; the rules are in sharedworld.ts and
// every change comes down as a WorldMessage.

// A raider in the valley, as the others see them.
interface MemberWire {
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
  // What the squatter in the plaza has left to sell today (dealer.ts).
  dealer: DealerStock
  // Where raiders fell and have not yet taken their things back
  // (sharedworld.ts rule 18); a body lies whatever the day.
  corpses: CorpseWire[]
  // The Citgo portals open now (sharedworld.ts rule 28), each with the
  // name of the raider who opened it, the Citgo it goes to, and when it
  // closes.
  portals: Portal[]
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
  | 'charted'
  | 'dropoff'
  | 'taken'
  | 'bought'
  | 'dropped'
  | 'drop-taken'
  | 'spilled'
  | 'fell'
  | 'looted'
  | 'portal-opened'
  | 'portal-closed'
  | 'refill'
  | 'dealt'
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
  // account's stand only for a raider beside it (rule 23).
  stand: XZ | null
  // Where the wreck lies, or null: the valley takes each account's
  // empties only from a raider beside it (rule 33).
  wreck: XZ | null
  // Where each berry bush stands, in sharedworld.ts bush order (the spawn
  // Citgo's, then the maze's ring): a berry only for a raider in reach
  // (rule 8).
  bushes: XZ[]
  // The firefly ponds (fishing.ts pondsOf), none or more: no shadow comes
  // inside their havens (rule 11), and the valley lets a raider fish only
  // from one of them (rule 35).
  ponds: PondPlace[]
  // Where the squatter in Bull Valley Plaza sits, or null: the valley
  // deals only with a raider beside him (rule 25).
  dealer: XZ | null
  // Where the Undercroft lies (undercroft.ts), or null: the valley steps
  // its tunnel shades in it (rule 11).
  undercroft: MazePlace | null
  // The middle of the Citgo portal ring on each station's lot, in
  // world.fuelPoints order (rule 28).
  rings: XZ[]
  // On a reconnect, the id this client had before the line dropped. The
  // valley may not have heard that socket close yet; it retires it if it is
  // the same account's, so the raider is not welcomed back beside their own
  // ghost.
  was?: string
}

// Bull Valley Dial-Up's hello (sharedworld.ts rule 29): the valley without
// a body in it, so nothing of the world is carried, only the outfit the
// raider wears. Who it is comes from the session cookie, as for a hello.
export interface DialMessage {
  type: 'dial'
  v: number
  outfit: OutfitId
  // As a hello's: the id this client had before the line dropped.
  was?: string
}

interface BoardMessage {
  type: 'board'
}

interface HopOutMessage {
  type: 'hop-out'
}

// The first one in the bed picks where Marx goes (sharedworld.ts rule 3):
// a point on the map, or null for the joyride.
interface CharterMessage {
  type: 'charter'
  to: XZ | null
}

interface TakeMessage {
  type: 'take'
  index: number
}

// Unit `unit` of `kind` (its slot on the facing) off station `station`'s
// shelf, paid for out of the account's wallet. The valley says whether
// that unit was still there and whether the wallet covers it.
interface BuyMessage {
  type: 'buy'
  station: number
  kind: string
  unit: number
}

// A whistle: where the client sees the truck (the valley never knows the
// roads). Where it comes to is where the valley last heard the whistler.
interface CallMessage {
  type: 'call'
  from: XZ
}

// One unit of `kind` out of the pack, used. The valley takes it off the
// account's pack and answers with a PackMessage, or a nack when there is
// none to use.
interface UseMessage {
  type: 'use'
  kind: string
}

// One unit of `kind` out of the pack, passed to the raider `to` (their
// peer id) instead of used (sharedworld.ts rule 27): they take it in full,
// the giver a share. The valley refuses a pass to a raider out of reach,
// in the bed, or not in the valley, and one the pack cannot cover.
interface PassMessage {
  type: 'pass'
  kind: string
  to: string
}

// `count` of `kind` set down a little ahead of the raider, out of the
// pack. The valley places it where the raider's last state frame put
// them, and refuses a drop the pack cannot cover.
interface DropMessage {
  type: 'drop'
  kind: string
  count: number
}

// Drop `drop` (its id), taken up. First to ask wins, as with a pickup.
interface TakeDropMessage {
  type: 'take-drop'
  drop: number
}

// This raider's things taken back off their body `corpse` (its id), into
// the pack (sharedworld.ts rule 18). Only the account that fell may.
interface LootMessage {
  type: 'loot'
  corpse: number
}

// The raider landed from a fall of `height` metres (rule 24): where they
// stand is their own word, so the valley takes the client's for how far
// they fell (fall.ts), and answers with a struck frame when it hurt.
interface FallMessage {
  type: 'fall'
  height: number
}

// `count` of `kind` out of the pack into the account's locker (stow), or
// out of the locker into the pack (unstow), at a Citgo (rule 19). The
// valley checks the raider's last state frame put them at one.
interface StowMessage {
  type: 'stow' | 'unstow'
  kind: string
  count: number
}

// The account's Cabbage Stand, tended (sharedworld.ts rule 23): `count`
// of `kind` out of the pack onto its table, what it has banked collected
// into the wallet, or the next level bought. The valley checks the
// raider's last state frame put them beside it, and answers with a
// StandMessage and a PackMessage, or a nack.
type StandTendMessage =
  | { type: 'stand-stock'; kind: string; count: number }
  | { type: 'stand-collect' }
  | { type: 'stand-upgrade' }

// The Recycling Center at the wreck (sharedworld.ts rule 33): the
// account's research, please, or the next level on `line` bought with the
// empties it costs. The valley checks the raider's last state frame put
// them beside the wreck, and answers with a ResearchMessage (and a
// PackMessage after a level), or a nack.
type RecycleTendMessage =
  { type: 'research' } | { type: 'recycle'; line: ResearchLine }

// Fishing at the firefly pond (sharedworld.ts rule 35): the account's
// angler, please; a rod out of the tackle box; nightcrawlers dug out of
// the bank; a line cast with `bait` on the hook; or the line out reeled in
// (`landed`: the fish was spent) or given up. The valley checks the
// raider's last state frame put them at the pond (dialed in, it is
// wherever they are), and answers with an AnglerMessage, a LineMessage or
// a CatchMessage (and a PackMessage), or a nack.
type FishMessage =
  | { type: 'angler' }
  | { type: 'tackle' }
  | { type: 'dig' }
  | { type: 'cast'; bait: Bait }
  | { type: 'reel'; landed: boolean }
  | { type: 'jar-slurm'; station: number; slot: number; index: number }

// An expedition (sharedworld.ts rule 30): a run of `kind` sent out, or the
// run home claimed. Dial-Up only; the valley answers with an
// ExpeditionMessage (and a PackMessage after a claim), or a nack.
type ExpeditionTendMessage =
  { type: 'expedition-send'; kind: string } | { type: 'expedition-claim' }

// A Citgo portal, opened a little ahead of the raider with its twin at the
// last Citgo they stood at (sharedworld.ts rule 28). The valley places it
// where the raider's last state frame put them, and answers with a world
// frame, or a nack.
interface PortalMessage {
  type: 'portal'
}

// Today's berry off bush `bush`, please. The valley answers with a
// DailyMessage either way.
interface CollectMessage {
  type: 'collect'
  bush: number
}

// Cosmetic `offer` from Moab Coldë, paid for out of the pack
// (sharedworld.ts rule 14). The valley answers with a PackMessage that
// carries it, or a nack.
interface TradeMessage {
  type: 'trade'
  offer: string
}

// One step of quest `quest` (sharedworld.ts rule 26): taking the rose
// from Erwin, laying it at the heart of the maze, or coming back to him
// for the key. The valley answers with a QuestFrame and a PackMessage,
// or a nack.
interface QuestMessage {
  type: 'quest'
  quest: string
  step: QuestStep
}

// One of `kind` from Erwin von Dutch in the plaza (sharedworld.ts rule
// 25), bartered for with units of `pay` out of the pack. The valley
// answers with a 'dealt' world frame and a PackMessage, or a nack.
interface DealMessage {
  type: 'deal'
  kind: string
  pay: string
}

// Entries of the Book of Shadows this raider has just come across
// (book.ts ids: a place in reach, a shadow in sight, one of the folk
// spoken to, an item in the pack). The valley writes those the account had
// not found and answers with a BookMessage naming them; which ids are real
// is its to check.
interface DiscoverMessage {
  type: 'discover'
  entries: string[]
}

// Dev-server only: the Worker stamps the socket, and production ignores
// these. hurry brings the truck's next change to `seconds` from now;
// reset opens the world afresh.
type DevMessage =
  | { type: 'dev'; op: 'hurry'; seconds: number }
  | { type: 'dev'; op: 'reset' }
  // A shadowman (or a shadow spider, or a spiderling) standing still at
  // (x, z), for the specs.
  | {
      type: 'dev'
      op: 'shadowman'
      x: number
      z: number
      kind?: Exclude<ShadeKind, 'man'>
    }
  // The Caretaker moved to (x, z), for the specs.
  | { type: 'dev'; op: 'caretaker'; x: number; z: number }
  // A quiet valley for the specs: the crossing shadowmen never rush, and
  // only the ones a spec places do.
  | { type: 'dev'; op: 'calm' }
  // `count` of `kind` into this raider's pack, for the specs.
  | { type: 'dev'; op: 'grant'; kind: string; count: number }
  // `cents` into this raider's wallet, for the specs.
  | { type: 'dev'; op: 'earn'; cents: number }
  // This raider's account at `points` of health (sharedworld.ts rule 24),
  // for the specs.
  | { type: 'dev'; op: 'health'; points: number }

// One line to everyone in the valley. The valley echoes it back to the
// sender too, so every client shows the server's copy.
interface ChatMessage {
  type: 'chat'
  text: string
}

// A whisper (friends.ts, sharedworld.ts rule 21): one line to the raider
// signed in as `to`, by username in any case, under the chat rules. The
// valley sends it to their sockets and echoes it to the sender's; nothing
// is stored.
interface WhisperMessage {
  type: 'whisper'
  to: string
  text: string
}

// Ask the raider named `name` to be friends, or accept their asking.
interface FriendMessage {
  type: 'friend'
  name: string
}

// No longer friends with `name`, or take back a request either way.
interface UnfriendMessage {
  type: 'unfriend'
  name: string
}

// The account's friends list, please (a friends frame answers).
interface FriendsMessage {
  type: 'friends'
}

// Rule 34: invite the raider in the valley signed in as `name`, in any
// case, to this raider's party, or join theirs by inviting back; leave
// the party; or say a line to it alone (under the chat rules and rate,
// never kept).
interface InviteMessage {
  type: 'invite'
  name: string
}

interface PartyLeaveMessage {
  type: 'party-leave'
}

interface PartyChatMessage {
  type: 'party-chat'
  text: string
}

// Rule 35: crews. Start one (its tag and name; the cost comes out of the
// wallet), invite a raider to it by name (the leader alone), join one
// that invited this raider by its tag, leave it, put a member out (the
// leader alone), or say a line to it alone (under the chat rules and
// rate, never kept).
interface CrewCreateMessage {
  type: 'crew-create'
  tag: string
  name: string
}

interface CrewInviteMessage {
  type: 'crew-invite'
  name: string
}

interface CrewJoinMessage {
  type: 'crew-join'
  tag: string
}

interface CrewLeaveMessage {
  type: 'crew-leave'
}

interface CrewKickMessage {
  type: 'crew-kick'
  name: string
}

interface CrewChatMessage {
  type: 'crew-chat'
  text: string
}

// The card of the raider signed in as `name`, in any case, whether they
// are in the valley or not (inspect.ts): an inspected frame answers the
// asker alone.
interface InspectMessage {
  type: 'inspect'
  name: string
}

// Rule 31: the laptop in the Citgo bathroom. Its files listed (a
// laptop-files frame answers), one file's text (laptop-file), a file
// saved as `id` or, with null, as a new one (laptop-saved, then the
// listing), or deleted (the listing). Only the writer's own are theirs to
// save or delete; the valley checks.
interface LaptopListMessage {
  type: 'laptop-list'
}

interface LaptopReadMessage {
  type: 'laptop-read'
  id: string
}

interface LaptopSaveMessage {
  type: 'laptop-save'
  id: string | null
  name: string
  body: string
}

interface LaptopDeleteMessage {
  type: 'laptop-delete'
  id: string
}

// Gron changed this raider's character. The outfit is checked by the
// server against the select's roster (characters.ts isSelectable), like
// the hello's.
interface AppearanceMessage {
  type: 'appearance'
  outfit: OutfitId
}

// Gron changed this raider's username (PUT /auth/username). The frame names
// nothing: the valley reads the account's new username itself, so a client
// can never claim a name.
interface RenameMessage {
  type: 'rename'
}

interface StateMessage extends PeerStateWire {
  type: 'state'
}

// Where Marx's truck stands and faces, as this client drives its leg: sent
// on the state frame's cadence by a client near it, so the valley can aim
// the headlights at the shadowmen (sharedworld.ts seeHeadlights).
interface HeadlightsMessage extends TruckPose {
  type: 'headlights'
}

interface PingMessage {
  type: 'ping'
  // The sender's clock when it sent the ping; echoed in the pong.
  t: number
}

export type ClientMessage =
  | HelloMessage
  | DialMessage
  | StateMessage
  | HeadlightsMessage
  | PingMessage
  | BoardMessage
  | HopOutMessage
  | CharterMessage
  | TakeMessage
  | BuyMessage
  | CallMessage
  | CollectMessage
  | UseMessage
  | PassMessage
  | DropMessage
  | TakeDropMessage
  | PortalMessage
  | LootMessage
  | FallMessage
  | StowMessage
  | StandTendMessage
  | RecycleTendMessage
  | FishMessage
  | ExpeditionTendMessage
  | TradeMessage
  | DealMessage
  | QuestMessage
  | DiscoverMessage
  | ChatMessage
  | WhisperMessage
  | FriendMessage
  | UnfriendMessage
  | FriendsMessage
  | InspectMessage
  | InviteMessage
  | PartyLeaveMessage
  | PartyChatMessage
  | CrewCreateMessage
  | CrewInviteMessage
  | CrewJoinMessage
  | CrewLeaveMessage
  | CrewKickMessage
  | CrewChatMessage
  | LaptopListMessage
  | LaptopReadMessage
  | LaptopSaveMessage
  | LaptopDeleteMessage
  | AppearanceMessage
  | RenameMessage
  | DevMessage

// What a client may be refused for.
export type NackRe = Exclude<
  ClientMessage['type'],
  | 'hello'
  | 'dial'
  | 'state'
  | 'headlights'
  | 'ping'
  | 'friends'
  | 'research'
  | 'angler'
>

// --- Server → client -------------------------------------------------------

export interface WelcomeMessage {
  type: 'welcome'
  id: string
  // The server's clock at send time; the client's clock.ts measures the
  // offset from it.
  serverNow: number
  peers: PeerWire[]
  // Null only for a dial-up raider (rule 29) in a valley no 3D raider
  // has opened a world in yet.
  world: WorldWire | null
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
  // The Book of Shadows entries the account has found (book.ts ids).
  book: string[]
  // The account's progress on the daily task (dailytask.ts).
  task: TaskWire
  // The account's XP in all (progression.ts; sharedworld.ts rule 22).
  xp: number
  // The account's Cabbage Stand (stand.ts).
  stand: StandLedger
  // Where the account stands on each quest (quests.ts).
  quests: Record<QuestId, QuestStage>
  // The account's run out on an expedition (expeditions.ts), or null.
  expedition: ExpeditionRun | null
  // The account's geometrie left and whole (sharedworld.ts rule 24,
  // health.ts).
  health: number
  healthMax: number
  // The account's wards at serverNow (sharedworld.ts rule 27).
  wards: WardLevels
  // Every Citgo the account has stood at, and the last (rule 28).
  citgos: CitgoLog
}

// The account's Citgos after it stood at one not yet the last (rule 28).
// To every socket signed in to it.
interface CitgosMessage {
  type: 'citgos'
  citgos: CitgoLog
}

// The four wards' levels, each from 0 to 1 (wardlevels.ts).
export interface WardLevels {
  high: number
  stimulated: number
  drunk: number
  tripping: number
}

// A quest's step went through (sharedworld.ts rule 26): where the
// account stands on it now. To every socket on the account, with a
// PackMessage after it.
interface QuestFrame {
  type: 'quest'
  quest: QuestId
  step: QuestStep
  stage: QuestStage
}

// An account's expedition after a send or a claim (sharedworld.ts rule
// 30), to every socket signed in to it: the run out, or null, and for a
// claim what the run brought home.
export interface ExpeditionMessage {
  type: 'expedition'
  run: ExpeditionRun | null
  outcome?: ExpeditionOutcome
}

// The account's Cabbage Stand after it was tended (rule 23), to every
// socket signed in to it: what was done, the ledger as the valley wrote
// it, and for a collect the cents paid into the wallet. A pack frame
// follows with the pack and the wallet.
export interface StandMessage {
  type: 'stand'
  re: 'stock' | 'collect' | 'upgrade'
  stand: StandLedger
  cents?: number
}

// The account's research (rule 33), to every socket signed in to it: in
// answer to a research frame, or with `line` the level just bought on it,
// a pack frame following with the empties gone.
export interface ResearchMessage {
  type: 'research'
  research: Research
  line?: ResearchLine
}

// Loose change (rule 33): the dimes found over a burst's, already in the
// wallet, to every socket signed in to the account that took them up.
export interface FoundMessage {
  type: 'found'
  dimes: number
}

// The account's angler (rule 35), to every socket signed in to it: in
// answer to an angler frame, after a dig (`dug`, the nightcrawlers it
// turned up, a pack frame following), after the rod comes out of the
// tackle box (`rod`), and after a catch.
export interface AnglerMessage {
  type: 'angler'
  angler: AnglerWire
  dug?: number
  rod?: true
}

// A line cast (rule 35), to the socket that cast it: `hook` null when
// nothing will bite, after `bitesIn` ms either way (fishing.ts HookWire).
export interface LineMessage {
  type: 'line'
  bitesIn: number
  hook: HookWire | null
}

// A slurm caught in a jar (rule 35), to everyone: slurm `index` of slot
// `slot`'s drop at `station` is off the lot, by raider `by`. The catcher's
// pack frame follows.
export interface SlurmJarredMessage {
  type: 'slurm-jarred'
  station: number
  slot: number
  index: number
  by: string
}

// How the line out ended (rule 35), to the socket that reeled: what came
// in when it was landed, and the skill after, `up` when it rose.
export interface CatchMessage {
  type: 'catch'
  outcome: CatchOutcome
  kind?: string
  skill: number
  up?: true
}

// An account's progress through the season (sharedworld.ts rule 15): the
// season's id (season.ts SEASON.id), how many times the account has had a
// beam on the Caretaker as it came apart, and whether the reward is paid.
export interface SeasonWire {
  season: string
  kills: number
  claimed: boolean
}

// The account was credited with burning the Caretaker. Sent to every
// socket signed in to it; `rewarded` when this burning finished the
// season and paid its reward (a pack frame follows with it).
export interface SeasonMessage {
  type: 'season'
  season: SeasonWire
  rewarded: boolean
}

// Entries newly written in the account's Book of Shadows (sharedworld.ts
// rule 20), in the order found. Sent to every socket signed in to it.
export interface BookMessage {
  type: 'book'
  found: string[]
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

// The account earned XP (sharedworld.ts rule 22). Sent to every socket
// signed in to it: its XP in all now, and how much this added. A new
// level also sends everyone a peer-updated frame for each of its sockets.
export interface XpMessage {
  type: 'xp'
  xp: number
  gained: number
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
  // 'charted', 'ferry', 'taken', 'bought', 'dealt', 'dropped', 'drop-taken', 'fell',
  // 'looted', 'portal-opened'.
  by?: string
  // For 'taken'.
  index?: number
  // For 'bought'.
  station?: number
  // For 'bought', 'dealt', 'dropped' and 'drop-taken': the kind.
  item?: string
  // For 'dropped' and 'drop-taken': the drop's id, and how many were set
  // down or taken up.
  drop?: number
  count?: number
  // For 'fell' and 'looted': the body's id ('fell' has none when a
  // second fall only took the first body away).
  corpse?: number
  // For 'portal-opened': the portal's id.
  portal?: number
}

export interface NackMessage {
  type: 'nack'
  re: NackRe
  reason: string
  // For 'take'.
  index?: number
  // For 'buy' (and 'deal', the item).
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
  // The server's clock when the state reached it, so a client can space
  // a burst of frames that came late as they were sent (presence.ts
  // stampOf). Missing from an older server.
  t?: number
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
  kind?: Exclude<ShadeKind, 'man'>
  x: number
  z: number
  burn: number
  target: string | null
  // How far through its windup before it lunges (0 to 1), when winding up.
  windup?: number
}

// The Caretaker as the valley sends it (rule 13): where it floats, how
// far through being burned by two beams (0 to 1), and the raider it hunts.
export interface CaretakerWire {
  x: number
  z: number
  burn: number
  target: string | null
  // How far through its windup (0 to 1), when winding up, and whether it
  // lunged this step.
  windup?: number
  lunge?: true
}

// A tunnel shade in the Undercroft (tunnelshades.ts), or its Warden, as
// the valley sends it: its id, never reused, where it walks, how near a
// beam has it to bursting (0 to 1), and the raider it hunts.
export interface TunnelShadeWire {
  id: number
  kind: TunnelKind
  x: number
  z: number
  burn: number
  // The share of its hits it has taken (0 to 1; the Warden takes several,
  // CONFIG.tunnel.warden.hits), kept until it bursts.
  hurt: number
  target: string | null
}

// One that burst this step, or (tunnelWounds) took a hit it stands.
export interface TunnelBurstWire extends XZ {
  kind: TunnelKind
}

// Every step of the valley's shadowmen (CONFIG.shadowmen.tickHz a second),
// to everyone: all of them, and the ones that burst this step; the
// Caretaker, null while it is burned, and where it was burned this step.
export interface ShadowmenMessage {
  type: 'shadowmen'
  shadowmen: ShadowmanWire[]
  // The ids of the shadowmen that lunged this step, landing or not.
  lunges: number[]
  bursts: Burst[]
  caretaker: CaretakerWire | null
  burned: XZ | null
  // The Undercroft's tunnel shades, and the ones that burst this step.
  tunnel: TunnelShadeWire[]
  tunnelBursts: TunnelBurstWire[]
  tunnelWounds: TunnelBurstWire[]
}

// A shadow touched this raider, or they landed hard (sharedworld.ts rule
// 24): what (`by`), what it took (`damage`) and what the wards took off it
// (`warded`, rule 27, nothing off a fall),
// and the geometrie the account has left of `max`, 0 when the touch
// shattered it (the account is whole again after, rule 18's fall
// following).
interface StruckMessage {
  type: 'struck'
  by: Hurt
  damage: number
  warded: number
  health: number
  max: number
}

// The account's wards as the valley keeps them (sharedworld.ts rule 27),
// at the moment the frame is sent: after a use, a pass either way, or a
// shattering. To every socket signed in to it.
interface WardsMessage {
  type: 'wards'
  wards: WardLevels
}

// Something passed (rule 27): to the raider who took it, naming who passed
// it (`from`); and back to the giver's sockets naming who took it (`to`).
// Usernames as D1 holds them. A wards frame follows for each side.
export interface PassedMessage {
  type: 'passed'
  kind: string
  from?: string
  to?: string
}

// The account's geometrie left and whole (sharedworld.ts rule 24): given
// back (a forecourt, a use, a dev frame), taken by a touch on another of
// its sockets, or a new level's larger whole. To every socket signed in to
// it.
interface HealthMessage {
  type: 'health'
  health: number
  max: number
}

// A raider's geometrie changed (sharedworld.ts rule 24): a touch, a fall,
// something that heals, a forecourt, a new level. To everyone in the
// valley, so every raider sees every other's bar.
export interface PeerHealthMessage {
  type: 'peer-health'
  id: string
  health: number
  max: number
}

interface PongMessage {
  type: 'pong'
  t: number
  serverNow: number
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
  | ShadowmenMessage
  | StruckMessage
  | HealthMessage
  | PeerHealthMessage
  | WardsMessage
  | CitgosMessage
  | PassedMessage
  | SeasonMessage
  | BookMessage
  | TaskMessage
  | StandMessage
  | ResearchMessage
  | FoundMessage
  | AnglerMessage
  | LineMessage
  | CatchMessage
  | SlurmJarredMessage
  | ExpeditionMessage
  | QuestFrame
  | XpMessage
  | WhisperedMessage
  | FriendsListMessage
  | FriendNewsMessage
  | InspectedMessage
  | PartyMessage
  | PartyNewsMessage
  | PartyChatLineMessage
  | CrewMessage
  | CrewNewsMessage
  | CrewChatLineMessage
  | LaptopFilesMessage
  | LaptopFileMessage
  | LaptopSavedMessage

// Rule 31: every file on the laptop (none of their text), one file's
// text, and the id a save was kept under.
interface LaptopFilesMessage {
  type: 'laptop-files'
  files: LaptopFileInfo[]
}

interface LaptopFileMessage {
  type: 'laptop-file'
  id: string
  body: string
}

interface LaptopSavedMessage {
  type: 'laptop-saved'
  id: string
  name: string
}

// A whisper as the valley delivers it (rule 21), with its own clock: to
// the raider it was for, and back to the sender's sockets with `outgoing`.
// Both names are usernames as D1 holds them.
export interface WhisperedMessage {
  type: 'whisper'
  from: string
  to: string
  text: string
  at: number
  outgoing: boolean
}

// Roughly where a raider is (friends.ts whereabouts): on the phone when
// dialed in from Bull Valley Dial-Up.
export type Whereabouts = 'riding' | 'maze' | 'citgo' | 'valley' | 'phone'

// One name on an account's friends list: a friend, a raider this account
// asked (asked) or one asking it (asking); whether they are in the valley
// now, and roughly where.
export interface FriendWire {
  name: string
  state: 'friend' | 'asked' | 'asking'
  online: boolean
  where: Whereabouts | null
}

// The account's friends list, in answer to a friends frame or after a
// change to it.
interface FriendsListMessage {
  type: 'friends'
  friends: FriendWire[]
}

// News of a friend, for the log: `name` asked to be friends, accepted, or
// came into the valley.
interface FriendNewsMessage {
  type: 'friend-news'
  news: 'asked' | 'accepted' | 'online'
  name: string
}

// One raider's card (inspect.ts), as anyone may see it: their name, level,
// look, how much of the Book of Shadows they have found and how far
// through the season they are, read by the valley from D1. `friend` is
// where the asker stands with them (friends.ts), 'self' for their own
// card. Never an account id.
export interface InspectWire {
  name: string
  level: number
  outfit: OutfitId
  finish: FinishId
  cosmetics: CosmeticId[]
  book: { found: number; of: number }
  season: { kills: number; goal: number; claimed: boolean }
  friend: FriendWire['state'] | 'self' | null
  // Where the asker stands with them in a party (rule 34): in the same
  // one, invited by the asker, inviting the asker, or none of those.
  party: 'member' | 'invited' | 'inviting' | null
  // Rule 35: their crew, and whether the asker may invite them to theirs
  // (the asker leads one, and they are in none).
  crew: { name: string; tag: string } | null
  crewInvite: boolean
  online: boolean
}

// Rule 34: the party as one member is sent it (party.ts partyWire): who
// is in it, by name, each with whether they are in the valley now, and
// who is inviting this raider. Empty members: in no party.
export interface PartyWire {
  members: { name: string; online: boolean }[]
  invites: string[]
}

interface PartyMessage extends PartyWire {
  type: 'party'
}

// News of the party, for the log: `name` invited this raider, or this
// raider's invite went to `name` (sent); `name` joined it, or left it
// (this raider's own name: they did).
export interface PartyNewsMessage {
  type: 'party-news'
  news: 'invited' | 'sent' | 'joined' | 'left'
  name: string
}

// A line said to the party, as the valley delivers it to every member.
export interface PartyChatLineMessage {
  type: 'party-chat'
  from: string
  text: string
  at: number
}

// Rule 35: a crew as a member is sent it (crews.ts crewWire): its name,
// its tag, who leads it, and its members by name (the leader first), each
// with whether they are in the valley now.
export interface CrewWire {
  name: string
  tag: string
  leader: string
  members: { name: string; online: boolean }[]
}

// The account's crew (null: none) and the crews inviting it.
interface CrewMessage {
  type: 'crew'
  crew: CrewWire | null
  invites: { tag: string; name: string }[]
}

// News of a crew, for the log: started; `name` invited by crew `tag`
// (named `crew`), or this raider's invite gone to `name` (sent); `name`
// joined, left, was put out, or leads it now; or it ended.
export interface CrewNewsMessage {
  type: 'crew-news'
  news:
    | 'created'
    | 'invited'
    | 'sent'
    | 'joined'
    | 'left'
    | 'kicked'
    | 'leader'
    | 'ended'
  name: string
  tag: string
  crew: string
}

// A line said to the crew, as the valley delivers it to every member.
export interface CrewChatLineMessage {
  type: 'crew-chat'
  from: string
  text: string
  at: number
}

interface InspectedMessage {
  type: 'inspected'
  card: InspectWire
}

// Application close codes (the 4xxx range is ours per RFC 6455). The client
// treats every 4xxx close as final and does not reconnect.
export const CLOSE = {
  malformed: 4001,
  badName: 4002,
  badOutfit: 4003,
  badVersion: 4004,
  staleBuild: 4005,
  // A reconnect from the same client took this socket's place.
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

// A non-negative integer no bigger than COUNT_MAX: an index or a count.
function isCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= COUNT_MAX
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isKind(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= KIND_MAX
  )
}

// A room's ring of corners: 3 to RING_MAX points.
const RING_MAX = 8
function parseRing(value: unknown): XZ[] | null {
  if (!Array.isArray(value)) return null
  if (value.length < 3 || value.length > RING_MAX) return null
  const ring: XZ[] = []
  for (const point of value as unknown[]) {
    if (!isRecord(point) || !isCoord(point.x) || !isCoord(point.z)) return null
    ring.push({ x: point.x, z: point.z })
  }
  return ring
}

// A hello's pickups: at most PICKUPS_MAX, each a kind and a count.
function parsePickups(value: unknown): PickupSpec[] | null {
  if (!Array.isArray(value) || value.length > PICKUPS_MAX) return null
  const specs: PickupSpec[] = []
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) return null
    const { kind, count, x, z, within } = entry
    if (!isKind(kind) || !isCount(count)) return null
    if (!isCoord(x) || !isCoord(z)) return null
    if (within === undefined) {
      specs.push({ kind, count, x, z })
      continue
    }
    const ring = parseRing(within)
    if (!ring) return null
    specs.push({ kind, count, x, z, within: ring })
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
  return parseSpots(value, stations)
}

// The firefly ponds: at most PONDS_MAX, each a pond place.
const PONDS_MAX = 8

function parsePonds(value: unknown): PondPlace[] | null {
  if (!Array.isArray(value) || value.length > PONDS_MAX) return null
  const ponds: PondPlace[] = []
  for (const entry of value as unknown[]) {
    const pond = toPondPlace(entry)
    if (!pond) return null
    ponds.push(pond)
  }
  return ponds
}

// At most `max` places.
function parseSpots(value: unknown, max: number): XZ[] | null {
  if (!Array.isArray(value) || value.length > max) return null
  const spots: XZ[] = []
  for (const entry of value as unknown[]) {
    const at = parseXZ(entry)
    if (!at) return null
    spots.push(at)
  }
  return spots
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
// known pose, boolean riding and light flags, and a jar or a rod in hand
// or nothing.
export function parsePeerState(value: unknown): PeerStateWire | null {
  if (!isRecord(value)) return null
  const { x, y, z, yaw, pitch, pose, riding, light, held } = value
  if (!isCoord(x) || !isCoord(y) || !isCoord(z)) return null
  if (typeof yaw !== 'number' || !Number.isFinite(yaw)) return null
  if (typeof pitch !== 'number' || !(Math.abs(pitch) <= Math.PI / 2)) {
    return null
  }
  if (!isPeerPose(pose)) return null
  if (typeof riding !== 'boolean') return null
  if (typeof light !== 'boolean') return null
  if (held === undefined) return { x, y, z, yaw, pitch, pose, riding, light }
  if (held !== 'jar' && held !== 'rod') return null
  return { x, y, z, yaw, pitch, pose, riding, light, held }
}

// One client frame, by its type. An intersection rather than an Extract,
// since a stow and an unstow share one shape.
type ClientMessageOf<T extends ClientMessage['type']> = ClientMessage & {
  type: T
}

type Fields = Record<string, unknown>

// A frame's own fields, checked: null for anything malformed.
type ClientParsers = {
  [T in ClientMessage['type']]: (value: Fields) => ClientMessageOf<T> | null
}

// Where a hello says the world places things, all kept in the world.
type HelloPlaces = Pick<
  HelloMessage,
  | 'havens'
  | 'metres'
  | 'water'
  | 'maze'
  | 'truck'
  | 'stand'
  | 'wreck'
  | 'ponds'
  | 'bushes'
  | 'dealer'
  | 'undercroft'
  | 'rings'
>

// An older build's places: none. The server refuses its version before it
// reads any of them.
const NO_PLACES: HelloPlaces = {
  havens: [],
  metres: { width: 0, height: 0 },
  water: { cell: 100, cols: 1, rows: 1, bits: 'AA==' },
  maze: null,
  truck: { home: { x: 0, z: 0 }, joyrideMs: 0 },
  stand: null,
  wreck: null,
  ponds: [],
  bushes: [],
  dealer: null,
  undercroft: null,
  rings: [],
}

// A place a hello may leave null (no maze, no stand): undefined when it is
// neither null nor well formed, so the two stay apart.
function nullable<T>(
  value: unknown,
  parse: (value: unknown) => T | null | undefined
): T | null | undefined {
  return value === null ? null : (parse(value) ?? undefined)
}

// Every place in a hello, or null when any is missing or malformed.
function parseHelloPlaces(value: Fields, stations: number): HelloPlaces | null {
  const havens = parseHavens(value.havens, stations)
  const metres = parseMetres(value.metres)
  const water = isWaterMap(value.water) ? value.water : null
  const truck = parseRoutes(value.truck)
  const bushes = parseSpots(value.bushes, BUSHES_MAX)
  const rings = parseHavens(value.rings, stations)
  if (!havens || !metres || !water || !truck || !bushes || !rings) return null
  const maze = nullable(value.maze, parseMazePlace)
  const stand = nullable(value.stand, parseXZ)
  const wreck = nullable(value.wreck, parseXZ)
  const dealer = nullable(value.dealer, parseXZ)
  const undercroft = nullable(value.undercroft, parseMazePlace)
  if (maze === undefined || stand === undefined) return null
  if (wreck === undefined) return null
  const ponds = parsePonds(value.ponds)
  if (!ponds) return null
  if (dealer === undefined || undercroft === undefined) return null
  const places = { havens, metres, water, maze, truck, stand, bushes, dealer }
  return { ...places, wreck, ponds, undercroft, rings }
}

// A hello. The outfit is checked by the server (characters.ts
// isSelectable); the type here is widened deliberately so a bad id
// reaches that check. An older build's hello still parses (its name is
// ignored, its places read as none), so it is told its version is stale
// rather than that the frame is malformed.
function parseHello(value: Fields): HelloMessage | null {
  const { v, outfit, pickups, stations, was } = value
  if (typeof v !== 'number' || !Number.isInteger(v)) return null
  if (typeof outfit !== 'string') return null
  if (!isCount(stations) || stations > STATIONS_MAX) return null
  const specs = parsePickups(pickups)
  if (!specs) return null
  const places = parseHelloPlaces(value, stations)
  if (!places && v === PROTOCOL_VERSION) return null
  return {
    type: 'hello',
    v,
    outfit: outfit as OutfitId,
    pickups: specs,
    stations,
    ...(places ?? NO_PLACES),
    ...(typeof was === 'string' && was.length <= ID_MAX ? { was } : {}),
  }
}

// `count` of `kind`, at least one: a drop, a stow either way, the stand's
// stock, a grant.
function parseUnits(value: Fields): { kind: string; count: number } | null {
  const { kind, count } = value
  if (!isKind(kind) || !isCount(count) || count < 1) return null
  return { kind, count }
}

// A frame that names nothing but its type.
function bare<T extends string>(type: T): () => { type: T } {
  return () => ({ type })
}

// Dev-server only frames, by their op (the Worker checks the stamp).
const DEV_OPS: Record<string, (value: Fields) => DevMessage | null> = {
  reset: () => ({ type: 'dev', op: 'reset' }),
  calm: () => ({ type: 'dev', op: 'calm' }),
  hurry: ({ seconds }) =>
    typeof seconds === 'number' && Number.isFinite(seconds)
      ? { type: 'dev', op: 'hurry', seconds }
      : null,
  grant: (value) => {
    const units = parseUnits(value)
    return units && { type: 'dev', op: 'grant', ...units }
  },
  earn: ({ cents }) =>
    isCount(cents) && cents > 0 ? { type: 'dev', op: 'earn', cents } : null,
  health: ({ points }) =>
    isHealth(points) && points > 0
      ? { type: 'dev', op: 'health', points }
      : null,
  shadowman: (value) => {
    const at = parseXZ(value)
    if (!at) return null
    const { kind } = value
    return kind === 'spider' || kind === 'spiderling'
      ? { type: 'dev', op: 'shadowman', ...at, kind }
      : { type: 'dev', op: 'shadowman', ...at }
  },
  caretaker: (value) => {
    const at = parseXZ(value)
    return at && { type: 'dev', op: 'caretaker', ...at }
  },
}

const CLIENT_PARSERS: ClientParsers = {
  hello: parseHello,
  dial: ({ v, outfit, was }) => {
    if (typeof v !== 'number' || !Number.isInteger(v)) return null
    if (typeof outfit !== 'string') return null
    return {
      type: 'dial',
      v,
      outfit: outfit as OutfitId,
      ...(typeof was === 'string' && was.length <= ID_MAX ? { was } : {}),
    }
  },
  board: bare('board'),
  'hop-out': bare('hop-out'),
  charter: ({ to }) => {
    if (to === null) return { type: 'charter', to: null }
    const at = parseXZ(to)
    return at && { type: 'charter', to: at }
  },
  portal: bare('portal'),
  rename: bare('rename'),
  friends: bare('friends'),
  'laptop-list': bare('laptop-list'),
  'laptop-read': ({ id }) =>
    isFileId(id) ? { type: 'laptop-read', id } : null,
  'laptop-save': ({ id, name, body }) =>
    (id === null || isFileId(id)) && isFileName(name) && isFileBody(body)
      ? { type: 'laptop-save', id, name, body }
      : null,
  'laptop-delete': ({ id }) =>
    isFileId(id) ? { type: 'laptop-delete', id } : null,
  'stand-collect': bare('stand-collect'),
  research: bare('research'),
  angler: bare('angler'),
  tackle: bare('tackle'),
  dig: bare('dig'),
  cast: ({ bait }) => (isBait(bait) ? { type: 'cast', bait } : null),
  reel: ({ landed }) =>
    typeof landed === 'boolean' ? { type: 'reel', landed } : null,
  // Which slurms there are, and whether one crawls, is the valley's to
  // check.
  'jar-slurm': ({ station, slot, index }) =>
    isCount(station) && Number.isInteger(slot) && isCount(index)
      ? {
          type: 'jar-slurm',
          station,
          slot: slot as number,
          index,
        }
      : null,
  recycle: ({ line }) =>
    isResearchLine(line) ? { type: 'recycle', line } : null,
  'stand-upgrade': bare('stand-upgrade'),
  'expedition-claim': bare('expedition-claim'),
  // Which runs there are is the valley's to check.
  'expedition-send': ({ kind }) =>
    isKind(kind) ? { type: 'expedition-send', kind } : null,
  whisper: ({ to, text }) =>
    isValidName(to) && isValidChat(text) ? { type: 'whisper', to, text } : null,
  friend: ({ name }) => (isValidName(name) ? { type: 'friend', name } : null),
  unfriend: ({ name }) =>
    isValidName(name) ? { type: 'unfriend', name } : null,
  inspect: ({ name }) => (isValidName(name) ? { type: 'inspect', name } : null),
  invite: ({ name }) => (isValidName(name) ? { type: 'invite', name } : null),
  'party-leave': bare('party-leave'),
  'party-chat': ({ text }) =>
    isValidChat(text) ? { type: 'party-chat', text } : null,
  // The tag's and the name's rules are the valley's to check (crews.ts).
  'crew-create': ({ tag, name }) =>
    typeof tag === 'string' && tag.length <= 8 && isValidName(name)
      ? { type: 'crew-create', tag, name }
      : null,
  'crew-invite': ({ name }) =>
    isValidName(name) ? { type: 'crew-invite', name } : null,
  'crew-join': ({ tag }) =>
    typeof tag === 'string' && tag.length > 0 && tag.length <= 8
      ? { type: 'crew-join', tag }
      : null,
  'crew-leave': bare('crew-leave'),
  'crew-kick': ({ name }) =>
    isValidName(name) ? { type: 'crew-kick', name } : null,
  'crew-chat': ({ text }) =>
    isValidChat(text) ? { type: 'crew-chat', text } : null,
  collect: ({ bush }) => (isCount(bush) ? { type: 'collect', bush } : null),
  // Widened like the hello's, so a bad id reaches the server's check.
  appearance: ({ outfit }) =>
    typeof outfit === 'string'
      ? { type: 'appearance', outfit: outfit as OutfitId }
      : null,
  take: ({ index }) => (isCount(index) ? { type: 'take', index } : null),
  buy: ({ station, kind, unit }) =>
    isCount(station) && isCount(unit) && isKind(kind)
      ? { type: 'buy', station, kind, unit }
      : null,
  use: ({ kind }) => (isKind(kind) ? { type: 'use', kind } : null),
  pass: ({ kind, to }) =>
    isKind(kind) && typeof to === 'string' && to.length > 0 && to.length <= 64
      ? { type: 'pass', kind, to }
      : null,
  drop: (value) => {
    const units = parseUnits(value)
    return units && { type: 'drop', ...units }
  },
  'take-drop': ({ drop }) =>
    isCount(drop) ? { type: 'take-drop', drop } : null,
  loot: ({ corpse }) => (isCount(corpse) ? { type: 'loot', corpse } : null),
  fall: ({ height }) =>
    isFallHeight(height) ? { type: 'fall', height } : null,
  stow: (value) => {
    const units = parseUnits(value)
    return units && { type: 'stow', ...units }
  },
  unstow: (value) => {
    const units = parseUnits(value)
    return units && { type: 'unstow', ...units }
  },
  'stand-stock': (value) => {
    const units = parseUnits(value)
    return units && { type: 'stand-stock', ...units }
  },
  // Which offers there are is the valley's to check.
  trade: ({ offer }) => (isKind(offer) ? { type: 'trade', offer } : null),
  // Which quests there are is the valley's to check.
  quest: ({ quest, step }) =>
    isKind(quest) && isQuestStep(step) ? { type: 'quest', quest, step } : null,
  // What he sells is the valley's to check.
  deal: ({ kind, pay }) =>
    isKind(kind) && isKind(pay) ? { type: 'deal', kind, pay } : null,
  discover: ({ entries }) =>
    Array.isArray(entries) &&
    entries.length >= 1 &&
    entries.length <= DISCOVER_MAX &&
    entries.every(isKind)
      ? { type: 'discover', entries }
      : null,
  call: (value) => {
    const from = parseXZ(value.from)
    return from && { type: 'call', from }
  },
  dev: (value) =>
    typeof value.op === 'string' && Object.hasOwn(DEV_OPS, value.op)
      ? DEV_OPS[value.op](value)
      : null,
  chat: ({ text }) => (isValidChat(text) ? { type: 'chat', text } : null),
  state: (value) => {
    const state = parsePeerState(value)
    return state && { type: 'state', ...state }
  },
  headlights: ({ x, y, z, heading }) =>
    isCoord(x) &&
    isCoord(y) &&
    isCoord(z) &&
    typeof heading === 'number' &&
    Number.isFinite(heading)
      ? { type: 'headlights', x, y, z, heading }
      : null,
  ping: ({ t }) =>
    typeof t === 'number' && Number.isFinite(t) ? { type: 'ping', t } : null,
}

// Parses one text frame from a client. Returns null for anything that is
// not a well-formed message, so the server never stores an unchecked value.
export function parseClientMessage(text: string): ClientMessage | null {
  if (text.length > FRAME_MAX) return null
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value) || typeof value.type !== 'string') return null
  if (!Object.hasOwn(CLIENT_PARSERS, value.type)) return null
  const parse = CLIENT_PARSERS[value.type as ClientMessage['type']]
  return parse(value)
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
