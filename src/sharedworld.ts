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
//    brings him home. The first one in the bed may pick where he goes
//    (charter, a point inside the survey): he takes the bed there and lets
//    them off, then drives home. With no one else in the valley there is
//    no countdown: he leaves as soon as the pick is made.
// 4. A pickup goes to whoever asks first; the rest are told it is gone.
//    One lying in a walled room (PickupSpec.within) goes only to a raider
//    standing in it.
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
//    last said it stood (seeHeadlights), and only while that is fresh.
//    Under Bull Valley Plaza, in the Undercroft the world was opened with
//    (undercroft.ts), the tunnel shades walk instead (tunnelshades.ts): a
//    raider down there is out of the shadowmen's field and the Caretaker's
//    reach, and the shades hunt them, strike them the same way, and burst
//    in one beam into dimes, the Warden among them. Up on the lookout
//    tower by the maze's gate (lookout.ts) no shadow reaches a raider: no
//    shadowman rushes them and the Caretaker never hunts them, though their
//    beam still burns what is below. The valley steps the field
//    (shadowstep.ts stepShadows, over this Valley) and keeps it in memory
//    only: the shadowmen are gone whenever no one is placed in the valley.
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
//    held, burn it, and it forms again at the heart minutes later.
//    Burned, it leaves two 1 troy ounce bars of gold bullion lying where
//    it was (drops.ts spillsOf), each a drop like any other (rule 12) that
//    goes into the taker's pack.
// 14. Moab Coldë trades cosmetics for what the pack holds (cosmetics.ts):
//    the Flaming Halo for one troy ounce of gold bullion. A cosmetic is the
//    account's for good, so he never sells one twice; the valley refuses a
//    trade the pack does not cover (ValleyContext.holdings in,
//    Reduced.trade out) and writes the price and the cosmetic together.
// 15. The season (season.ts): every raider whose beam was on the
//    Caretaker when it came apart is credited with the burning, once per
//    account however many of its sockets held a beam on it. The progress
//    is the account's, kept by the valley in D1 beside the wallet, and the
//    burning that finishes the season pays its reward once.
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
//    pack held but its key items (which stay in the pack) on their body, where their last state frame put them; the
//    valley takes it all out of the account's pack first, and lays the
//    body only once it has (Reduced.corpse), or gives it back. One body
//    an account: a second fall takes the first away, and what it still
//    held is lost. The locker is untouched, but the strike spills
//    CONFIG.corpses.walletShare of the wallet (ValleyContext.cash in,
//    Reduced.spend out) as dimes where the raider fell, the valley's to
//    leave lying like a burst's, for whoever takes them up first. Only the account that fell can take its
//    things back (Reduced.give), and a body lies until it does: the day's
//    turn leaves it, and so does a world opened afresh, since the bodies
//    are the valley's (Valley.corpses), not the world's.
// 19. The stash (stash.ts): every account has one locker, in the back room
//    of every Citgo, the same from any of them. A raider out of the bed
//    whose last state frame put them at a station can move what their pack
//    holds into it, or back (Reduced.stash); the valley moves it only when
//    the side it comes out of holds it. A key item never goes in.
// 20. The Book of Shadows (book.ts): every entry a raider comes across (a
//    place in reach, a shadow in sight, one of the folk spoken to, an item
//    in the pack) is written in the account's book once, at the first
//    time; an ask names only what the raider met, and only the real
//    entries the account had not found are news (book.ts newlyFound).
//    The book is the account's, kept by the valley in D1. A landmark
//    found for the first time pays its bounty into the wallet and its XP
//    (findsPay); the valley writes the find and the cents together.
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
//    the Caretaker burned with it (a big jump), a ride with Marx that
//    gets home with them in the bed or lets them off where they picked,
//    over a drive of CONFIG.truck.rideXpMetres or more, the day's berry off a bush, a pickup,
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
// 24. Geometrie, the raider's hit points (health.ts): every account has
//    maxGeometrie of its level (Member.level, read from D1 on the join and
//    moved on by a `level` action), and the valley keeps what each has
//    lost (Valley.wounds, only the wounded), so no reconnect or second tab
//    heals and a new level's larger whole tops the raider up. Each shadow's
//    touch (rules 11 and 13) takes its own hit (wards.ts damageOf: the
//    shadow's, give or take its spread on the valley's roll, cut by the
//    raider's wards, rule 27), once a step however many of the account's
//    sockets were touched, and lets the raider alone for
//    CONFIG.health.graceSeconds where they stand. The touch that takes the
//    last is the strike of rule 18 (Reduced.health.fatal), and the account
//    is whole again after. A fall the client says it landed from (a
//    `plunge`; where a raider stands is its own word) takes fall.ts
//    fallDamage of its height, no ward cutting it: all of it from two
//    stories, which is rule 18's strike the same. A raider on foot whose last state frame put them
//    on a Citgo forecourt is given back CONFIG.health.forecourt's share
//    of whole every few seconds until whole, and a use of anything that heals
//    (items.ts healsPct), once the pack has given the unit up, gives its
//    share of whole back.
// 25. The squatter in Bull Valley Plaza deals (dealer.ts), where the
//    world was opened with him (SharedWorld.dealer): a few of each of his
//    goods a day for the whole valley (SharedWorld.dealerStock, full
//    again when the day turns, rule 6). He takes no cash: a raider out of
//    the bed whose last state frame put them beside him barters one kind
//    out of their pack for one of his, counted a little under shelf price
//    (ValleyContext.holdings in, Reduced.barter out), and the deal earns
//    XP as a purchase (rule 22).
// 26. Quests (quests.ts): each account's stage on each is its own, kept by
//    the valley in D1 beside the pack. Erwin von Dutch gives a raider out
//    of the bed beside him a rose (again, if it was lost); laid at the
//    heart of the maze where the world was opened with it, he gives them
//    the Video Vault's back-room key. Each step is judged against where
//    the raider's last state frame put them and what the pack holds
//    (ValleyContext.quest in, Reduced.quest out); the valley writes the
//    stage and the pack together, or neither. The key earns quest XP
//    (rule 22).
// 27. Buffs (buffs.ts): every account's wards (wardlevels.ts) are kept
//    by the valley (Valley.wards, on its clock in seconds, only the
//    accounts not sober), dosed by each use once the pack has given the
//    unit up, and made sober by the strike of rule 18. It does things: a
//    raider's high reaches their beam further and wider (shadowRaiders),
//    and each level wards against its own shadows (wards.ts: high the
//    shadowmen, stimulated the spiders, drunk the Caretaker, a trip the
//    Undercroft), cutting what their touch takes (rule 24). A raider on foot
//    can pass a unit to another account's raider on foot within
//    CONFIG.buffs.passReach of them, each where their last state frame put
//    them: the pass takes it out of the giver's pack, then a dose
//    doses the taker in full and the giver at CONFIG.buffs.shareScale, and
//    earns the giver XP for sharing (rule 22); the valley gives the taker
//    its heal (rule 24). The stimulated's quicker sprint is the client's.
// 28. Citgos and Citgo portals (citgos.ts, portals.ts): the valley keeps
//    every Citgo each account has stood at, and the last (Valley.citgos):
//    a raider on foot whose last state frame put them within
//    CONFIG.portal.visitReach of a station's pump island stands at it
//    (citgoVisits). The first time an account stands at a Citgo, past the
//    first it ever stood at (the spawn Citgo), it pays
//    CONFIG.bounties.citgo into the wallet (Reduced.earn) and earns citgo
//    XP (rule 22). A raider on foot, out of the bed and away from their
//    last Citgo, opens a Citgo portal with the phone: it stands a little
//    ahead of where their last state frame put them, its twin in a free
//    slot of the ring on that Citgo's lot, where the world was opened with
//    it (SharedWorld.rings). Anyone walking into either end comes out of
//    the other, and fast travel from one visited Citgo to another is the
//    client's: where a raider stands is their own client's word, so the
//    valley keeps only the log and the portals. An account keeps one
//    portal open at a time (opening another closes the first), each for
//    CONFIG.portal.lifeSeconds; the day's turn leaves them.
// 29. Bull Valley Dial-Up: a raider may dial in from a phone with no body
//    in the valley (a `dial` action, Member.dialup). They open no world
//    and the truck pays them no mind; they never send a state frame, so
//    no shadow reaches them and no place is kept. Space is collapsed for
//    them: their locker and their Cabbage Stand answer wherever they are,
//    world or none (rules 19 and 23), Erwin deals with them and gives and
//    rewards the rose from anywhere (rules 25 and 26), and they buy off the
//    shelves of any Citgo their account has stood at (rule 7, `not-visited`
//    otherwise). They use what their pack holds as anyone does (rule 10),
//    dosing their wards and mending their geometrie (rules 24 and 27),
//    to ready a run (rule 30). What takes a body is refused them
//    (`dialup`): the truck, a take, a berry, a pass, a drop or taking
//    one up, a body, a portal, and laying the rose.
// 30. Idle expeditions (expeditions.ts): a raider dialed in sends their
//    raider out on a run, one at a time, if their level has opened it
//    (`expedition-send`; `busy`, `locked`), and if the wallet covers its
//    buy-in (CONFIG.expeditions.runs[...].cost; ValleyContext.cash in,
//    Reduced.spend out, taken as the run is written; `short`). The valley
//    draws its seed and
//    keeps the run with the matching ward's level as it left (rule 27),
//    so what comes home is settled then; a run home is claimed
//    (`expedition-claim`; `none` with none out, `out` before its time) and
//    its haul goes into the pack and the wallet together with the run left
//    empty (ValleyContext.expedition in, Reduced.expedition out). A run
//    that came back hurt takes its share of whole geometrie, never the
//    last point (rule 24), and every run home earns its XP (rule 22). A
//    raider on foot sends none (`not-dialup`).
// 31. The laptop in the Citgo bathroom (laptop.ts): one pretend file
//    system every raider shares, the readme first and then a folder a
//    writer. A raider out of the bed whose last state frame put them at a
//    station may list the files, read any of them, and save or delete
//    their own (Reduced.laptop); the valley keeps them in D1 and checks a
//    save against the writer's own files (laptop.ts saveRefusal). Dialed
//    in there is no laptop (`dialup`).
// 32. Empties (recycling.ts): once the pack has given up a unit used or
//    passed (rules 10 and 27), what it leaves goes into the same pack, under
//    Materials: a drink its can or its bottle, the last cigarette out of a
//    pack the pack (emptyOf, from what the pack holds after). Dialed in the
//    same.
// 33. The Recycling Center at the wreck (recycling.ts): every account keeps
//    its own research, a level on each line, in D1. A raider out of the bed
//    whose last state frame put them beside the wreck (the world was opened
//    with where it is, SharedWorld.wreck), or dialed in from anywhere, buys
//    a line's next level with the empties it costs (ValleyContext.research
//    in, Reduced.research out); the valley writes the level and takes the
//    empties out of the pack together, or neither. Research is the
//    account's alone and never reaches the shared world: loose change
//    (`dimes`) gives a raider taking up dimes a burst left (Drop.burst,
//    never a raider's spilled wallet) the chance, on the valley's roll, of
//    as many again into their own wallet (extraDimes, Reduced.found); the
//    drop and everyone else's take are as they were.
// 34. Parties (party.ts): a raider invites another in the valley by name,
//    and the other joins by inviting back (a party of the two, or the
//    inviter's); a party holds CONFIG.party.size, and a raider is in one
//    at most. The valley keeps them by account, never in D1 and never
//    an account on the wire: a raider whose last socket goes is away
//    from it, back in it on a reconnect, and out of it once the linger
//    runs out (`party-drop`, or the next arrival); one who leaves is out
//    at once, and a party of one is none. Every member whose party
//    changed is sent it again (Reduced.party) with the news
//    (Reduced.partyNews). A burning of the Caretaker credits every member
//    of a burner's party placed within CONFIG.party.creditRadius of them
//    (creditedWithParty). Its chat goes to its members alone, under the
//    chat rules and rate, and is never kept.
// 35. Crews (crews.ts): a crew is its members' for good, kept in D1
//    beside the accounts (worker/d1crews.ts), never in the shared world:
//    a name and a 2-to-4 tag each unique in any case, a leader, and up
//    to CONFIG.crews.size members, an account in one at most. Starting
//    one takes CONFIG.crews.cost out of the wallet in the same
//    transaction that writes it. Only the leader invites (any raider, in
//    the valley or not; the invite waits CONFIG.crews.inviteMs) and puts
//    a member out; a leader who leaves hands the crew to the member
//    longest in it, and the last one out ends it. Every member wears the
//    tag on their name tag (PeerWire.crew, read from D1, changed for
//    everyone the moment it is). Its chat goes to its members alone,
//    under the chat rules and rate, and is never kept. Only names and
//    tags go on the wire.
// 36. Waypoints (waypoints.ts): the valley keeps each account's pins on
//    the map, up to WAYPOINT_MAX, the oldest dropped past it
//    (Valley.waypoints). A raider sends the whole list at once (a `mark`
//    action); the valley keeps only the points inside the survey, and
//    every socket on the account hears the list it kept. The compass and
//    the pillars they draw are the client's.

import { bountyOf } from './book.ts'
import { dosed, inPassReach, scaled, sobered, wardsOf } from './buffs.ts'
import { heartPoint, theMaze } from './caretaker.ts'
import { citgoAt, NO_CITGOS, visit } from './citgos.ts'
import { CONFIG } from './config.ts'
import { insideRing } from './coords.ts'
import { corpseWire, isEmpty, keysOff, spilledDimes } from './corpses.ts'
import { affords, cosmeticById, MOAB_OFFERS } from './cosmetics.ts'
import { collectedToday, dayKey, nextMidnight } from './daily.ts'
import { atDealer, deal, freshDealerStock } from './dealer.ts'
import {
  centsOf,
  DIME_CENTS,
  DIMES,
  dropSpot,
  isCash,
  takeUp,
} from './drops.ts'
import {
  embark,
  isExpeditionId,
  isHome,
  outcomeOf,
  woundedBy,
} from './expeditions.ts'
import { fallDamage } from './fall.ts'
import { sameName } from './friends.ts'
import { bury } from './graves.ts'
import {
  hit,
  maxGeometrie,
  mend,
  pointsOf,
  withWounds,
  woundsFromHealth,
  woundsOf,
} from './health.ts'
import {
  contentsOf,
  doseOf,
  healsOf,
  INVENTORY_KINDS,
  isKeyItem,
  isUsable,
  itemById,
} from './items.ts'
import { atLaptop } from './laptop.ts'
import {
  arrive,
  board,
  call,
  charter,
  createTruck,
  hopOut,
  hurry,
  isAboard,
  leave,
  nextChange,
  refused,
  rideMetres,
  settleTruck,
} from './marx.ts'
import { mazeToWorld } from './maze.ts'
import {
  dropAway,
  markAway,
  NO_PARTIES,
  partyInvite,
  partyLeave,
  partyOf,
  renamed,
  withParty,
} from './party.ts'
import { fieldEnd, freeSlot, nextClose, openAt, ringEnd } from './portals.ts'
import { PROTOCOL_VERSION } from './protocol.ts'
import { atHeart, isQuest, QUESTS, questStep } from './quests.ts'
import {
  affordsResearch,
  atWreck,
  emptyOf,
  extraDimes,
  priceOf,
} from './recycling.ts'
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
import { levelsAt } from './wardlevels.ts'
import { damageOf } from './wards.ts'
import { cleanWaypoints, NO_WAYPOINTS, sameWaypoints } from './waypoints.ts'
import type { CitgoLog } from './citgos.ts'
import type { Corpse } from './corpses.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { DealerStock } from './dealer.ts'
import type { Drop, Facing, Spill } from './drops.ts'
import type { ExpeditionOutcome, ExpeditionRun } from './expeditions.ts'
import type { Hurt } from './fall.ts'
import type { Burial, Grave } from './graves.ts'
import type { Inventory, Metres, ShopStock, XZ } from './interfaces.ts'
import type { TruckChange, TruckRoutes, TruckState } from './marx.ts'
import type { MazePlace } from './maze.ts'
import type { OutfitId } from './outfits.ts'
import type { Parties, Party } from './party.ts'
import type { Portal } from './portals.ts'
import type { XpGrant, XpSource } from './progression.ts'
import type {
  DailyMessage,
  DailyWire,
  NackMessage,
  NackRe,
  PartyNewsMessage,
  PeerStateWire,
  PickupSpec,
  Place,
  WardLevels,
  WorldMessage,
  WorldReason,
  WorldWire,
} from './protocol.ts'
import type { QuestId, QuestStage, QuestStep } from './quests.ts'
import type { Research, ResearchLine } from './recycling.ts'
import type { StandLedger } from './stand.ts'
import type { WardState } from './wardlevels.ts'
import type { ShadowHit } from './wards.ts'
import type { WaterMap } from './waterside.ts'
import type { Waypoints } from './waypoints.ts'

// A raider online: one socket.
interface Member {
  id: string
  // The signed-in account (worker/auth.ts). Never on the wire.
  account: string
  name: string
  outfit: OutfitId
  // Rule 24: the account's level (progression.ts), which sizes its
  // geometrie.
  level: number
  // Rule 29: dialed in from Bull Valley Dial-Up, with no body in the
  // valley.
  dialup?: true
}

interface SharedWorld {
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
  // Where the wreck lies, or null (rule 33).
  wreck: XZ | null
  // Where each berry bush stands, in bush order (rule 8).
  bushes: XZ[]
  // Where the squatter deals, or null, and what he has left today (rule
  // 25).
  dealer: XZ | null
  dealerStock: DealerStock
  // Where the Undercroft lies, or null (rule 11: the tunnel shades).
  undercroft: MazePlace | null
  // Rule 28: the middle of the portal ring on each station's lot, indexed
  // like havens; the portals open now, each with the account that opened
  // it (never on the wire); and the id the next one gets.
  rings: XZ[]
  portals: ValleyPortal[]
  nextPortal: number
}

interface ValleyPortal extends Portal {
  account: string
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
  // Rule 24: account -> the geometrie it has lost, while wounded.
  wounds: Record<string, number>
  // Rule 27: account -> its wards, while not sober, on the valley's
  // clock in seconds.
  wards: Record<string, WardState>
  // Rule 28: account -> every Citgo it has stood at, and the last.
  citgos: Record<string, CitgoLog>
  // Rule 34: the parties and the invites waiting, by account (never on
  // the wire).
  parties: Parties
  // Rule 36: account -> its waypoints.
  waypoints: Record<string, Waypoints>
}

interface ValleyCorpse extends Corpse {
  account: string
}

// Rule 8: how many berry bushes there are (the spawn Citgo's, then the
// maze's), and the key the valley remembers one account's day at one bush
// under. Bush 0's is the bare account, as it was when it was the only one.
export const BUSHES = 1 + CONFIG.maze.bushes.count

function bushKey(account: string, bush: number): string {
  return bush === 0 ? account : `${account}/${bush}`
}

// Rule 27: where a raider's last state frame put them, as a pass reads it.
export interface Spot {
  x: number
  z: number
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
      wreck: XZ | null
      bushes: XZ[]
      dealer: XZ | null
      undercroft: MazePlace | null
      rings: XZ[]
      // Rule 24: the account's level, read from D1 (1 when absent).
      level?: number
    }
  // Rule 29: a raider dialed in from Bull Valley Dial-Up, with no body in
  // the valley, so nothing of the world comes with them.
  | {
      type: 'dial'
      id: string
      account: string
      name: string
      outfit: OutfitId
      level: number
    }
  // at: where their last state frame put them, or null.
  | { type: 'leave'; id: string; at: PeerStateWire | null }
  // In every action below, at: where the raider's last state frame put
  // them, or null when the valley has not heard one. The valley holds them
  // to it (CONFIG.valleyReach), never to where a frame says they are.
  | { type: 'board'; id: string; at: XZ | null }
  | { type: 'hop-out'; id: string }
  // Rule 3: where the first one in the bed picked to go, or the joyride
  // (null).
  | { type: 'charter'; id: string; to: XZ | null }
  | { type: 'take'; id: string; index: number; at: XZ | null }
  | {
      type: 'buy'
      id: string
      station: number
      kind: string
      unit: number
      at: XZ | null
    }
  // from: where the client sees the truck; the drive is reckoned from it
  // (marx.ts), or from home when that is too far to believe.
  | { type: 'call'; id: string; from: XZ; at: XZ | null }
  | { type: 'collect'; id: string; bush: number; at: XZ | null }
  | { type: 'use'; id: string; kind: string }
  // Rule 27: a unit of `kind` passed from `id` to `to`. from and at: where
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
  // Rule 27: once the pack gave it up, what a use doses (`to` absent), or
  // a pass doses both sides.
  | { type: 'dose'; id: string; kind: string; to?: string }
  // Rule 32: once the pack gave up a unit of `kind` used or passed, with
  // `left` of it still in the pack, what it leaves behind.
  | { type: 'empty'; id: string; kind: string; left: number }
  // Rule 12. at: where the raider's last state frame put them, or null
  // when the valley has not heard one.
  | { type: 'drop'; id: string; kind: string; count: number; at: Facing | null }
  // roll: the valley's draw (0 to 1) for loose change (rule 33).
  | {
      type: 'take-drop'
      id: string
      drop: number
      at: XZ | null
      roll?: number
    }
  // Rules 11, 13 and 17: what the valley leaves of its own accord: the
  // dimes burst shadowmen leave and their tombstones, and the Caretaker's
  // gold bullion.
  | { type: 'spill'; spills: Spill[]; burials?: Burial[] }
  // Rule 18: struck, with `items` already out of the account's pack. at:
  // where the raider's last state frame put them, or null.
  | { type: 'fall'; id: string; items: Inventory; at: Facing | null }
  | { type: 'loot'; id: string; corpse: number; at: XZ | null }
  // Rule 18: the key items off the account's bodies, back to its pack, as
  // it comes into the valley (a body laid before strikes kept them).
  | { type: 'keys-back'; account: string }
  // Rule 24: a shadow's touch, `by` what (wards.ts), roll drawn from 0 to
  // 1 by the valley for its spread.
  | { type: 'hit'; id: string; by: ShadowHit; roll?: number }
  // Rule 24: a fall landed from `height` metres, by the client's word.
  | { type: 'plunge'; id: string; height: number }
  // Rule 24: a use of `kind` giving its share back, or made whole (no
  // kind: a forecourt).
  | { type: 'mend'; id: string; kind?: string }
  // Rule 24: the account reached `level` (rule 22).
  | { type: 'level'; account: string; level: number }
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
  // Rule 33: the next level on `line`, bought with empties at the wreck.
  | { type: 'recycle'; id: string; line: ResearchLine; at: XZ | null }
  // Rule 30: a run sent out, with the seed the valley drew, and a run home
  // claimed.
  | { type: 'expedition-send'; id: string; kind: string; seed: number }
  | { type: 'expedition-claim'; id: string }
  // Rule 14: cosmetic `offer` from Moab.
  | { type: 'trade'; id: string; offer: string }
  // Rule 31: the laptop asked to list, read, save or delete (`re`). at:
  // where the raider's last state frame put them, or null.
  | { type: 'laptop'; id: string; re: LaptopRe; at: XZ | null }
  // Rule 26: one step of `quest`. at: where the raider's last state frame
  // put them, or null.
  | { type: 'quest'; id: string; quest: string; step: QuestStep; at: XZ | null }
  // Rule 25: one of `kind` from Erwin, bartered for with `pay`. at: where
  // the raider's last state frame put them, or null.
  | { type: 'deal'; id: string; kind: string; pay: string; at: XZ | null }
  // Rule 9: a new name, a new character, or both.
  | { type: 'appearance'; id: string; name?: string; outfit?: OutfitId }
  // Rule 34: invite the raider in the valley named `name` (or join them,
  // inviting back); leave the party; an account whose linger ran out with
  // no socket left, out of its party.
  | { type: 'invite'; id: string; name: string }
  | { type: 'party-leave'; id: string }
  | { type: 'party-drop'; account: string }
  // Rule 28: the raider stands at Citgo `station`; a Citgo portal opened.
  | { type: 'visit'; id: string; station: number }
  | { type: 'open-portal'; id: string; at: Facing | null }
  // Rule 36: the raider's waypoints, all of them.
  | { type: 'mark'; id: string; points: readonly XZ[] }
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
  // For a buy, or a fall: the account's wallet in cents, as the valley
  // just read it.
  cash?: number
  // For a trade or a deal: the raider's pack and cosmetics, as the valley
  // just read them.
  holdings?: { pack: Inventory; cosmetics: readonly CosmeticId[] }
  // For a quest's step: where the account stands on it, and its pack, as
  // the valley just read them.
  quest?: { stage: QuestStage; pack: Inventory }
  // For tending the stand: the account's ledger, pack and wallet (cents),
  // as the valley just read them.
  stand?: { ledger: StandLedger; pack: Inventory; cash: number }
  // For an expedition: the run out, as the valley just read it.
  expedition?: { run: ExpeditionRun | null }
  // For recycling and for taking up a drop: the account's research, and
  // for recycling its pack, as the valley just read them (rule 33).
  research?: { levels: Research; pack?: Inventory }
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
  // Rule 26: a quest's step, which stands once the valley has moved the
  // account's stage from `from` to `to` and made `change` to its pack,
  // together.
  quest?: {
    account: string
    quest: QuestId
    step: QuestStep
    from: QuestStage
    to: QuestStage
    change: { kind: string; delta: number }
  }
  // Rule 25: a barter that stands once the valley has taken `give` out of
  // the account's pack and put `take` in, together.
  barter?: {
    account: string
    give: { kind: string; count: number }
    take: { kind: string; count: number }
  }
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
  // Rule 24: an account's geometrie after a hit, a mend or a new level,
  // for its sockets, out of `max`; fatal when the hit took the last of it
  // (the account is whole again). A hit says what took it, how much, and
  // how much the wards took off.
  health?: {
    account: string
    points: number
    max: number
    fatal?: true
    hit?: { by: Hurt; damage: number; warded: number }
  }
  // Rule 27: each account's wards after a dose or a shattering, for
  // its sockets.
  wards?: { account: string; levels: WardLevels }[]
  // Rule 27: a pass the valley allowed, once the giver's pack gives the
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
  // Rule 28: an account's Citgos after a visit, for its sockets.
  citgos?: { account: string; log: CitgoLog }
  // Rule 36: an account's waypoints as kept, for its sockets.
  waypoints?: { account: string; points: Waypoints }
  // Rule 30: a run sent out, or a run home and its haul, written together
  // or not at all.
  expedition?: ExpeditionChange
  // Rule 31: the laptop opened to the account; the valley does the rest
  // against D1.
  laptop?: { account: string }
  // Rule 33: a line's next level, written together with the empties it
  // took out of the pack, or not at all.
  research?: ResearchChange
  // Rule 33: the dimes loose change found over a burst's, already in the
  // taker's wallet (Reduced.earn), for the account's sockets.
  found?: { account: string; dimes: number }
  // Rule 34: the accounts whose party (or invites) changed, each to be
  // sent its party frame (party.ts partyWire), and the news for the log.
  party?: string[]
  partyNews?: PartyNews[]
}

// Rule 34: one line of party news, for one account's log.
export interface PartyNews {
  account: string
  news: PartyNewsMessage['news']
  name: string
}

export interface ResearchChange {
  account: string
  line: ResearchLine
  // The level reached.
  level: number
  // Units out of the pack, each count positive.
  items: Inventory
}

// The laptop's frames, each refused under its own name.
export type LaptopRe =
  'laptop-list' | 'laptop-read' | 'laptop-save' | 'laptop-delete'

export interface ExpeditionChange {
  account: string
  // The run now out, or null once one is home.
  run: ExpeditionRun | null
  // For a run home: what it brought.
  outcome?: ExpeditionOutcome
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

// Why the valley will not let a raider at `target` from `at`, or null when
// it will: nowhere heard, or further than `reach` metres.
function tooFar(
  at: XZ | null,
  target: XZ,
  reach: number
): 'no-position' | 'too-far' | null {
  if (!at) return 'no-position'
  return Math.hypot(at.x - target.x, at.z - target.z) <= reach
    ? null
    : 'too-far'
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
    wounds: {},
    wards: {},
    citgos: {},
    parties: NO_PARTIES,
    waypoints: {},
  }
}

// The valley as an older build stored it, made current: the fresh one
// fills in newer fields, and a world opened on another protocol (an older
// build's included) is dropped, so the next arrival opens it afresh.
// The berries, the places, the bodies, the wounds and the wards carry
// over; a valley stored as hit points left (an older build's `health`,
// kept against `healthMax`, three once) is read as wounds at the same
// share of whole, and the wards an older build kept as `geometrie` as
// the wards.
export function restoreValley(
  stored: Partial<Valley> & {
    health?: Record<string, number>
    healthMax?: number
    geometrie?: Record<string, WardState>
  }
): Valley {
  const { health, healthMax, geometrie, ...rest } = stored
  const valley: Valley = {
    ...createValley(),
    ...rest,
    wounds:
      rest.wounds ?? (health ? woundsFromHealth(health, healthMax ?? 3) : {}),
    wards: rest.wards ?? geometrie ?? {},
  }
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

// Rule 24: `account`'s level, the highest any of its raiders here holds
// (1 with none).
export function levelFor(valley: Valley, account: string): number {
  let level = 1
  for (const m of Object.values(valley.members)) {
    if (m.account === account) level = Math.max(level, m.level || 1)
  }
  return level
}

// Rule 24: `account`'s geometrie whole.
export function maxFor(valley: Valley, account: string): number {
  return maxGeometrie(levelFor(valley, account))
}

// Rule 24: `account`'s geometrie left.
export function healthFor(valley: Valley, account: string): number {
  return pointsOf(woundsOf(valley.wounds, account), maxFor(valley, account))
}

// Rule 27: `account`'s ward levels at `now` (ms on the valley's
// clock).
export function wardsFor(
  valley: Valley,
  account: string,
  now: number
): WardLevels {
  return levelsAt(wardsOf(valley.wards, account), now / 1000)
}

// Rule 20: what the entries `account` just found pay. A landmark found
// for the first time (the Keep) pays its bounty (book.ts bountyOf) and its
// XP (rule 22); anything else pays nothing.
export function findsPay(
  account: string,
  found: readonly string[]
): { cents: number; xp: XpGrant[] } {
  const cents = bountyOf(found)
  if (cents <= 0) return { cents: 0, xp: [] }
  return { cents, xp: [{ account, source: 'landmark' }] }
}

// Rule 3: whether raider `id` is in Marx's bed, by the valley's own truck.
// A state frame's `riding` is the client's word, for drawing peers only:
// no rule reads it, so a client that says it rides is not out of reach.
export function inTheBed(valley: Valley, id: string): boolean {
  return valley.world !== null && isAboard(valley.world.truck, id)
}

// Rule 28: every Citgo `account` has stood at, and the last.
export function citgosFor(valley: Valley, account: string): CitgoLog {
  return valley.citgos[account] ?? NO_CITGOS
}

// Rule 36: the waypoints `account` keeps.
export function waypointsFor(valley: Valley, account: string): Waypoints {
  return valley.waypoints[account] ?? NO_WAYPOINTS
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
    dealer: world.dealerStock,
    corpses: valley.corpses.map(corpseWire),
    portals: world.portals.map(
      ({ id, name, field, citgo, station, slot, closes }): Portal => ({
        id,
        name,
        field,
        citgo,
        station,
        slot,
        closes,
      })
    ),
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
    'by' | 'index' | 'station' | 'item' | 'drop' | 'count' | 'corpse' | 'portal'
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

// When the valley next needs waking: the truck's next change, a Citgo
// portal closing, or the day's turn, whichever comes first; null with no
// world or nobody in it.
export function wakeAt(valley: Valley, now: number): number | null {
  const { world } = valley
  if (!world || Object.keys(valley.members).length === 0) return null
  let wake = nextMidnight(now)
  for (const at of [
    nextChange(world.truck, world.routes),
    nextClose(world.portals),
  ]) {
    if (at !== null) wake = Math.min(wake, at)
  }
  return wake
}

const TRUCK_REASONS: Record<TruckChange, WorldReason> = {
  depart: 'depart',
  home: 'home',
  dropoff: 'dropoff',
  donuts: 'donuts',
  back: 'back',
}

// The world moved on to `now`: the day turned (rule 6), the truck through
// every change due (rule 3), and the Citgo portals due closed (rule 28).
// The frames say each, oldest first.
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
      dealerStock: freshDealerStock(),
      drops: [],
    })
    frames.push(frame(next, 'refill'))
  }
  const portals = next.world ? openAt(next.world.portals, now) : []
  if (next.world && portals.length < next.world.portals.length) {
    next = withWorld(next, { ...next.world, portals })
    frames.push(frame(next, 'portal-closed'))
  }
  const settled = settleTruck(world.truck, now, world.routes)
  // Rule 22: whoever was still in the bed when Marx got home rode with
  // him; one hopping out on the way did not.
  // Only a drive of some length earns it (marx.ts rideMetres).
  const xp =
    (settled.changes.includes('home') || settled.changes.includes('dropoff')) &&
    rideMetres(world.truck.leg, world.routes) >= CONFIG.truck.rideXpMetres
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
export function grantsTo(
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
  const r =
    bodiless(settled.valley, action, now) ??
    act(settled.valley, action, context)
  const broadcast = [...settled.frames, ...r.broadcast]
  if (r.reject) {
    return { ...r, broadcast, alarm: wakeAt(before, now), valley: before }
  }
  const xp = [...settled.xp, ...(r.xp ?? [])]
  return { ...r, broadcast, ...(xp.length > 0 ? { xp } : {}) }
}

// Rule 29: what takes a body in the valley, refused to a raider dialed in
// without one, under the frame's own name.
const NEEDS_A_BODY: Partial<Record<ValleyAction['type'], NackRe>> = {
  board: 'board',
  'hop-out': 'hop-out',
  call: 'call',
  charter: 'charter',
  take: 'take',
  collect: 'collect',
  pass: 'pass',
  drop: 'drop',
  'take-drop': 'take-drop',
  loot: 'loot',
  'open-portal': 'portal',
}

function bodiless(
  valley: Valley,
  action: ValleyAction,
  now: number
): Reduced | null {
  if (!('id' in action) || !valley.members[action.id]?.dialup) return null
  const re =
    action.type === 'quest' && action.step === 'lay'
      ? 'quest'
      : NEEDS_A_BODY[action.type]
  if (!re) return null
  return done(valley, now, { broadcast: [], reply: nack(re, 'dialup') })
}

// One valley action, by its type; each handler below acts on its own.
type ActionOf<T extends ValleyAction['type']> = Extract<
  ValleyAction,
  { type: T }
>

function act(
  valley: Valley,
  action: ValleyAction,
  context: ValleyContext
): Reduced {
  switch (action.type) {
    case 'join':
      return onJoin(valley, action, context)
    case 'dial':
      return onDial(valley, action, context)
    case 'leave':
      return onLeave(valley, action, context)
    case 'board':
    case 'hop-out':
    case 'call':
      return onTruck(valley, action, context)
    case 'charter':
      return onCharter(valley, action, context)
    case 'take':
      return onTake(valley, action, context)
    case 'buy':
      return onBuy(valley, action, context)
    case 'quest':
      return onQuest(valley, action, context)
    case 'deal':
      return onDeal(valley, action, context)
    case 'collect':
      return onCollect(valley, action, context)
    case 'use':
      return onUse(valley, action, context)
    case 'drop':
      return onDrop(valley, action, context)
    case 'take-drop':
      return onTakeDrop(valley, action, context)
    case 'spill':
      return onSpill(valley, action, context)
    case 'fall':
      return onFall(valley, action, context)
    case 'hit':
      return onHit(valley, action, context)
    case 'plunge':
      return onPlunge(valley, action, context)
    case 'pass':
      return onPass(valley, action, context)
    case 'dose':
      return onDose(valley, action, context)
    case 'empty':
      return onEmpty(valley, action, context)
    case 'mend':
      return onMend(valley, action, context)
    case 'set-health':
      return onSetHealth(valley, action, context)
    case 'level':
      return onLevel(valley, action, context)
    case 'loot':
      return onLoot(valley, action, context)
    case 'keys-back':
      return onKeysBack(valley, action, context)
    case 'stow':
    case 'unstow':
      return onStash(valley, action, context)
    case 'laptop':
      return onLaptop(valley, action, context)
    case 'stand-stock':
    case 'stand-collect':
    case 'stand-upgrade':
      return onStand(valley, action, context)
    case 'recycle':
      return onRecycle(valley, action, context)
    case 'expedition-send':
    case 'expedition-claim':
      return onExpedition(valley, action, context)
    case 'trade':
      return onTrade(valley, action, context)
    case 'appearance':
      return onAppearance(valley, action, context)
    case 'invite':
      return onInvite(valley, action, context)
    case 'party-leave':
      return onPartyLeave(valley, action, context)
    case 'party-drop':
      return onPartyDrop(valley, action, context)
    case 'visit':
      return onVisit(valley, action, context)
    case 'open-portal':
      return onOpenPortal(valley, action, context)
    case 'mark':
      return onMark(valley, action, context)
    case 'clock':
      return done(valley, context.now, { broadcast: [] })
    case 'hurry':
      return onHurry(valley, action, context)
    case 'reset':
      return onReset(valley, context)
  }
}

function onJoin(
  valley: Valley,
  action: ActionOf<'join'>,
  { now, present }: ValleyContext
): Reduced {
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
      wreck: action.wreck,
      bushes: action.bushes,
      dealer: action.dealer,
      dealerStock: freshDealerStock(),
      undercroft: action.undercroft,
      rings: action.rings,
      portals: [],
      nextPortal: 0,
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
    level: action.level ?? 1,
  }
  const arrived = backInParty(
    { ...valley, members, world: { ...world, truck } },
    action.account,
    now
  )
  const next = arrived.valley
  return done(next, now, {
    broadcast: [frame(next, 'joined', { by: action.id })],
    ...partyFields(arrived.party, arrived.partyNews),
  })
}

// Rule 34: an account in the valley again, back in its party (no longer
// away), and everyone away past the linger out of theirs; the parties
// that changed are sent again.
function backInParty(
  valley: Valley,
  account: string,
  now: number
): { valley: Valley; party: string[]; partyNews: PartyNews[] } {
  const dropped = dropLingered(valley, now)
  const parties = markAway(dropped.valley.parties, account, null)
  const party = [...dropped.party]
  for (const to of accountsOf(partyOf(parties, account))) {
    if (!party.includes(to)) party.push(to)
  }
  return {
    valley: { ...dropped.valley, parties },
    party,
    partyNews: dropped.partyNews,
  }
}

function onDial(
  valley: Valley,
  action: ActionOf<'dial'>,
  { now, present }: ValleyContext
): Reduced {
  // Rule 29: in the valley, never placed in it. No world is opened for
  // them, and the truck pays them no mind.
  const members: Record<string, Member> = {}
  for (const m of Object.values(valley.members)) {
    if (present.includes(m.id)) members[m.id] = m
  }
  members[action.id] = {
    id: action.id,
    account: action.account,
    name: action.name,
    outfit: action.outfit,
    level: action.level,
    dialup: true,
  }
  const arrived = backInParty({ ...valley, members }, action.account, now)
  const next = arrived.valley
  return done(next, now, {
    broadcast: [frame(next, 'joined', { by: action.id })],
    ...partyFields(arrived.party, arrived.partyNews),
  })
}

function onLeave(
  valley: Valley,
  action: ActionOf<'leave'>,
  { now }: ValleyContext
): Reduced {
  const member = valley.members[action.id]
  if (!member) return done(valley, now, { broadcast: [] })
  const members = { ...valley.members }
  delete members[action.id]
  // Rule 34: the account's last socket gone, it is away from its party
  // (out of it once the linger runs out); its party hears it is.
  const gone = !Object.values(members).some((m) => m.account === member.account)
  const parties = gone
    ? markAway(valley.parties, member.account, now)
    : valley.parties
  const party = gone ? accountsOf(partyOf(parties, member.account)) : []
  let next: Valley = { ...valley, members, parties }
  const world = next.world
  // Rule 2: where they stood on foot is where they come back.
  const at = action.at
  if (at && !inTheBed(valley, action.id)) {
    next = {
      ...next,
      places: {
        ...next.places,
        [member.account]: { x: at.x, z: at.z, yaw: at.yaw },
      },
    }
  }
  if (!world) {
    return done(next, now, { broadcast: [], ...partyFields(party, []) })
  }
  next = withTruck(next, world, leave(world.truck, action.id, now))
  return done(next, now, {
    broadcast: [frame(next, 'left', { by: action.id })],
    ...partyFields(party, []),
  })
}

function onTruck(
  valley: Valley,
  action: ActionOf<'board' | 'hop-out' | 'call'>,
  { now }: ValleyContext
): Reduced {
  const world = valley.world
  const re = action.type
  if (!valley.members[action.id] || !world) {
    return done(valley, now, {
      broadcast: [],
      reply: nack(re, 'not-in-valley'),
    })
  }
  // Where the bed is to climb into: parked at home, or come to a
  // whistle; and a whistle only from where the valley heard the
  // whistler stand.
  if (action.type === 'board' || action.type === 'call') {
    const leg = world.truck.leg
    const target =
      action.type === 'call'
        ? action.at
        : leg.kind === 'called'
          ? leg.to
          : world.routes.home
    const far = target
      ? tooFar(action.at, target, CONFIG.valleyReach.truck)
      : 'no-position'
    if (far) {
      return done(valley, now, { broadcast: [], reply: nack(re, far) })
    }
  }
  // Rule 3.
  const truck =
    action.type === 'board'
      ? board(world.truck, action.id, now)
      : action.type === 'hop-out'
        ? hopOut(world.truck, action.id)
        : call(
            world.truck,
            action.id,
            tooFar(action.from, world.routes.home, CONFIG.valleyReach.callFrom)
              ? world.routes.home
              : action.from,
            action.at ?? world.routes.home,
            now
          )
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

function onCharter(
  valley: Valley,
  action: ActionOf<'charter'>,
  { now, present }: ValleyContext
): Reduced {
  const world = valley.world
  if (!valley.members[action.id] || !world) {
    return done(valley, now, {
      broadcast: [],
      reply: nack('charter', 'not-in-valley'),
    })
  }
  const { to } = action
  const { width, height } = world.metres
  if (to && (Math.abs(to.x) > width / 2 || Math.abs(to.z) > height / 2)) {
    return done(valley, now, {
      broadcast: [],
      reply: nack('charter', 'off-map'),
    })
  }
  // Alone in the valley: no one else here (a second socket on the
  // account counts as someone).
  const solo = present.filter((id) => valley.members[id]).length <= 1
  const truck = charter(world.truck, action.id, to, now, solo)
  if (refused(truck)) {
    return done(valley, now, {
      broadcast: [],
      reply: nack('charter', truck.refused),
    })
  }
  // Settled at once, so a solo pick leaves now rather than at the next
  // wake.
  const settled = settleTruck(truck, now, world.routes)
  const next = withTruck(valley, world, settled.truck)
  return done(next, now, {
    broadcast: [
      frame(next, 'charted', { by: action.id }),
      ...settled.changes.map((change) => frame(next, TRUCK_REASONS[change])),
    ],
  })
}

function onTake(
  valley: Valley,
  action: ActionOf<'take'>,
  { now }: ValleyContext
): Reduced {
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
  // Within reach, and in its room when it lies behind walls.
  const far =
    tooFar(action.at, spec, CONFIG.valleyReach.item) ??
    (spec.within &&
    action.at &&
    !insideRing(action.at.x, action.at.z, spec.within)
      ? 'too-far'
      : null)
  if (far) {
    return done(valley, now, {
      broadcast: [],
      reply: nack('take', far, action.index),
    })
  }
  const next = withWorld(valley, {
    ...world,
    taken: [...world.taken, action.index],
  })
  const reduced = done(next, now, {
    broadcast: [frame(next, 'taken', { by: action.id, index: action.index })],
    // Rule 22.
    xp: [{ account: member.account, source: 'pickup' }],
  })
  // Rule 10; cash (the plaza's quarters, its $20) into the wallet, as
  // a drop of it taken up is (rule 11).
  if (isCash(spec.kind) && spec.count > 0) {
    reduced.earn = {
      account: member.account,
      amount: spec.count * centsOf(spec.kind),
    }
  } else if (isPackKind(spec.kind) && spec.count > 0) {
    reduced.pack = {
      account: member.account,
      kind: spec.kind,
      delta: spec.count,
    }
  }
  return reduced
}

function onBuy(
  valley: Valley,
  action: ActionOf<'buy'>,
  { now, cash }: ValleyContext
): Reduced {
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
  // Rule 29: dialed in, any Citgo the account has stood at; on foot, the
  // one they stand at.
  if (member.dialup) {
    const { visited } = citgosFor(valley, member.account)
    if (!visited.includes(station)) return refuse('not-visited')
  } else {
    const haven = world.havens[station] as XZ | undefined
    const far = haven && tooFar(action.at, haven, CONFIG.stash.stationReach)
    if (far) return refuse(far)
  }
  if (cash === undefined || cash < price) return refuse('short')
  const shelves = world.shelves.map((s, i) =>
    i === station ? takeUnit(s, kind, unit) : s
  )
  const next = withWorld(valley, { ...world, shelves })
  const reduced = done(next, now, {
    broadcast: [frame(next, 'bought', { by: action.id, station, item: kind })],
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

function onQuest(
  valley: Valley,
  action: ActionOf<'quest'>,
  { now, quest }: ValleyContext
): Reduced {
  const member = valley.members[action.id]
  const world = valley.world
  const refuse = (reason: string): Reduced =>
    done(valley, now, {
      broadcast: [],
      reply: { type: 'nack', re: 'quest', reason },
    })
  if (!member || !world) return refuse('not-in-valley')
  if (!isQuest(action.quest)) return refuse('no-such-quest')
  if (!quest) return refuse('unavailable')
  // Rule 26.
  if (world.truck.riders.includes(action.id)) return refuse('aboard')
  const heart = world.maze
    ? mazeToWorld(world.maze, heartPoint(theMaze()))
    : null
  const step = questStep(
    QUESTS[action.quest],
    quest.stage,
    action.step,
    quest.pack,
    {
      // Rule 29: dialed in, Erwin is a call away; the heart of the maze
      // is not (laying the rose takes a body, bodiless).
      atDealer: !!member.dialup || atDealer(action.at, world.dealer),
      atHeart: atHeart(action.at, heart),
    }
  )
  if (!step.ok) return refuse(step.reason)
  return done(valley, now, {
    broadcast: [],
    quest: {
      account: member.account,
      quest: action.quest,
      step: action.step,
      from: quest.stage,
      to: step.stage,
      change: step.change,
    },
    // Rule 22.
    ...(step.stage === 'done'
      ? { xp: [{ account: member.account, source: 'quest' as const }] }
      : {}),
  })
}

function onDeal(
  valley: Valley,
  action: ActionOf<'deal'>,
  { now, holdings }: ValleyContext
): Reduced {
  const member = valley.members[action.id]
  const world = valley.world
  const { kind } = action
  const refuse = (reason: string): Reduced =>
    done(valley, now, {
      broadcast: [],
      reply: { type: 'nack', re: 'deal', reason, item: kind },
    })
  if (!member || !world) return refuse('not-in-valley')
  // Rule 25.
  if (!world.dealer) return refuse('no-dealer')
  // Rule 29: dialed in, wherever they are.
  if (!member.dialup && !atDealer(action.at, world.dealer)) {
    return refuse('too-far')
  }
  if (world.truck.riders.includes(action.id)) return refuse('aboard')
  const sale = deal(world.dealerStock, kind, action.pay, holdings?.pack ?? {})
  if (!sale.ok) return refuse(sale.reason)
  const next = withWorld(valley, { ...world, dealerStock: sale.stock })
  return done(next, now, {
    broadcast: [frame(next, 'dealt', { by: action.id, item: kind })],
    // Rule 10.
    barter: {
      account: member.account,
      give: sale.give,
      take: { kind, count: sale.units },
    },
    // Rule 22.
    xp: [{ account: member.account, source: 'purchase' }],
  })
}

function onCollect(
  valley: Valley,
  action: ActionOf<'collect'>,
  { now }: ValleyContext
): Reduced {
  const member = valley.members[action.id]
  const world = valley.world
  if (!member || !world) {
    return done(valley, now, {
      broadcast: [],
      reply: nack('collect', 'not-in-valley'),
    })
  }
  // Rule 8.
  const { bush } = action
  const spot = world.bushes[bush] as XZ | undefined
  if (!Number.isInteger(bush) || bush < 0 || bush >= BUSHES || !spot) {
    return done(valley, now, {
      broadcast: [],
      reply: nack('collect', 'no-such-bush'),
    })
  }
  const far = tooFar(action.at, spot, CONFIG.valleyReach.item)
  if (far) {
    return done(valley, now, { broadcast: [], reply: nack('collect', far) })
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

function onUse(
  valley: Valley,
  action: ActionOf<'use'>,
  { now }: ValleyContext
): Reduced {
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

function onEmpty(
  valley: Valley,
  action: ActionOf<'empty'>,
  { now }: ValleyContext
): Reduced {
  // Rule 32: into the pack the unit came out of.
  const member = valley.members[action.id]
  const empty = member ? emptyOf(action.kind, action.left) : null
  if (!member || !empty) return done(valley, now, { broadcast: [] })
  return done(valley, now, {
    broadcast: [],
    pack: { account: member.account, kind: empty, delta: 1 },
  })
}

function onDrop(
  valley: Valley,
  action: ActionOf<'drop'>,
  { now }: ValleyContext
): Reduced {
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
  // A key item is never set down (items.ts isKeyItem).
  if (isKeyItem(kind)) return refuse('key-item')
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

function onTakeDrop(
  valley: Valley,
  action: ActionOf<'take-drop'>,
  { now, research }: ValleyContext
): Reduced {
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
  const far = tooFar(action.at, drop, CONFIG.valleyReach.item)
  if (far) return refuse(far)
  const { taken } = takeUp(drop, Infinity)
  const next = withWorld(valley, {
    ...world,
    drops: world.drops.filter((d) => d.id !== drop.id),
  })
  const account = member.account
  // Rule 33: loose change, over a burst's dimes, for this taker alone.
  const extra =
    drop.burst && drop.kind === DIMES && research
      ? extraDimes(research.levels, taken, action.roll ?? 1)
      : 0
  return done(next, now, {
    ...(extra > 0 ? { found: { account, dimes: extra } } : {}),
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
      ? { earn: { account, amount: (taken + extra) * centsOf(drop.kind) } }
      : { pack: { account, kind: drop.kind, delta: taken } }),
    // Rule 22: only what the valley left, never a raider's own drop.
    ...(drop.spilled ? { xp: [{ account, source: 'drop' as const }] } : {}),
  })
}

function onSpill(
  valley: Valley,
  action: ActionOf<'spill'>,
  { now }: ValleyContext
): Reduced {
  // Rules 11 and 13: each burst leaves its dimes lying where it was,
  // and the Caretaker burned its gold bullion. Only cash or an item.
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
    burst: true,
  }))
  // The oldest of what the valley spilled goes past the cap; what a
  // raider dropped lies.
  let drops = [...world.drops, ...spilled]
  let over = drops.filter((d) => d.spilled).length - CONFIG.drops.spilledMax
  if (over > 0) {
    drops = drops.filter((d) => !(d.spilled && over-- > 0))
  }
  const next = withWorld(valley, {
    ...world,
    drops,
    nextDrop: world.nextDrop + spilled.length,
    graves: buried.graves,
    nextGrave: buried.next,
  })
  return done(next, now, { broadcast: [frame(next, 'spilled')] })
}

function onFall(
  valley: Valley,
  action: ActionOf<'fall'>,
  { now, cash }: ValleyContext
): Reduced {
  // Rule 18. One body an account: a second fall takes the first away,
  // and what it still held is lost. A new body only where the valley
  // heard the raider stand, and only with something on it; there too the
  // share of the wallet the strike spills, in dimes.
  const member = valley.members[action.id]
  if (!member) return done(valley, now, { broadcast: [] })
  const corpses = valley.corpses.filter((c) => c.account !== member.account)
  const lost = corpses.length < valley.corpses.length
  const dimes = action.at && valley.world ? spilledDimes(cash ?? 0) : 0
  const body = action.at && !isEmpty(action.items)
  if (!body && !lost && dimes === 0) {
    return done(valley, now, { broadcast: [] })
  }
  const id = valley.nextCorpse
  let next: Valley = { ...valley, corpses }
  if (body && action.at) {
    const { x, z, yaw } = action.at
    next = {
      ...next,
      corpses: [
        ...corpses,
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
  }
  if (dimes > 0 && action.at && next.world) {
    const world = next.world
    const drop: Drop = {
      id: world.nextDrop,
      kind: DIMES,
      count: dimes,
      x: action.at.x,
      z: action.at.z,
      spilled: true,
    }
    next = withWorld(next, {
      ...world,
      drops: [...world.drops, drop],
      nextDrop: world.nextDrop + 1,
    })
  }
  return done(next, now, {
    broadcast: next.world
      ? [
          frame(next, 'fell', {
            by: action.id,
            ...(body ? { corpse: id } : {}),
          }),
        ]
      : [],
    ...(body ? { corpse: id } : {}),
    ...(dimes > 0
      ? { spend: { account: member.account, amount: dimes * DIME_CENTS } }
      : {}),
  })
}

function onHit(
  valley: Valley,
  action: ActionOf<'hit'>,
  { now }: ValleyContext
): Reduced {
  // Rules 24 and 27: the shadow's hit, cut by the wards.
  const member = valley.members[action.id]
  if (!member) return done(valley, now, { broadcast: [] })
  const { account } = member
  const levels = wardsFor(valley, account, now)
  const { damage, warded } = damageOf(action.by, levels, action.roll)
  return hurt(valley, account, now, { by: action.by, damage, warded })
}

function onPlunge(
  valley: Valley,
  action: ActionOf<'plunge'>,
  { now }: ValleyContext
): Reduced {
  // Rule 24: a fall, no ward cutting it. A raider on the phone has no body
  // to fall.
  const member = valley.members[action.id]
  if (!member || member.dialup) return done(valley, now, { broadcast: [] })
  const { account } = member
  const damage = fallDamage(action.height, maxFor(valley, account))
  if (damage === 0) return done(valley, now, { broadcast: [] })
  return hurt(valley, account, now, { by: 'fall', damage, warded: 0 })
}

// Rule 24: `struck` off the account's geometrie; the last of it shatters
// it, the account whole and sober again after.
function hurt(
  valley: Valley,
  account: string,
  now: number,
  struck: { by: Hurt; damage: number; warded: number }
): Reduced {
  const max = maxFor(valley, account)
  const before = pointsOf(woundsOf(valley.wounds, account), max)
  const { points, fatal } = hit(before, struck.damage, max)
  const next: Valley = {
    ...valley,
    wounds: withWounds(valley.wounds, account, fatal ? 0 : max - points),
    // A shattering leaves the raider sober.
    wards: fatal ? sobered(valley.wards, account) : valley.wards,
  }
  return done(next, now, {
    broadcast: [],
    health: fatal
      ? { account, points, max, fatal, hit: struck }
      : { account, points, max, hit: struck },
    ...(fatal
      ? {
          wards: [{ account, levels: wardsFor(next, account, now) }],
        }
      : {}),
  })
}

function onPass(
  valley: Valley,
  action: ActionOf<'pass'>,
  { now }: ValleyContext
): Reduced {
  // Rule 27: to another account's raider on foot, both where their
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
  const { from, at } = action
  if (
    !from ||
    !at ||
    inTheBed(valley, action.id) ||
    inTheBed(valley, action.to)
  ) {
    return refuse('not-on-foot')
  }
  if (!inPassReach(from, at)) return refuse('too-far')
  return done(valley, now, {
    broadcast: [],
    pack: { account: member.account, kind: action.kind, delta: -1 },
    passed: { to: action.to, account: taker.account, kind: action.kind },
  })
}

function onDose(
  valley: Valley,
  action: ActionOf<'dose'>,
  { now }: ValleyContext
): Reduced {
  // Rule 27: the unit is out of the pack. A use doses the user; a
  // pass doses the taker in full, the giver their share, and earns
  // the giver XP for sharing.
  const member = valley.members[action.id]
  if (!member) return done(valley, now, { broadcast: [] })
  const amounts = doseOf(action.kind)
  const time = now / 1000
  const taker = action.to === undefined ? null : valley.members[action.to]
  if (action.to !== undefined && !taker) {
    return done(valley, now, { broadcast: [] })
  }
  let record = valley.wards
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
  const next = { ...valley, wards: record }
  return done(next, now, {
    broadcast: [],
    wards: changed.map((account) => ({
      account,
      levels: wardsFor(next, account, now),
    })),
    ...(taker
      ? {
          xp: [{ account: member.account, source: 'share' as const }],
        }
      : {}),
  })
}

function onMend(
  valley: Valley,
  action: ActionOf<'mend'>,
  { now }: ValleyContext
): Reduced {
  // Rule 24: a forecourt gives its share back a few seconds at a time; a
  // use, the item's.
  const member = valley.members[action.id]
  if (!member) return done(valley, now, { broadcast: [] })
  const { account } = member
  const wounds = woundsOf(valley.wounds, account)
  if (wounds <= 0) return done(valley, now, { broadcast: [] })
  const max = maxFor(valley, account)
  const before = pointsOf(wounds, max)
  const points =
    action.kind === undefined
      ? mend(before, Math.round(CONFIG.health.forecourt.share * max), max)
      : mend(before, healsOf(action.kind, max), max)
  return done(
    { ...valley, wounds: withWounds(valley.wounds, account, max - points) },
    now,
    { broadcast: [], health: { account, points, max } }
  )
}

function onSetHealth(
  valley: Valley,
  action: ActionOf<'set-health'>,
  { now }: ValleyContext
): Reduced {
  const member = valley.members[action.id]
  if (!member) return done(valley, now, { broadcast: [] })
  const { account } = member
  const max = maxFor(valley, account)
  const points = mend(0, action.points, max)
  // Nothing left is whole again, as after a shattering.
  const wounds = points > 0 ? max - points : 0
  return done(
    { ...valley, wounds: withWounds(valley.wounds, account, wounds) },
    now,
    { broadcast: [], health: { account, points: max - wounds, max } }
  )
}

function onLevel(
  valley: Valley,
  action: ActionOf<'level'>,
  { now }: ValleyContext
): Reduced {
  // Rule 24: a new level's larger whole, the wounds kept; never a level
  // taken back.
  const before = levelFor(valley, action.account)
  if (!(action.level > before)) return done(valley, now, { broadcast: [] })
  const members: Record<string, Member> = { ...valley.members }
  for (const m of Object.values(members)) {
    if (m.account === action.account) {
      members[m.id] = { ...m, level: action.level }
    }
  }
  const next = { ...valley, members }
  const max = maxFor(next, action.account)
  return done(next, now, {
    broadcast: [],
    health: {
      account: action.account,
      points: healthFor(next, action.account),
      max,
    },
  })
}

function onLoot(
  valley: Valley,
  action: ActionOf<'loot'>,
  { now }: ValleyContext
): Reduced {
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
  const far = tooFar(action.at, corpse, CONFIG.valleyReach.item)
  if (far) return refuse(far)
  const next: Valley = {
    ...valley,
    corpses: valley.corpses.filter((c) => c.id !== corpse.id),
  }
  return done(next, now, {
    broadcast: [frame(next, 'looted', { by: action.id, corpse: corpse.id })],
    give: { account: member.account, items: { ...corpse.items } },
  })
}

function onKeysBack(
  valley: Valley,
  action: ActionOf<'keys-back'>,
  { now }: ValleyContext
): Reduced {
  // Rule 18: a key item never lies on a body. One that does (laid before
  // that was so) goes back to its account's pack, and a body it leaves
  // with nothing goes; the valley lays the change only once the pack has
  // the keys (Reduced.give).
  const keys: Inventory = {}
  const gone: number[] = []
  const corpses = valley.corpses.flatMap((corpse) => {
    if (corpse.account !== action.account) return [corpse]
    const off = keysOff(corpse.items)
    if (isEmpty(off.keys)) return [corpse]
    for (const [kind, count] of Object.entries(off.keys)) {
      keys[kind] = (keys[kind] ?? 0) + count
    }
    if (isEmpty(off.kept)) {
      gone.push(corpse.id)
      return []
    }
    return [{ ...corpse, items: off.kept }]
  })
  if (isEmpty(keys)) return done(valley, now, { broadcast: [] })
  const next: Valley = { ...valley, corpses }
  return done(next, now, {
    broadcast:
      next.world && gone.length > 0
        ? [frame(next, 'looted', { corpse: gone[0] })]
        : [],
    give: { account: action.account, items: keys },
  })
}

function onStash(
  valley: Valley,
  action: ActionOf<'stow' | 'unstow'>,
  { now }: ValleyContext
): Reduced {
  // Rule 19.
  const member = valley.members[action.id]
  const world = valley.world
  const re = action.type
  const refuse = (reason: string): Reduced =>
    done(valley, now, { broadcast: [], reply: nack(re, reason) })
  if (!member) return refuse('not-in-valley')
  // Rule 29: dialed in, the locker is the account's wherever they are,
  // world or none.
  if (!member.dialup) {
    if (!world) return refuse('not-in-valley')
    if (isAboard(world.truck, action.id)) return refuse('aboard')
    if (!atLocker(action.at, world.havens)) return refuse('no-locker')
  }
  if (!isPackKind(action.kind)) return refuse('not-an-item')
  // A key item never goes into the locker (items.ts isKeyItem); one
  // stowed before is let out.
  if (re === 'stow' && isKeyItem(action.kind)) return refuse('key-item')
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

function onLaptop(
  valley: Valley,
  action: ActionOf<'laptop'>,
  { now }: ValleyContext
): Reduced {
  // Rule 31.
  const member = valley.members[action.id]
  const world = valley.world
  const refuse = (reason: string): Reduced =>
    done(valley, now, { broadcast: [], reply: nack(action.re, reason) })
  if (!member) return refuse('not-in-valley')
  if (member.dialup) return refuse('dialup')
  if (!world) return refuse('not-in-valley')
  if (isAboard(world.truck, action.id)) return refuse('aboard')
  if (!atLaptop(action.at, world.havens)) return refuse('no-laptop')
  return done(valley, now, {
    broadcast: [],
    laptop: { account: member.account },
  })
}

function onStand(
  valley: Valley,
  action: ActionOf<'stand-stock' | 'stand-collect' | 'stand-upgrade'>,
  { now, stand }: ValleyContext
): Reduced {
  // Rule 23.
  const member = valley.members[action.id]
  const world = valley.world
  const re = action.type
  const refuse = (reason: string): Reduced =>
    done(valley, now, { broadcast: [], reply: nack(re, reason) })
  if (!member) return refuse('not-in-valley')
  // Rule 29: dialed in, the stand is the account's wherever they are,
  // world or none.
  if (!member.dialup) {
    if (!world) return refuse('not-in-valley')
    if (isAboard(world.truck, action.id)) return refuse('aboard')
    if (!atStand(action.at, world.stand)) return refuse('no-stand')
  }
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

function onRecycle(
  valley: Valley,
  action: ActionOf<'recycle'>,
  { now, research }: ValleyContext
): Reduced {
  // Rule 33.
  const member = valley.members[action.id]
  const world = valley.world
  const refuse = (reason: string): Reduced =>
    done(valley, now, { broadcast: [], reply: nack('recycle', reason) })
  if (!member) return refuse('not-in-valley')
  // Rule 29: dialed in, the wreck is wherever they are, as the stand is.
  if (!member.dialup) {
    if (!world) return refuse('not-in-valley')
    if (isAboard(world.truck, action.id)) return refuse('aboard')
    if (!atWreck(action.at, world.wreck)) return refuse('no-wreck')
  }
  if (!research?.pack) return refuse('unavailable')
  const { levels, pack } = research
  const price = priceOf(levels, action.line)
  if (!price) return refuse('top')
  if (!affordsResearch(pack, price)) return refuse('short')
  return done(valley, now, {
    broadcast: [],
    research: {
      account: member.account,
      line: action.line,
      level: levels[action.line] + 1,
      items: price,
    },
  })
}

function onExpedition(
  valley: Valley,
  action: ActionOf<'expedition-send' | 'expedition-claim'>,
  { now, expedition, cash }: ValleyContext
): Reduced {
  // Rule 30.
  const member = valley.members[action.id]
  const re = action.type
  const refuse = (reason: string): Reduced =>
    done(valley, now, { broadcast: [], reply: nack(re, reason) })
  if (!member) return refuse('not-in-valley')
  if (!member.dialup) return refuse('not-dialup')
  if (!expedition) return refuse('unavailable')
  const { account } = member
  if (action.type === 'expedition-send') {
    if (!isExpeditionId(action.kind)) return refuse('unknown')
    const run = embark(
      expedition.run,
      action.kind,
      levelFor(valley, account),
      wardsFor(valley, account, now),
      now,
      action.seed
    )
    if (typeof run === 'string') return refuse(run)
    // Rule 30: a run costs its buy-in, out of the wallet as it leaves.
    const { cost } = CONFIG.expeditions.runs[action.kind]
    if (cost > 0 && (cash ?? 0) < cost) return refuse('short')
    return done(valley, now, {
      broadcast: [],
      expedition: { account, run },
      ...(cost > 0 ? { spend: { account, amount: cost } } : {}),
    })
  }
  const run = expedition.run
  if (!run) return refuse('none')
  if (!isHome(run, now)) return refuse('out')
  const outcome = outcomeOf(run)
  // Rule 24: hurt, never the last point.
  const max = maxFor(valley, account)
  const before = healthFor(valley, account)
  const points = woundedBy(before, max, outcome.damage)
  const wounded =
    points === before
      ? valley
      : { ...valley, wounds: withWounds(valley.wounds, account, max - points) }
  return done(wounded, now, {
    broadcast: [],
    expedition: { account, run: null, outcome },
    // Rule 22.
    xp: [{ account, source: 'expedition', times: outcome.xp }],
    ...(points === before ? {} : { health: { account, points, max } }),
  })
}

function onTrade(
  valley: Valley,
  action: ActionOf<'trade'>,
  { now, holdings }: ValleyContext
): Reduced {
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

function onAppearance(
  valley: Valley,
  action: ActionOf<'appearance'>,
  { now }: ValleyContext
): Reduced {
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
    // Rule 34: the parties name them by the new name too.
    parties: action.name
      ? renamed(valley.parties, member.account, action.name)
      : valley.parties,
  }
  const party = action.name
    ? accountsOf(partyOf(next.parties, member.account))
    : []
  return done(next, now, { broadcast: [], ...partyFields(party, []) })
}

// Rule 34: the accounts of a party's members.
function accountsOf(party: Party | null): string[] {
  return party ? party.members.map((m) => m.account) : []
}

// Rule 34: everyone in the valley's parties away past the linger, out;
// each one's party told, and sent it again.
function dropLingered(
  valley: Valley,
  now: number
): { valley: Valley; party: string[]; partyNews: PartyNews[] } {
  const { state, dropped } = dropAway(valley.parties, now - CONFIG.net.lingerMs)
  if (dropped.length === 0) return { valley, party: [], partyNews: [] }
  const party: string[] = []
  const partyNews: PartyNews[] = []
  for (const { account, party: was } of dropped) {
    const name = was.members.find((m) => m.account === account)?.name ?? ''
    for (const to of accountsOf(was)) {
      if (!party.includes(to)) party.push(to)
      if (to !== account) partyNews.push({ account: to, news: 'left', name })
    }
  }
  return { valley: { ...valley, parties: state }, party, partyNews }
}

// The party fields of a Reduced, left out when empty.
function partyFields(
  party: readonly string[],
  partyNews: readonly PartyNews[]
): Pick<Reduced, 'party' | 'partyNews'> {
  return {
    ...(party.length > 0 ? { party: [...party] } : {}),
    ...(partyNews.length > 0 ? { partyNews: [...partyNews] } : {}),
  }
}

// Rule 34: an invite to the raider in the valley named `name`, or theirs
// taken up by inviting back.
function onInvite(
  valley: Valley,
  action: ActionOf<'invite'>,
  { now }: ValleyContext
): Reduced {
  const me = valley.members[action.id]
  if (!me) return done(valley, now, { broadcast: [] })
  const them = Object.values(valley.members).find((m) =>
    sameName(m.name, action.name)
  )
  if (!them) {
    return done(valley, now, {
      broadcast: [],
      reply: nack('invite', 'not-here'),
    })
  }
  const from = { account: me.account, name: me.name }
  const to = { account: them.account, name: them.name }
  const out = partyInvite(valley.parties, from, to, now)
  const next: Valley = { ...valley, parties: out.state }
  if (out.outcome === 'invited') {
    return done(next, now, {
      broadcast: [],
      ...partyFields(
        [to.account],
        [
          { account: to.account, news: 'invited', name: me.name },
          { account: me.account, news: 'sent', name: them.name },
        ]
      ),
    })
  }
  if (out.outcome !== 'joined') {
    return done(valley, now, {
      broadcast: [],
      reply: nack('invite', out.outcome),
    })
  }
  const members = accountsOf(out.party)
  return done(next, now, {
    broadcast: [],
    ...partyFields(
      members,
      members.map((account) => ({ account, news: 'joined', name: me.name }))
    ),
  })
}

// Rule 34: out of the party; everyone in it told, the leaver too.
function onPartyLeave(
  valley: Valley,
  action: ActionOf<'party-leave'>,
  { now }: ValleyContext
): Reduced {
  const me = valley.members[action.id]
  if (!me) return done(valley, now, { broadcast: [] })
  const out = partyLeave(valley.parties, me.account)
  if (!out.party) {
    return done(valley, now, {
      broadcast: [],
      reply: nack('party-leave', 'no-party'),
    })
  }
  const members = accountsOf(out.party)
  return done({ ...valley, parties: out.state }, now, {
    broadcast: [],
    ...partyFields(
      members,
      members.map((account) => ({ account, news: 'left', name: me.name }))
    ),
  })
}

// Rule 34: an account gone past the linger with no socket left, out of
// its party (the valley's linger timer); one back in the meantime stays.
function onPartyDrop(
  valley: Valley,
  action: ActionOf<'party-drop'>,
  { now }: ValleyContext
): Reduced {
  const here = Object.values(valley.members).some(
    (m) => m.account === action.account
  )
  const party = partyOf(valley.parties, action.account)
  if (here || !party) return done(valley, now, { broadcast: [] })
  const name =
    party.members.find((m) => m.account === action.account)?.name ?? ''
  const out = partyLeave(valley.parties, action.account)
  const members = accountsOf(out.party)
  return done({ ...valley, parties: out.state }, now, {
    broadcast: [],
    ...partyFields(
      members,
      members
        .filter((account) => account !== action.account)
        .map((account) => ({ account, news: 'left', name }))
    ),
  })
}

function onVisit(
  valley: Valley,
  action: ActionOf<'visit'>,
  { now }: ValleyContext
): Reduced {
  // Rule 28.
  const member = valley.members[action.id]
  const world = valley.world
  if (!member || !world) return done(valley, now, { broadcast: [] })
  if (!Number.isInteger(action.station)) {
    return done(valley, now, { broadcast: [] })
  }
  if (action.station < 0 || action.station >= world.stations) {
    return done(valley, now, { broadcast: [] })
  }
  const { account } = member
  const before = citgosFor(valley, account)
  const log = visit(before, action.station)
  if (log === before) return done(valley, now, { broadcast: [] })
  // Found: new to the account, and not the first it ever stood at (the
  // spawn Citgo, where every raider starts).
  const found =
    before.visited.length > 0 && !before.visited.includes(action.station)
  return done(
    { ...valley, citgos: { ...valley.citgos, [account]: log } },
    now,
    {
      broadcast: [],
      citgos: { account, log },
      ...(found
        ? {
            earn: { account, amount: CONFIG.bounties.citgo },
            xp: [{ account, source: 'citgo' as const }],
          }
        : {}),
    }
  )
}

function onMark(
  valley: Valley,
  action: ActionOf<'mark'>,
  { now }: ValleyContext
): Reduced {
  // Rule 36.
  const member = valley.members[action.id]
  const world = valley.world
  if (!member || !world) return done(valley, now, { broadcast: [] })
  const { account } = member
  const points = cleanWaypoints(action.points, world.metres)
  // Heard back even unchanged, so a client that asked for more than was
  // kept draws what was.
  const kept = sameWaypoints(points, waypointsFor(valley, account))
    ? valley
    : { ...valley, waypoints: { ...valley.waypoints, [account]: points } }
  return done(kept, now, { broadcast: [], waypoints: { account, points } })
}

function onOpenPortal(
  valley: Valley,
  action: ActionOf<'open-portal'>,
  { now }: ValleyContext
): Reduced {
  // Rule 28.
  const member = valley.members[action.id]
  const world = valley.world
  const refuse = (reason: string): Reduced =>
    done(valley, now, { broadcast: [], reply: nack('portal', reason) })
  if (!member || !world) return refuse('not-in-valley')
  if (isAboard(world.truck, action.id)) return refuse('aboard')
  if (!action.at) return refuse('no-position')
  const station = citgosFor(valley, member.account).last
  const ring = station === null ? undefined : world.rings[station]
  if (station === null || !ring) return refuse('no-citgo')
  if (citgoAt(action.at, [world.havens[station]]) !== null) {
    return refuse('at-citgo')
  }
  // One an account: its last closes as this one opens.
  const others = world.portals.filter((p) => p.account !== member.account)
  const slot = freeSlot(others, station)
  if (slot === null) return refuse('busy')
  const id = world.nextPortal
  const portal: ValleyPortal = {
    id,
    name: member.name,
    field: fieldEnd(action.at),
    citgo: ringEnd(ring, slot),
    station,
    slot,
    closes: now + CONFIG.portal.lifeSeconds * 1000,
    account: member.account,
  }
  const next = withWorld(valley, {
    ...world,
    portals: [...others, portal],
    nextPortal: id + 1,
  })
  return done(next, now, {
    broadcast: [frame(next, 'portal-opened', { by: action.id, portal: id })],
  })
}

function onHurry(
  valley: Valley,
  action: ActionOf<'hurry'>,
  { now }: ValleyContext
): Reduced {
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

function onReset(valley: Valley, { now }: ValleyContext): Reduced {
  // The whole world afresh: the next arrival opens it. The members
  // stay, and are asked to come back.
  const next: Valley = { ...valley, world: null }
  return done(next, now, { broadcast: [frame(next, 'reset')] })
}

// Rules 15, 16 and 22: the accounts behind the sockets whose beams burned the
// Caretaker or burst a shadowman, each once, in the order their beams were
// counted.
// Rule 34: the accounts a burning of the Caretaker credits: each burner's
// (creditedWith), and every member of a burner's party placed within
// CONFIG.party.creditRadius of them (party.ts withParty).
export function creditedWithParty(
  valley: Valley,
  ids: readonly string[],
  raiders: readonly { id: string; x: number; z: number }[]
): string[] {
  const spots = raiders.flatMap(({ id, x, z }) => {
    const account = valley.members[id]?.account
    return account ? [{ id, account, x, z }] : []
  })
  const burners = spots.filter((spot) => ids.includes(spot.id))
  const credited = creditedWith(valley, ids)
  for (const account of withParty(valley.parties, burners, spots)) {
    if (!credited.includes(account)) credited.push(account)
  }
  return credited
}

export function creditedWith(valley: Valley, ids: readonly string[]): string[] {
  const accounts: string[] = []
  for (const id of ids) {
    const account = valley.members[id]?.account
    if (account && !accounts.includes(account)) accounts.push(account)
  }
  return accounts
}
