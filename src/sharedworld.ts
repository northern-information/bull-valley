// The shared world, as the server runs it: one persistent valley everyone
// online is in. Pure and Three-free: a reducer over a Valley value that
// returns the next value, the frames to send, and when to wake next.
// worker/ValleyDO.ts is the plumbing around it; the client reads the
// resulting WorldWire in worldsync.ts. tests/unit/sharedworld.test.ts holds
// every rule.
//
// The rules:
// 1. The world is persistent. The first build to arrive opens it, and it
//    is kept from then on, whoever comes and goes; only a build on a newer
//    protocol (whose placements differ) opens it afresh. A client whose
//    pickups or stations differ from the world's is turned away.
// 2. A raider comes back where their account last stood on foot, or at the
//    spawn Citgo the first time (Valley.places).
// 3. Matthew Marx's truck is the valley's (marx.ts): his reading and his
//    donuts, his countdown once anyone is in the bed, the joyride out and
//    home, and the whistle. Anyone arriving while he is at his donuts
//    brings him home.
// 4. A pickup goes to whoever asks first; the rest are told it is gone.
// 5. One whistle at a time, and only an empty truck answers it: it drives
//    to the whistler, who climbs in and is driven home to the Citgo. A
//    whistler who leaves sends it home empty.
// 6. The day turns at midnight Central (daily.ts): every pickup is back,
//    the shelves are full again, and what lay dropped is gone (the
//    tombstones stay, rule 17).
// 7. The Citgo shelves are shared: a unit one raider buys is off the shelf
//    for everyone until the day turns. The buyer picks the unit, so the
//    valley keeps which units are left. A unit is paid for out of the
//    buyer's wallet, which is their account's; the valley refuses a sale
//    it does not cover (ValleyContext.cash in, Reduced.spend out).
// 8. Each berry bush gives each account one berry a day: the one at the
//    spawn Citgo (bush 0) and the ring round the portal at the maze's heart
//    (1 to CONFIG.maze.bushes.count). The valley remembers only the
//    accounts that have had today's berry off each. Two sockets signed in
//    to one account share one berry a bush.
// 9. Gron changes a raider's name and character at any time. The change
//    touches only how they are shown.
// 10. Every item a raider carries is their account's (the pack), kept by
//    the valley and never by the client: a berry, a pickup (a cabbage
//    included), a unit bought off a shelf (a pack or a bottle goes in
//    full: items.ts contentsOf), a drop taken up; a use or a drop takes it
//    out. This reducer says what changes (Reduced.pack) and
//    worker/ValleyDO.ts writes it.
// 11. The shadowmen are the valley's: one field everyone sees, crossing the
//    bubble round every raider (shadowmen.ts). A raider on foot, out of the
//    bed, and not coming to from a strike can be rushed; a touch strikes
//    them alone, and they are left alone for the strike's length after.
//    Anyone's beam burns them, and one that bursts leaves a drop of dimes
//    where it was (drops.ts dimesFor), lying like any drop (rule 12);
//    dimes taken up are cash, into the taker's wallet (Reduced.earn), never
//    the pack. Among them come the shadow spiders, twice the height, far
//    more often near the water the world was opened with (waterside.ts),
//    twice as long to burn, and each leaves a $20 bill, cash the same way.
//    Marx's headlights burn them too, crediting no one: the valley never
//    knows the roads, so it aims them from where a raider near the truck
//    last said it stood (seeHeadlights), and only while that is fresh. The valley steps the field (stepShadows) and keeps it in
//    memory only: the shadowmen are gone whenever no one is placed in the
//    valley.
// 12. A raider out of the bed can drop what their pack holds (the valley
//    takes it off the account's pack first, and the drop stands only once
//    it has). It lands a little ahead of where their last state frame put
//    them (drops.ts). Anyone can take a drop up, first to ask wins. Drops
//    last until the day turns.
// 13. The Caretaker keeps the corn maze (caretaker.ts): one for the whole
//    valley, stepped with the shadowmen and, like them, in memory only.
//    It walks the maze's paths, hunts a raider in the maze it sees who
//    could be rushed by a shadowman, and its touch strikes them the same
//    way. One beam does nothing to it; two raiders' beams on it at once,
//    held, unmake it, and it forms again at the heart minutes later.
//    Unmade, it leaves two 1 troy ounce bars of gold bullion lying where
//    it was (drops.ts spillsOf), each a drop like any other (rule 12) that
//    goes into the taker's pack.
// 14. Moab Coldë trades cosmetics for what the pack holds (cosmetics.ts):
//    the Flaming Halo for one troy ounce of gold bullion. A cosmetic is the
//    account's for good, so he never sells one twice; the valley refuses a
//    trade the pack does not cover (ValleyContext.holdings in,
//    Reduced.trade out) and writes the price and the cosmetic together.
// 15. The season (season.ts): every raider whose beam was on the
//    Caretaker when it came apart is credited with the unmaking, once per
//    account however many of its sockets held a beam on it. The progress
//    is the account's, kept by the valley in D1 beside the wallet, and the
//    unmaking that finishes the season pays its reward once.
// 16. The daily task (dailytask.ts): every raider whose beam was on a
//    shadowman as it burst is credited with the burn, once per account
//    however many of its sockets held a beam on it. The progress is the
//    account's for the Central day, kept by the valley in D1 beside the
//    wallet, and the burn that finishes the day's task pays its reward
//    once that day.
// 17. Every shadowman that bursts (rule 11) is named (names.ts, drawn by
//    the valley) and leaves a tombstone carved with its name a step from
//    where it burst (graves.ts). The graves outlast the day's turn; past
//    CONFIG.graves.max the oldest goes.
// 18. Corpse runs (corpses.ts): a strike leaves everything the raider's
//    pack held on their body, where their last state frame put them; the
//    valley takes it all out of the account's pack first, and lays the
//    body only once it has (Reduced.corpse), or gives it back. The wallet
//    and the locker are untouched. Only the account that fell can take its
//    things back (Reduced.give), and a body lies until it does: the day's
//    turn leaves it, and so does a world opened afresh, since the bodies
//    are the valley's (Valley.corpses), not the world's.
// 19. The stash (stash.ts): every account has one locker, in the back room
//    of every Citgo, the same from any of them. A raider out of the bed
//    whose last state frame put them at a station can move what their pack
//    holds into it, or back (Reduced.stash); the valley moves it only when
//    the side it comes out of holds it.
// 20. The Book of Shadows (book.ts): every entry a raider comes across (a
//    place in reach, a shadow in sight, one of the folk spoken to, an item
//    in the pack) is written in the account's book once, at the first
//    time; an ask names only what the raider met, and only the real
//    entries the account had not found are news (book.ts newlyFound).
//    The book is the account's, kept by the valley in D1.
// 21. Friends and whispers (friends.ts): a raider asks another by name,
//    and they are friends once the other asks back; the friendships are
//    the accounts', in D1 beside them, and only usernames go on the wire.
//    A friend's list says whether they are in the valley and roughly where
//    (whereabouts, from their last state frame); a request either way says
//    neither. A whisper goes to the sockets of the raider it names, and
//    back to the sender's, under the chat rules and the chat rate; nothing
//    is kept.
// 22. The raider's level (progression.ts): one XP bar for the account,
//    fed by everything. A shadowman or spider burst in the raider's beam,
//    the Caretaker unmade with it (a big jump), a ride with Marx that
//    gets home with them in the bed, the day's berry off a bush, a pickup,
//    a unit bought, a drop the valley left taken up, and what the Cabbage
//    Stand pays out when collected (by the cents, rule 23) each earn the
//    account XP (Reduced.xp, and stepShadows' xp); a raider's own drop
//    taken up earns none. Every grant is named here, worth what
//    progression.ts XP says; the valley adds it to the account's XP in D1
//    and tells everyone when it reaches a new level.
// 23. The Cabbage Stand (stand.ts): every account keeps its own ledger at
//    the one stand on the spawn Citgo's lot, where the world was opened
//    with it (SharedWorld.stand). A raider out of the bed whose last state
//    frame put them beside it can put cabbages and berries out of the pack
//    on its table, collect what it banked on the valley's clock into the
//    wallet, or buy its next level with cash and goods (ValleyContext.stand
//    in, Reduced.stand out); the valley writes the ledger, the pack and the
//    wallet together, or none of them. A collect earns XP by the cents it
//    pays (stand.ts standXp, rule 22).
// 24. Health (health.ts): every account has CONFIG.health.max points, kept
//    by the valley (Valley.health, only the accounts below whole), so no
//    reconnect or second tab heals. Any shadow's touch (rules 11 and 13)
//    takes one, once a step however many of the account's sockets were
//    touched, and lets the raider alone for CONFIG.health.graceSeconds
//    where they stand. The touch that takes the last is the strike of rule
//    18 (Reduced.health.fatal), and the account is whole again after. A
//    raider on foot whose last state frame put them on a Citgo forecourt
//    is made whole, and a use of medicine that heals (items.ts heals),
//    once the pack has given the unit up, gives its points back.
// 25. Buffs (buffs.ts): every account's geometrie (geometrie.ts) is kept
//    by the valley (Valley.geometrie, on its clock in seconds, only the
//    accounts not sober), dosed by each use once the pack has given the
//    unit up, and made sober by the strike of rule 18. It does things: a
//    raider's high reaches their beam further and wider (shadowRaiders),
//    and their drunk shrugs a touch off by a chance the valley draws (the
//    hit's roll; no point lost, Reduced.health.shrugged). A raider on foot
//    can pass a unit to another account's raider on foot within
//    CONFIG.buffs.passReach of them, each where their last state frame put
//    them: the pass takes it out of the giver's pack, then the shared
//    doses the taker in full and the giver at CONFIG.buffs.shareScale, and
//    earns the giver XP for sharing (rule 22); the valley gives the taker
//    its heal (rule 24). The stimulated's quicker sprint is the client's.

import {
  buffedBeam,
  dosed,
  geometrieOf,
  inPassReach,
  scaled,
  shrugs,
  sobered,
} from './buffs.ts'
import { caretakerAt, createCaretaker, stepCaretaker } from './caretaker.ts'
import { CONFIG } from './config.ts'
import { corpseWire, isEmpty } from './corpses.ts'
import { affords, cosmeticById, MOAB_OFFERS } from './cosmetics.ts'
import { collectedToday, dayKey, nextMidnight } from './daily.ts'
import { centsOf, dropSpot, isCash, takeUp } from './drops.ts'
import { levelsAt } from './geometrie.ts'
import { bury } from './graves.ts'
import {
  healthOf,
  hit,
  isWhole,
  MAX_HEALTH,
  mend,
  withHealth,
} from './health.ts'
import { contentsOf, INVENTORY_KINDS, isUsable, itemById } from './items.ts'
import {
  arrive,
  board,
  call,
  createTruck,
  hopOut,
  hurry,
  isAboard,
  leave,
  nextChange,
  refused,
  settleTruck,
} from './marx.ts'
import { worldToMaze } from './maze.ts'
import { PROTOCOL_VERSION } from './protocol.ts'
import {
  beamFrom,
  burnSecondsOf,
  createShadowmen,
  headlightBeam,
  inHaven,
  placeStill,
  stepShadowmen,
} from './shadowmen.ts'
import {
  affordsUpgrade,
  atStand,
  collect as collectStand,
  standXp,
  stock as stockStand,
  upgradePrice,
  upgrade as upgradeStand,
} from './stand.ts'
import { atLocker } from './stash.ts'
import { freshStock, onShelf, takeUnit } from './store.ts'
import type { Caretaker } from './caretaker.ts'
import type { Corpse } from './corpses.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { Drop, Facing, Spill } from './drops.ts'
import type { Geometrie } from './geometrie.ts'
import type { Burial, Grave } from './graves.ts'
import type { Inventory, Metres, ShopStock, XZ } from './interfaces.ts'
import type { TruckChange, TruckRoutes, TruckState } from './marx.ts'
import type { MazePlace } from './maze.ts'
import type { OutfitId } from './outfits.ts'
import type { XpGrant, XpSource } from './progression.ts'
import type {
  CaretakerWire,
  DailyMessage,
  DailyWire,
  GeometrieLevels,
  NackMessage,
  NackRe,
  PeerStateWire,
  PickupSpec,
  Place,
  ShadowmenMessage,
  WorldMessage,
  WorldReason,
  WorldWire,
} from './protocol.ts'
import type { Rng } from './rng.ts'
import type {
  Beam,
  Raider,
  ShadeKind,
  ShadowmenField,
  TruckPose,
} from './shadowmen.ts'
import type { StandLedger } from './stand.ts'
import type { WaterMap } from './waterside.ts'

// A raider online: one socket.
export interface Member {
  id: string
  // The signed-in account (worker/auth.ts). Never on the wire.
  account: string
  name: string
  outfit: OutfitId
}

export interface SharedWorld {
  // The protocol of the build that opened it (rule 1).
  version: number
  // The Central day its pickups, shelves and drops belong to (rule 6).
  day: string
  // Indices into world.pickups taken today, in the order they went.
  taken: number[]
  shelves: ShopStock[]
  // Rule 12: what lies dropped, and the id the next drop gets.
  drops: Drop[]
  nextDrop: number
  // Rule 17: the tombstones, and the id the next one gets.
  graves: Grave[]
  nextGrave: number
  truck: TruckState
  // What the build that opened it placed: the pickups, the station count,
  // each station's forecourt and the survey's size (the shadowmen's), where
  // the maze lies (the Caretaker's, or null), and the truck's roads.
  pickups: PickupSpec[]
  stations: number
  havens: XZ[]
  metres: Metres
  // Where the water's edges run (rule 11: the spiders).
  water: WaterMap
  maze: MazePlace | null
  routes: TruckRoutes
  // Where the Cabbage Stand stands, or null (rule 23).
  stand: XZ | null
}

// Everything the server persists.
export interface Valley {
  world: SharedWorld | null
  members: Record<string, Member>
  // An account at a bush (bushKey) -> the Central day (daily.ts dayKey)
  // that account last took a berry off it. Pruned to today's on every
  // pick, so it never grows.
  dailies: Record<string, string>
  // Account -> where it last stood on foot (rule 2).
  places: Record<string, Place>
  // Rule 18: the bodies lying in the valley, each with the account that
  // fell (never on the wire), and the id the next one gets.
  corpses: ValleyCorpse[]
  nextCorpse: number
  // Rule 24: account -> its health, while below whole.
  health: Record<string, number>
  // Rule 25: account -> its geometrie, while not sober, on the valley's
  // clock in seconds.
  geometrie: Record<string, Geometrie>
}

export interface ValleyCorpse extends Corpse {
  account: string
}

// Rule 8: how many berry bushes there are (the spawn Citgo's, then the
// maze's), and the key the valley remembers one account's day at one bush
// under. Bush 0's is the bare account, as it was when it was the only one.
export const BUSHES = 1 + CONFIG.maze.bushes.count

export function bushKey(account: string, bush: number): string {
  return bush === 0 ? account : `${account}/${bush}`
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
      havens: XZ[]
      metres: Metres
      water: WaterMap
      maze: MazePlace | null
      routes: TruckRoutes
      stand: XZ | null
    }
  // at: where their last state frame put them, or null.
  | { type: 'leave'; id: string; at: PeerStateWire | null }
  | { type: 'board'; id: string }
  | { type: 'hop-out'; id: string }
  | { type: 'take'; id: string; index: number }
  | { type: 'buy'; id: string; station: number; kind: string; unit: number }
  | { type: 'call'; id: string; from: XZ; to: XZ }
  | { type: 'collect'; id: string; bush: number }
  | { type: 'use'; id: string; kind: string }
  // Rule 25: a unit of `kind` passed from `id` to `to`. from and at: where
  // each raider's last state frame put them, or null when the valley has
  // not heard one.
  | {
      type: 'pass'
      id: string
      to: string
      kind: string
      from: Spot | null
      at: Spot | null
    }
  // Rule 25: once the pack gave it up, what a use doses (`to` absent), or
  // a pass doses both sides.
  | { type: 'dose'; id: string; kind: string; to?: string }
  // Rule 12. at: where the raider's last state frame put them, or null
  // when the valley has not heard one.
  | { type: 'drop'; id: string; kind: string; count: number; at: Facing | null }
  | { type: 'take-drop'; id: string; drop: number }
  // Rules 11, 13 and 17: what the valley leaves of its own accord: the
  // dimes burst shadowmen leave and their tombstones, and the Caretaker's
  // gold bullion.
  | { type: 'spill'; spills: Spill[]; burials?: Burial[] }
  // Rule 18: struck, with `items` already out of the account's pack. at:
  // where the raider's last state frame put them, or null.
  | { type: 'fall'; id: string; items: Inventory; at: Facing | null }
  | { type: 'loot'; id: string; corpse: number }
  // Rule 24: a shadow's touch; points given back (by), or made whole (no
  // by: a forecourt).
  // roll: drawn from 0 to 1 by the valley for the drunk's shrug (rule 25).
  | { type: 'hit'; id: string; roll?: number }
  | { type: 'mend'; id: string; by?: number }
  // A dev server's: the account at `points`, for the specs.
  | { type: 'set-health'; id: string; points: number }
  // Rule 19: `count` of `kind` into the locker (stow) or out of it
  // (unstow). at: where the raider's last state frame put them, or null.
  | {
      type: 'stow' | 'unstow'
      id: string
      kind: string
      count: number
      at: XZ | null
    }
  // Rule 23: the account's Cabbage Stand tended. at: where the raider's
  // last state frame put them, or null.
  | {
      type: 'stand-stock'
      id: string
      kind: string
      count: number
      at: XZ | null
    }
  | { type: 'stand-collect' | 'stand-upgrade'; id: string; at: XZ | null }
  // Rule 14: cosmetic `offer` from Moab.
  | { type: 'trade'; id: string; offer: string }
  // Rule 9: a new name, a new character, or both.
  | { type: 'appearance'; id: string; name?: string; outfit?: OutfitId }
  // The valley's own clock: the truck and the day, moved on.
  | { type: 'clock' }
  | { type: 'hurry'; seconds: number }
  | { type: 'reset' }

export interface ValleyContext {
  // Server ms.
  now: number
  // Ids with an open socket right now, so a member whose close was never
  // heard is dropped. On a join, the joiner is not yet among them.
  present: readonly string[]
  // For a buy: the buyer's wallet in cents, as the valley just read it.
  cash?: number
  // For a trade: the trader's pack and cosmetics, as the valley just read
  // them.
  holdings?: { pack: Inventory; cosmetics: readonly CosmeticId[] }
  // For tending the stand: the account's ledger, pack and wallet (cents),
  // as the valley just read them.
  stand?: { ledger: StandLedger; pack: Inventory; cash: number }
}

export interface Reduced {
  valley: Valley
  // To everyone in the valley, the actor included.
  broadcast: WorldMessage[]
  // A refusal, to the actor alone.
  reply?: NackMessage
  // The bush's answer to a collect, to the actor alone.
  daily?: DailyMessage
  // When the valley next needs waking (the truck's next change, or the
  // day's turn), or null with nobody here to see it.
  alarm: number | null
  // A join that must be refused: the client's pickups do not match the
  // world's, so its indices mean something else.
  reject?: 'stale-build'
  // Rule 10: what goes into or out of an account's pack. A debit is only
  // taken when the pack holds the unit; the valley checks.
  pack?: PackChange
  // Rule 7: what a sale costs the buyer's wallet. The valley takes it
  // before the sale stands.
  spend?: { account: string; amount: number }
  // Rule 11: what dimes taken up pay into the taker's wallet, in cents.
  earn?: { account: string; amount: number }
  // Rule 14: a trade that stands once the valley has taken the price out
  // of the account's pack and given it the cosmetic, together.
  trade?: {
    account: string
    cosmetic: CosmeticId
    price: { kind: string; count: number }
  }
  // Rule 18: the id of the body a fall laid. A fall that lays none leaves
  // the valley to give the items back.
  corpse?: number
  // Rule 18: a body's things, back into its account's pack.
  give?: { account: string; items: Inventory }
  // Rule 24: an account's health after a hit or a mend, for its sockets;
  // fatal when the hit took the last point (the account is whole again).
  // shrugged when the drunk shrugged it off (rule 25), and nothing lost.
  health?: {
    account: string
    points: number
    fatal?: true
    shrugged?: true
  }
  // Rule 25: each account's geometrie after a dose or a shattering, for
  // its sockets.
  geometrie?: { account: string; levels: GeometrieLevels }[]
  // Rule 25: a pass the valley allowed, once the giver's pack gives the
  // unit up (pack): who to (their id and account) and what.
  passed?: { to: string; account: string; kind: string }
  // Rule 19: units of `kind` into the account's locker out of its pack
  // (positive), or back (negative). The valley moves them only when the
  // side they come out of holds them.
  stash?: PackChange
  // Rule 22: the XP each account earned, a grant at a time.
  xp?: XpGrant[]
  // Rule 23: the account's stand as tended, written together with what it
  // took out of the pack and what it paid into the wallet (or, negative,
  // took out of it), or not at all.
  stand?: StandChange
}

export interface StandChange {
  account: string
  re: 'stock' | 'collect' | 'upgrade'
  ledger: StandLedger
  // Units out of the pack, each count positive.
  items: Inventory
  // Cents into the wallet, or out of it when negative.
  cash: number
}

export interface PackChange {
  account: string
  kind: string
  // Positive into the pack, negative out of it.
  delta: number
}

// Whether `kind` is carried in the pack (items.ts INVENTORY_KINDS).
function isPackKind(kind: string): boolean {
  return INVENTORY_KINDS.includes(kind)
}

function samePickups(a: readonly PickupSpec[], b: readonly PickupSpec[]) {
  return (
    a.length === b.length &&
    a.every((spec, i) => spec.kind === b[i].kind && spec.count === b[i].count)
  )
}

export function createValley(): Valley {
  return {
    world: null,
    members: {},
    dailies: {},
    places: {},
    corpses: [],
    nextCorpse: 0,
    health: {},
    geometrie: {},
  }
}

// The valley as an older build stored it, made current: the fresh one
// fills in newer fields, and a world opened on another protocol (an older
// build's raid included) is dropped, so the next arrival opens it afresh.
// The berries, the places, the bodies, the health and the geometrie carry
// over.
export function restoreValley(stored: Partial<Valley>): Valley {
  const valley = { ...createValley(), ...stored }
  const world: Partial<SharedWorld> | null = valley.world ?? null
  if (!world || world.version !== PROTOCOL_VERSION) {
    return { ...valley, world: null }
  }
  return valley
}

// The bushes as `account` finds them at `now`: which have given up
// today's berry, and when the next day begins.
export function dailyFor(
  valley: Valley,
  account: string,
  now: number
): DailyWire {
  const collected: number[] = []
  for (let bush = 0; bush < BUSHES; bush++) {
    const day = valley.dailies[bushKey(account, bush)]
    if (collectedToday(day, now)) collected.push(bush)
  }
  return { collected, resetsAt: nextMidnight(now) }
}

// Rule 18: the ids of `account`'s bodies lying in the valley.
export function corpsesOf(valley: Valley, account: string): number[] {
  return valley.corpses.filter((c) => c.account === account).map((c) => c.id)
}

// Rule 24: `account`'s health.
export function healthFor(valley: Valley, account: string): number {
  return healthOf(valley.health, account)
}

// Rule 25: `account`'s geometrie levels at `now` (ms on the valley's
// clock).
export function geometrieFor(
  valley: Valley,
  account: string,
  now: number
): GeometrieLevels {
  return levelsAt(geometrieOf(valley.geometrie, account), now / 1000)
}

// Rule 2: where `account` comes back to, or null for the spawn Citgo.
export function placeOf(valley: Valley, account: string): Place | null {
  return valley.places[account] ?? null
}

export function toWire(valley: Valley): WorldWire | null {
  const { world } = valley
  if (!world) return null
  return {
    day: world.day,
    taken: world.taken,
    shelves: world.shelves,
    drops: world.drops,
    graves: world.graves,
    corpses: valley.corpses.map(corpseWire),
    truck: world.truck,
    members: Object.values(valley.members).map(({ id, name }) => ({
      id,
      name,
    })),
  }
}

type Detail = Partial<
  Pick<
    WorldMessage,
    'by' | 'index' | 'station' | 'item' | 'drop' | 'count' | 'corpse'
  >
>

function frame(
  valley: Valley,
  reason: WorldReason,
  detail: Detail = {}
): WorldMessage {
  return { type: 'world', reason, world: toWire(valley), ...detail }
}

function nack(re: NackRe, reason: string, index?: number): NackMessage {
  return index === undefined
    ? { type: 'nack', re, reason }
    : { type: 'nack', re, reason, index }
}

function withWorld(valley: Valley, world: SharedWorld): Valley {
  return { ...valley, world }
}

function withTruck(valley: Valley, world: SharedWorld, truck: TruckState) {
  return withWorld(valley, { ...world, truck })
}

// When the valley next needs waking: the truck's next change or the day's
// turn, whichever comes first; null with no world or nobody in it.
export function wakeAt(valley: Valley, now: number): number | null {
  const { world } = valley
  if (!world || Object.keys(valley.members).length === 0) return null
  const truck = nextChange(world.truck, world.routes)
  const midnight = nextMidnight(now)
  return truck === null ? midnight : Math.min(truck, midnight)
}

const TRUCK_REASONS: Record<TruckChange, WorldReason> = {
  depart: 'depart',
  home: 'home',
  donuts: 'donuts',
  back: 'back',
}

// The world moved on to `now`: the day turned (rule 6), and the truck
// through every change due (rule 3). The frames say each, oldest first.
function settle(
  valley: Valley,
  now: number
): { valley: Valley; frames: WorldMessage[]; xp: XpGrant[] } {
  const world = valley.world
  if (!world) return { valley, frames: [], xp: [] }
  let next = valley
  const frames: WorldMessage[] = []
  const today = dayKey(now)
  if (world.day !== today) {
    next = withWorld(next, {
      ...world,
      day: today,
      taken: [],
      shelves: freshStock(world.stations),
      drops: [],
    })
    frames.push(frame(next, 'refill'))
  }
  const settled = settleTruck(world.truck, now, world.routes)
  // Rule 22: whoever was still in the bed when Marx got home rode with
  // him; one hopping out on the way did not.
  const xp = settled.changes.includes('home')
    ? grantsTo(valley, world.truck.riders, 'ride')
    : []
  if (settled.changes.length > 0 && next.world) {
    next = withTruck(next, next.world, settled.truck)
    for (const change of settled.changes) {
      frames.push(frame(next, TRUCK_REASONS[change]))
    }
  }
  return { valley: next, frames, xp }
}

// Rule 22: a grant of `source` to the account behind each socket id, once
// per account.
function grantsTo(
  valley: Valley,
  ids: readonly string[],
  source: XpSource
): XpGrant[] {
  return creditedWith(valley, ids).map((account) => ({ account, source }))
}

function done(
  valley: Valley,
  now: number,
  rest: Omit<Reduced, 'valley' | 'alarm'>
): Reduced {
  return { valley, alarm: wakeAt(valley, now), ...rest }
}

export function reduce(
  before: Valley,
  action: ValleyAction,
  context: ValleyContext
): Reduced {
  const { now } = context
  // Whatever was due has happened before anything else does.
  const settled = settle(before, now)
  const r = act(settled.valley, action, context)
  const broadcast = [...settled.frames, ...r.broadcast]
  if (r.reject) {
    return { ...r, broadcast, alarm: wakeAt(before, now), valley: before }
  }
  const xp = [...settled.xp, ...(r.xp ?? [])]
  return { ...r, broadcast, ...(xp.length > 0 ? { xp } : {}) }
}

function act(
  valley: Valley,
  action: ValleyAction,
  { now, present, cash, holdings, stand }: ValleyContext
): Reduced {
  switch (action.type) {
    case 'join': {
      // Members whose sockets are gone without a word are dropped first.
      const members: Record<string, Member> = {}
      for (const m of Object.values(valley.members)) {
        if (present.includes(m.id)) members[m.id] = m
      }
      let world = valley.world
      // Rule 1.
      if (!world) {
        world = {
          version: PROTOCOL_VERSION,
          day: dayKey(now),
          taken: [],
          shelves: freshStock(action.stations),
          drops: [],
          nextDrop: 0,
          graves: [],
          nextGrave: 0,
          truck: createTruck(now),
          pickups: action.pickups,
          stations: action.stations,
          havens: action.havens,
          metres: action.metres,
          water: action.water,
          maze: action.maze,
          routes: action.routes,
          stand: action.stand,
        }
      } else if (
        !samePickups(world.pickups, action.pickups) ||
        world.stations !== action.stations
      ) {
        return done(valley, now, { broadcast: [], reject: 'stale-build' })
      }
      // Rule 3: dropped riders leave the bed; Marx comes home from his
      // donuts for the new arrival.
      let truck = world.truck
      for (const id of truck.riders) {
        if (!members[id]) truck = leave(truck, id, now)
      }
      truck = arrive(truck, now)
      members[action.id] = {
        id: action.id,
        account: action.account,
        name: action.name,
        outfit: action.outfit,
      }
      const next: Valley = { ...valley, members, world: { ...world, truck } }
      return done(next, now, {
        broadcast: [frame(next, 'joined', { by: action.id })],
      })
    }

    case 'leave': {
      const member = valley.members[action.id]
      if (!member) return done(valley, now, { broadcast: [] })
      const members = { ...valley.members }
      delete members[action.id]
      let next: Valley = { ...valley, members }
      const world = next.world
      // Rule 2: where they stood on foot is where they come back.
      const at = action.at
      if (at && !at.riding && !(world && isAboard(world.truck, action.id))) {
        next = {
          ...next,
          places: {
            ...next.places,
            [member.account]: { x: at.x, z: at.z, yaw: at.yaw },
          },
        }
      }
      if (!world) return done(next, now, { broadcast: [] })
      next = withTruck(next, world, leave(world.truck, action.id, now))
      return done(next, now, {
        broadcast: [frame(next, 'left', { by: action.id })],
      })
    }

    case 'board':
    case 'hop-out':
    case 'call': {
      const world = valley.world
      const re = action.type
      if (!valley.members[action.id] || !world) {
        return done(valley, now, {
          broadcast: [],
          reply: nack(re, 'not-in-valley'),
        })
      }
      // Rule 3.
      const truck =
        action.type === 'board'
          ? board(world.truck, action.id, now)
          : action.type === 'hop-out'
            ? hopOut(world.truck, action.id)
            : call(world.truck, action.id, action.from, action.to, now)
      if (refused(truck)) {
        return done(valley, now, {
          broadcast: [],
          reply: nack(re, truck.refused),
        })
      }
      const next = withTruck(valley, world, truck)
      const reason: WorldReason =
        action.type === 'board'
          ? truck.leg.kind === 'ferry'
            ? 'ferry'
            : 'boarded'
          : action.type === 'hop-out'
            ? 'hopped-out'
            : 'called'
      return done(next, now, {
        broadcast: [frame(next, reason, { by: action.id })],
      })
    }

    case 'take': {
      const member = valley.members[action.id]
      const world = valley.world
      if (!member || !world) {
        return done(valley, now, {
          broadcast: [],
          reply: nack('take', 'not-in-valley', action.index),
        })
      }
      const spec = world.pickups[action.index] as PickupSpec | undefined
      if (!spec) {
        return done(valley, now, {
          broadcast: [],
          reply: nack('take', 'no-such-pickup', action.index),
        })
      }
      // Rule 4.
      if (world.taken.includes(action.index)) {
        return done(valley, now, {
          broadcast: [],
          reply: nack('take', 'gone', action.index),
        })
      }
      const next = withWorld(valley, {
        ...world,
        taken: [...world.taken, action.index],
      })
      const reduced = done(next, now, {
        broadcast: [
          frame(next, 'taken', { by: action.id, index: action.index }),
        ],
        // Rule 22.
        xp: [{ account: member.account, source: 'pickup' }],
      })
      // Rule 10.
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
      const world = valley.world
      const { station, kind, unit } = action
      const refuse = (reason: string): Reduced =>
        done(valley, now, {
          broadcast: [],
          reply: { type: 'nack', re: 'buy', reason, station, item: kind },
        })
      if (!member || !world) return refuse('not-in-valley')
      const shelf = world.shelves[station] as ShopStock | undefined
      const price = itemById(kind)?.price
      if (!shelf || !Object.hasOwn(shelf, kind) || price === undefined) {
        return refuse('no-such-shelf')
      }
      // Rule 7.
      if (!onShelf(shelf, kind, unit)) return refuse('sold-out')
      if (cash === undefined || cash < price) return refuse('short')
      const shelves = world.shelves.map((s, i) =>
        i === station ? takeUnit(s, kind, unit) : s
      )
      const next = withWorld(valley, { ...world, shelves })
      const reduced = done(next, now, {
        broadcast: [
          frame(next, 'bought', { by: action.id, station, item: kind }),
        ],
        spend: { account: member.account, amount: price },
        // Rule 22.
        xp: [{ account: member.account, source: 'purchase' }],
      })
      // Rule 10.
      if (isPackKind(kind)) {
        reduced.pack = {
          account: member.account,
          kind,
          delta: contentsOf(kind),
        }
      }
      return reduced
    }

    case 'collect': {
      const member = valley.members[action.id]
      if (!member) {
        return done(valley, now, {
          broadcast: [],
          reply: nack('collect', 'not-in-valley'),
        })
      }
      // Rule 8.
      const { bush } = action
      if (!Number.isInteger(bush) || bush < 0 || bush >= BUSHES) {
        return done(valley, now, {
          broadcast: [],
          reply: nack('collect', 'no-such-bush'),
        })
      }
      const daily = dailyFor(valley, member.account, now)
      if (daily.collected.includes(bush)) {
        return done(valley, now, {
          broadcast: [],
          daily: { type: 'daily', bush, daily, picked: false },
        })
      }
      const today = dayKey(now)
      const dailies: Record<string, string> = {}
      for (const [key, day] of Object.entries(valley.dailies)) {
        if (day === today) dailies[key] = day
      }
      dailies[bushKey(member.account, bush)] = today
      const next: Valley = { ...valley, dailies }
      return done(next, now, {
        broadcast: [],
        daily: {
          type: 'daily',
          bush,
          daily: dailyFor(next, member.account, now),
          picked: true,
        },
        // Rule 10.
        pack: { account: member.account, kind: 'berries', delta: 1 },
        // Rule 22.
        xp: [{ account: member.account, source: 'berry' }],
      })
    }

    case 'use': {
      // Rule 10. Whether the pack holds one is the valley's to check.
      const member = valley.members[action.id]
      if (!member) {
        return done(valley, now, {
          broadcast: [],
          reply: nack('use', 'not-in-valley'),
        })
      }
      if (!isPackKind(action.kind)) {
        return done(valley, now, {
          broadcast: [],
          reply: nack('use', 'not-an-item'),
        })
      }
      return done(valley, now, {
        broadcast: [],
        pack: { account: member.account, kind: action.kind, delta: -1 },
      })
    }

    case 'drop': {
      // Rule 12.
      const member = valley.members[action.id]
      const world = valley.world
      const { kind, count } = action
      const refuse = (reason: string): Reduced =>
        done(valley, now, {
          broadcast: [],
          reply: { type: 'nack', re: 'drop', reason },
        })
      if (!member || !world) return refuse('not-in-valley')
      // Nothing goes over the side of the truck, moving or parked.
      if (isAboard(world.truck, action.id)) return refuse('aboard')
      if (!action.at) return refuse('no-position')
      if (!isPackKind(kind)) return refuse('not-an-item')
      if (count < 1) return refuse('nothing')
      const id = world.nextDrop
      const drop: Drop = { id, kind, count, ...dropSpot(action.at, id) }
      const next = withWorld(valley, {
        ...world,
        drops: [...world.drops, drop],
        nextDrop: id + 1,
      })
      return done(next, now, {
        broadcast: [
          frame(next, 'dropped', {
            by: action.id,
            item: kind,
            drop: id,
            count,
          }),
        ],
        // Rule 10: out of the pack first; the valley lets the drop stand
        // only once the pack has given it up.
        pack: { account: member.account, kind, delta: -count },
      })
    }

    case 'take-drop': {
      // Rule 12: first to ask wins.
      const member = valley.members[action.id]
      const world = valley.world
      const refuse = (reason: string): Reduced =>
        done(valley, now, {
          broadcast: [],
          reply: { type: 'nack', re: 'take-drop', reason, drop: action.drop },
        })
      if (!member || !world) return refuse('not-in-valley')
      const drop = world.drops.find((d) => d.id === action.drop)
      if (!drop) return refuse('gone')
      const { taken } = takeUp(drop, Infinity)
      const next = withWorld(valley, {
        ...world,
        drops: world.drops.filter((d) => d.id !== drop.id),
      })
      const account = member.account
      return done(next, now, {
        broadcast: [
          frame(next, 'drop-taken', {
            by: action.id,
            item: drop.kind,
            drop: drop.id,
            count: taken,
          }),
        ],
        // Rule 11: dimes and a spider's $20 are cash; rule 10: anything
        // else, the pack.
        ...(isCash(drop.kind)
          ? { earn: { account, amount: taken * centsOf(drop.kind) } }
          : { pack: { account, kind: drop.kind, delta: taken } }),
        // Rule 22: only what the valley left, never a raider's own drop.
        ...(drop.spilled ? { xp: [{ account, source: 'drop' as const }] } : {}),
      })
    }

    case 'spill': {
      // Rules 11 and 13: each burst leaves its dimes lying where it was,
      // and the Caretaker unmade its gold bullion. Only cash or an item.
      // Rule 17: each burst shadowman its tombstone.
      const world = valley.world
      const spills = action.spills.filter(
        (one) => one.count > 0 && (isCash(one.kind) || isPackKind(one.kind))
      )
      const buried = world
        ? bury(world.graves, world.nextGrave, action.burials ?? [])
        : null
      if (
        !world ||
        !buried ||
        (spills.length === 0 && buried.next === world.nextGrave)
      ) {
        return done(valley, now, { broadcast: [] })
      }
      const spilled: Drop[] = spills.map(({ x, z, kind, count }, i) => ({
        id: world.nextDrop + i,
        kind,
        count,
        x,
        z,
        spilled: true,
      }))
      const next = withWorld(valley, {
        ...world,
        drops: [...world.drops, ...spilled],
        nextDrop: world.nextDrop + spilled.length,
        graves: buried.graves,
        nextGrave: buried.next,
      })
      return done(next, now, { broadcast: [frame(next, 'spilled')] })
    }

    case 'fall': {
      // Rule 18. A body only where the valley heard the raider stand, and
      // only with something on it.
      const member = valley.members[action.id]
      if (!member || !action.at || isEmpty(action.items)) {
        return done(valley, now, { broadcast: [] })
      }
      const id = valley.nextCorpse
      const { x, z, yaw } = action.at
      const next: Valley = {
        ...valley,
        corpses: [
          ...valley.corpses,
          {
            id,
            x,
            z,
            yaw,
            name: member.name,
            outfit: member.outfit,
            items: { ...action.items },
            account: member.account,
          },
        ],
        nextCorpse: id + 1,
      }
      return done(next, now, {
        broadcast: next.world
          ? [frame(next, 'fell', { by: action.id, corpse: id })]
          : [],
        corpse: id,
      })
    }

    case 'hit': {
      // Rule 24.
      const member = valley.members[action.id]
      if (!member) return done(valley, now, { broadcast: [] })
      const { account } = member
      const before = healthOf(valley.health, account)
      const levels = geometrieFor(valley, account, now)
      if (action.roll !== undefined && shrugs(levels, action.roll)) {
        return done(valley, now, {
          broadcast: [],
          health: { account, points: before, shrugged: true },
        })
      }
      const { points, fatal } = hit(before)
      const next: Valley = {
        ...valley,
        health: withHealth(valley.health, account, fatal ? MAX_HEALTH : points),
        // A shattering leaves the raider sober.
        geometrie: fatal
          ? sobered(valley.geometrie, account)
          : valley.geometrie,
      }
      return done(next, now, {
        broadcast: [],
        health: fatal ? { account, points, fatal } : { account, points },
        ...(fatal
          ? {
              geometrie: [
                { account, levels: geometrieFor(next, account, now) },
              ],
            }
          : {}),
      })
    }

    case 'pass': {
      // Rule 25: to another account's raider on foot, both where their
      // last state frames put them, close enough to hand it over.
      const member = valley.members[action.id]
      const taker = valley.members[action.to]
      const refuse = (reason: string) =>
        done(valley, now, { broadcast: [], reply: nack('pass', reason) })
      if (!member) return refuse('not-in-valley')
      if (!isPackKind(action.kind) || !isUsable(action.kind)) {
        return refuse('not-an-item')
      }
      if (!taker || taker.account === member.account) return refuse('no-one')
      const truck = valley.world?.truck
      const onFoot = (id: string, at: Spot | null) =>
        at !== null && !at.riding && !(truck && isAboard(truck, id))
      if (!onFoot(action.id, action.from) || !onFoot(action.to, action.at)) {
        return refuse('not-on-foot')
      }
      if (!inPassReach(action.from!, action.at!)) return refuse('too-far')
      return done(valley, now, {
        broadcast: [],
        pack: { account: member.account, kind: action.kind, delta: -1 },
        passed: { to: action.to, account: taker.account, kind: action.kind },
      })
    }

    case 'dose': {
      // Rule 25: the unit is out of the pack. A use doses the user; a
      // pass doses the taker in full, the giver their share, and earns
      // the giver XP for sharing.
      const member = valley.members[action.id]
      if (!member) return done(valley, now, { broadcast: [] })
      const amounts = itemById(action.kind)?.geometrie
      const time = now / 1000
      const taker = action.to === undefined ? null : valley.members[action.to]
      if (action.to !== undefined && !taker) {
        return done(valley, now, { broadcast: [] })
      }
      let record = valley.geometrie
      const changed = [member.account]
      if (taker) {
        record = dosed(record, taker.account, amounts, time)
        record = dosed(
          record,
          member.account,
          scaled(amounts, CONFIG.buffs.shareScale),
          time
        )
        changed.unshift(taker.account)
      } else {
        record = dosed(record, member.account, amounts, time)
      }
      const next = { ...valley, geometrie: record }
      return done(next, now, {
        broadcast: [],
        geometrie: changed.map((account) => ({
          account,
          levels: geometrieFor(next, account, now),
        })),
        ...(taker
          ? {
              xp: [{ account: member.account, source: 'share' as const }],
            }
          : {}),
      })
    }

    case 'mend': {
      // Rule 24: a forecourt makes whole; medicine gives its points back.
      const member = valley.members[action.id]
      if (!member) return done(valley, now, { broadcast: [] })
      const { account } = member
      const before = healthOf(valley.health, account)
      if (isWhole(before)) return done(valley, now, { broadcast: [] })
      const points =
        action.by === undefined ? MAX_HEALTH : mend(before, action.by)
      return done(
        { ...valley, health: withHealth(valley.health, account, points) },
        now,
        { broadcast: [], health: { account, points } }
      )
    }

    case 'set-health': {
      const member = valley.members[action.id]
      if (!member) return done(valley, now, { broadcast: [] })
      const { account } = member
      const points = mend(0, action.points)
      return done(
        { ...valley, health: withHealth(valley.health, account, points) },
        now,
        { broadcast: [], health: { account, points } }
      )
    }

    case 'loot': {
      // Rule 18: the account that fell, and no one else.
      const member = valley.members[action.id]
      const refuse = (reason: string): Reduced =>
        done(valley, now, {
          broadcast: [],
          reply: { type: 'nack', re: 'loot', reason, corpse: action.corpse },
        })
      if (!member || !valley.world) return refuse('not-in-valley')
      const corpse = valley.corpses.find((c) => c.id === action.corpse)
      if (!corpse) return refuse('gone')
      if (corpse.account !== member.account) return refuse('not-yours')
      if (isAboard(valley.world.truck, action.id)) return refuse('aboard')
      const next: Valley = {
        ...valley,
        corpses: valley.corpses.filter((c) => c.id !== corpse.id),
      }
      return done(next, now, {
        broadcast: [
          frame(next, 'looted', { by: action.id, corpse: corpse.id }),
        ],
        give: { account: member.account, items: { ...corpse.items } },
      })
    }

    case 'stow':
    case 'unstow': {
      // Rule 19.
      const member = valley.members[action.id]
      const world = valley.world
      const re = action.type
      const refuse = (reason: string): Reduced =>
        done(valley, now, { broadcast: [], reply: nack(re, reason) })
      if (!member || !world) return refuse('not-in-valley')
      if (isAboard(world.truck, action.id)) return refuse('aboard')
      if (!atLocker(action.at, world.havens)) return refuse('no-locker')
      if (!isPackKind(action.kind)) return refuse('not-an-item')
      if (action.count < 1) return refuse('nothing')
      return done(valley, now, {
        broadcast: [],
        stash: {
          account: member.account,
          kind: action.kind,
          delta: re === 'stow' ? action.count : -action.count,
        },
      })
    }

    case 'stand-stock':
    case 'stand-collect':
    case 'stand-upgrade': {
      // Rule 23.
      const member = valley.members[action.id]
      const world = valley.world
      const re = action.type
      const refuse = (reason: string): Reduced =>
        done(valley, now, { broadcast: [], reply: nack(re, reason) })
      if (!member || !world) return refuse('not-in-valley')
      if (isAboard(world.truck, action.id)) return refuse('aboard')
      if (!atStand(action.at, world.stand)) return refuse('no-stand')
      if (!stand) return refuse('unavailable')
      const { ledger, pack } = stand
      const tended = (
        change: Omit<StandChange, 'account' | 're'>,
        xp?: XpGrant[]
      ): Reduced =>
        done(valley, now, {
          broadcast: [],
          ...(xp ? { xp } : {}),
          stand: {
            account: member.account,
            re:
              re === 'stand-stock'
                ? 'stock'
                : re === 'stand-collect'
                  ? 'collect'
                  : 'upgrade',
            ...change,
          },
        })
      if (action.type === 'stand-stock') {
        const { kind, count } = action
        if ((pack[kind] || 0) < count) return refuse('none-left')
        const next = stockStand(ledger, kind, count, now)
        if (!next) return refuse('no-room')
        return tended({ ledger: next, items: { [kind]: count }, cash: 0 })
      }
      if (action.type === 'stand-collect') {
        const got = collectStand(ledger, now)
        if (!got) return refuse('empty')
        // Rule 22: the stand's XP, by the cents it paid.
        const times = standXp(got.cents)
        return tended(
          { ledger: got.ledger, items: {}, cash: got.cents },
          times > 0
            ? [{ account: member.account, source: 'stand', times }]
            : undefined
        )
      }
      const price = upgradePrice(ledger)
      const next = upgradeStand(ledger, now)
      if (!price || !next) return refuse('top')
      if (!affordsUpgrade(ledger, stand.cash, pack)) return refuse('short')
      return tended({
        ledger: next,
        items: { ...price.items },
        cash: -price.cash,
      })
    }

    case 'trade': {
      // Rule 14.
      const member = valley.members[action.id]
      const refuse = (reason: string): Reduced =>
        done(valley, now, {
          broadcast: [],
          reply: nack('trade', reason),
        })
      if (!member) return refuse('not-in-valley')
      const offer = MOAB_OFFERS.find((id) => id === action.offer)
      const cosmetic = offer ? cosmeticById(offer) : null
      if (!offer || !cosmetic) return refuse('no-such-offer')
      if (!holdings) return refuse('unavailable')
      if (holdings.cosmetics.includes(offer)) return refuse('owned')
      if (!affords(holdings.pack, offer)) return refuse('short')
      return done(valley, now, {
        broadcast: [],
        trade: {
          account: member.account,
          cosmetic: offer,
          price: { ...cosmetic.price },
        },
      })
    }

    case 'appearance': {
      // Rule 9. The world frames carry no outfit, so the change goes out
      // to the others as a peer-updated frame (ValleyDO), not as a world
      // frame.
      const member = valley.members[action.id]
      if (!member) return done(valley, now, { broadcast: [] })
      const next: Valley = {
        ...valley,
        members: {
          ...valley.members,
          [member.id]: {
            ...member,
            name: action.name ?? member.name,
            outfit: action.outfit ?? member.outfit,
          },
        },
      }
      return done(next, now, { broadcast: [] })
    }

    case 'clock':
      return done(valley, now, { broadcast: [] })

    case 'hurry': {
      const world = valley.world
      if (!world) {
        return done(valley, now, {
          broadcast: [],
          reply: nack('dev', 'no-world'),
        })
      }
      const truck = hurry(world.truck, now, action.seconds, world.routes)
      const next = withTruck(valley, world, truck)
      // A change due now happens now.
      const settled = settle(next, now)
      return done(settled.valley, now, {
        broadcast: [frame(next, 'hurry'), ...settled.frames],
        ...(settled.xp.length > 0 ? { xp: settled.xp } : {}),
      })
    }

    case 'reset': {
      // The whole world afresh: the next arrival opens it. The members
      // stay, and are asked to come back.
      const next: Valley = { ...valley, world: null }
      return done(next, now, { broadcast: [frame(next, 'reset')] })
    }
  }
}

// --- Rule 11: the shadowmen ------------------------------------------------

// The valley's shadowmen, in the server's memory: the field, the
// Caretaker (rule 13), each raider who was struck with the server ms
// until which they are left alone, and where Marx's truck was last said to
// stand, with the server ms it was said.
export interface Shadows {
  field: ShadowmenField
  caretaker: Caretaker
  recovering: Record<string, number>
  headlights: { pose: TruckPose; at: number } | null
}

export function createShadows(): Shadows {
  return {
    field: createShadowmen(),
    caretaker: createCaretaker(),
    recovering: {},
    headlights: null,
  }
}

// One raider in the shadowmen's field: their socket id, and their last
// state frame (null until they send one).
export interface Placed {
  id: string
  at: PeerStateWire | null
}

// Rule 25: where a raider's last state frame put them, as a pass reads it.
export interface Spot {
  x: number
  z: number
  riding: boolean
}

// The raiders the shadowmen cross round: every placed member.
export function shadowRaiders(
  valley: Valley,
  shadows: Shadows,
  placed: readonly Placed[],
  now: number
): Raider[] {
  const raiders: Raider[] = []
  const truck = valley.world?.truck
  for (const { id, at } of placed) {
    const member = valley.members[id]
    if (!at || !member) continue
    raiders.push({
      id,
      x: at.x,
      z: at.z,
      vulnerable:
        !at.riding &&
        !(truck && isAboard(truck, id)) &&
        now >= (shadows.recovering[id] ?? 0),
      // Rule 25: their high reaches it further and wider.
      beam: at.light
        ? buffedBeam(
            beamFrom(at, at.yaw, at.pitch, at.pose === 'crouch'),
            geometrieFor(valley, member.account, now)
          )
        : null,
    })
  }
  return raiders
}

// A raider says where Marx's truck stands (a headlights frame). Every
// client drives the same leg against the same clock, so any one near it
// will do; the word of one whose last state frame is not within reach of
// it is not taken. Whether it was. Mutates shadows.
export function seeHeadlights(
  shadows: Shadows,
  from: PeerStateWire | null,
  pose: TruckPose,
  now: number,
  cfg = CONFIG.truck.headlights
): boolean {
  if (!from || Math.hypot(from.x - pose.x, from.z - pose.z) > cfg.reach) {
    return false
  }
  shadows.headlights = { pose, at: now }
  return true
}

// The headlights' beam, while the truck's last word is fresh.
export function headlightsAt(
  shadows: Shadows,
  now: number,
  cfg = CONFIG.truck.headlights
): Beam[] {
  const seen = shadows.headlights
  if (!seen || now - seen.at > cfg.staleMs) return []
  return [headlightBeam(seen.pose, cfg)]
}

// Where the wire rounds a shadowman: centimetres, and hundredths of a burn.
const round = (n: number, places: number) =>
  Math.round(n * 10 ** places) / 10 ** places

// One step of the valley's shadowmen and its Caretaker, dt seconds on: the
// frame for everyone, the raiders struck, and which of them the Caretaker
// caught. Null when there is nothing to step (no world, or no one placed
// in it), and the field is emptied, so the valley stops stepping until
// someone is placed again. Mutates shadows.
export function stepShadows(
  valley: Valley,
  shadows: Shadows,
  placed: readonly Placed[],
  rng: Rng,
  { now, dt, calm = false }: { now: number; dt: number; calm?: boolean },
  cfg = CONFIG.shadowmen
): {
  message: ShadowmenMessage
  struck: string[]
  caught: string[]
  // Rule 15: the accounts credited with unmaking the Caretaker this step.
  credited: string[]
  // Rule 16: the accounts credited with a burn this step, once for each
  // shadowman each burned. A spiderling is no shadowman, and a spider's
  // brood would all but finish the day's task on its own.
  burned: string[]
  // Rule 22: the XP those burns and that unmaking earned.
  xp: XpGrant[]
} | null {
  const world = valley.world
  const raiders = world ? shadowRaiders(valley, shadows, placed, now) : []
  if (!world || raiders.length === 0) {
    Object.assign(shadows, createShadows())
    return null
  }
  const { struck, lunges, bursts } = stepShadowmen(
    shadows.field,
    rng,
    {
      dt,
      raiders,
      metres: world.metres,
      havens: world.havens,
      water: world.water,
      calm,
      lights: headlightsAt(shadows, now),
    },
    cfg
  )
  // Rule 13: the Caretaker, in the maze the world was opened with.
  let caretaker: CaretakerWire | null = null
  let unmade: XZ | null = null
  const caught: string[] = []
  let credited: string[] = []
  if (world.maze) {
    const out = stepCaretaker(shadows.caretaker, rng, {
      dt,
      raiders,
      place: world.maze,
    })
    caught.push(...out.struck)
    const { lunged } = out
    credited = creditedWith(valley, out.unmadeBy)
    for (const id of out.struck) if (!struck.includes(id)) struck.push(id)
    unmade = out.burst && {
      x: round(out.burst.x, 2),
      z: round(out.burst.z, 2),
    }
    const at = caretakerAt(shadows.caretaker, world.maze)
    if (at) {
      const windup = round(
        Math.min(1, shadows.caretaker.windup / CONFIG.caretaker.windupSeconds),
        2
      )
      caretaker = {
        x: round(at.x, 2),
        z: round(at.z, 2),
        burn: round(
          Math.min(1, shadows.caretaker.burn / CONFIG.caretaker.burnSeconds),
          2
        ),
        target: shadows.caretaker.target,
        ...(windup > 0 ? { windup } : {}),
        ...(lunged ? { lunge: true as const } : {}),
      }
    }
  }
  const recovering: Record<string, number> = {}
  for (const r of raiders) {
    const until = shadows.recovering[r.id]
    if (until !== undefined && until > now) recovering[r.id] = until
  }
  // Rule 21: a raider struck is let alone for a little while, where they
  // stand or where they come to.
  for (const id of struck) {
    recovering[id] = now + CONFIG.health.graceSeconds * 1000
  }
  shadows.recovering = recovering
  return {
    message: {
      type: 'shadowmen',
      shadowmen: shadows.field.shadowmen.map((s) => {
        const windup = round(Math.min(1, s.windup / cfg.windupSeconds), 2)
        return {
          id: s.id,
          ...(s.kind !== 'man' ? { kind: s.kind } : {}),
          x: round(s.x, 2),
          z: round(s.z, 2),
          burn: round(Math.min(1, s.burn / burnSecondsOf(s.kind, cfg)), 2),
          target: s.target,
          ...(windup > 0 ? { windup } : {}),
        }
      }),
      lunges,
      // Who burned each is the valley's to know, not the wire's.
      bursts: bursts.map((b) => ({
        id: b.id,
        kind: b.kind,
        x: round(b.x, 2),
        z: round(b.z, 2),
      })),
      caretaker,
      unmade,
    },
    struck,
    caught,
    credited,
    burned: bursts
      .filter((b) => b.kind !== 'spiderling')
      .flatMap((b) => creditedWith(valley, b.by)),
    // A spiderling earns no XP: a spider's brood would farm it.
    xp: [
      ...bursts
        .filter((b) => b.kind !== 'spiderling')
        .flatMap((b) =>
          grantsTo(valley, b.by, b.kind === 'spider' ? 'spider' : 'burn')
        ),
      ...credited.map((account) => ({ account, source: 'unmake' as const })),
    ],
  }
}

// Rule 24: the placed raiders a forecourt makes whole: on foot, below
// whole, and where their last state frame put them inside a haven. One id
// an account.
export function forecourtMends(
  valley: Valley,
  placed: readonly Placed[],
  cfg = CONFIG.shadowmen
): string[] {
  const world = valley.world
  if (!world) return []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const { id, at } of placed) {
    const member = valley.members[id]
    if (!at || !member || at.riding || seen.has(member.account)) continue
    if (isWhole(healthOf(valley.health, member.account))) continue
    if (!inHaven(at, world.havens, cfg.havenRadius)) continue
    seen.add(member.account)
    ids.push(id)
  }
  return ids
}

// Rules 15, 16 and 22: the accounts behind the sockets whose beams unmade the
// Caretaker or burst a shadowman, each once, in the order their beams were
// counted.
export function creditedWith(valley: Valley, ids: readonly string[]): string[] {
  const accounts: string[] = []
  for (const id of ids) {
    const account = valley.members[id]?.account
    if (account && !accounts.includes(account)) accounts.push(account)
  }
  return accounts
}

// A dev server's shadowman (or spider) standing still at (x, z), for the
// specs.
export function placeShadowman(
  shadows: Shadows,
  x: number,
  z: number,
  kind: ShadeKind = 'man'
): void {
  placeStill(shadows.field, x, z, kind)
}

// A dev server's Caretaker moved to (x, z) in the world, formed if it was
// unmade, with its mind wiped, floating still there until it has someone
// to hunt, for the specs. Nothing without a maze.
export function placeCaretaker(
  valley: Valley,
  shadows: Shadows,
  x: number,
  z: number
): void {
  const place = valley.world?.maze
  if (!place) return
  shadows.caretaker = {
    ...createCaretaker(),
    ...worldToMaze(place, { x, z }),
    held: true,
  }
}
