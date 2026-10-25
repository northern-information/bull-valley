// The valley in the browser: the systems boot() builds (Game) and the
// state they share and change (GameState). boot() makes one of each; actions.ts,
// valleysync.ts, input.ts, targets.ts and loop.ts each take the Game.

import { NO_CITGOS } from './citgos.ts'
import { CONFIG } from './config.ts'
import { NO_TASK } from './dailytask.ts'
import { HAND_DOWN } from './hands.ts'
import { BASE_GEOMETRIE } from './health.ts'
import { NO_EFFECTS } from './hotbar.ts'
import { STARTING_INVENTORY } from './inventory.ts'
import { NO_PROGRESS } from './season.ts'
import { freshStock } from './store.ts'
import { SOBER } from './wardlevels.ts'
import { NO_WAYPOINTS } from './waypoints.ts'
import type { CaretakerShade } from './caretakerrig.ts'
import type { Fanfare } from './catchfanfare.ts'
import type { CitgoLog } from './citgos.ts'
import type { Constellations } from './constellationrig.ts'
import type { CorpseMeshes } from './corpsemeshes.ts'
import type { CorpseWire } from './corpses.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { TaskProgress } from './dailytask.ts'
import type { DonutWake } from './donutwakerig.ts'
import type { DropMeshes } from './dropmeshes.ts'
import type { Drop } from './drops.ts'
import type { Emoting } from './emotes.ts'
import type { FishHud } from './fishhud.ts'
import type { AnglerWire, Bait, LineOut } from './fishing.ts'
import type { FirstPersonHands } from './fphands.ts'
import type { PendingAsk } from './friends.ts'
import type { Glow } from './glow.ts'
import type { Grave } from './graves.ts'
import type { Gravestones } from './gravestones.ts'
import type { Hallucinations } from './hallucinationrig.ts'
import type { Hand } from './hands.ts'
import type { Tool } from './held.ts'
import type { Effects, Hotbar } from './hotbar.ts'
import type { Hud } from './hud.ts'
import type { Interaction } from './interactions.ts'
import type { Geo, Inventory, ShopStock } from './interfaces.ts'
import type { ItemThumbs } from './itemthumbs.ts'
import type { LaptopScreen } from './laptopdialog.ts'
import type { Leg, TruckRoutes } from './marx.ts'
import type { MistCards } from './mistcards.ts'
import type { Music } from './musicrig.ts'
import type { NetClient } from './net.ts'
import type { NpcId } from './npcs.ts'
import type { Peers } from './peers.ts'
import type { Phone } from './phone.ts'
import type { Player } from './player.ts'
import type { PlayerBody } from './playerbody.ts'
import type { PortalMeshes } from './portalmeshes.ts'
import type { Portal } from './portals.ts'
import type {
  CrewWire,
  DailyWire,
  FriendWire,
  InspectWire,
  PartyWire,
  PeerStateWire,
  WorldWire,
} from './protocol.ts'
import type { QuestId, QuestStage } from './quests.ts'
import type { Research } from './recycling.ts'
import type { RoadGraph } from './roadgraph.ts'
import type { SeasonProgress } from './season.ts'
import type { SettingsStore } from './settingsui.ts'
import type { Sfx } from './sfxrig.ts'
import type { ShadowBodies } from './shadowbodies.ts'
import type { ShadowBursts } from './shadowburst.ts'
import type { StandLedger } from './stand.ts'
import type { Titles } from './titles.ts'
import type { Trails } from './trails.ts'
import type { TripSolids } from './tripsolidsrig.ts'
import type { Truck } from './truck.ts'
import type { TruckContext, TruckPlan } from './truckplan.ts'
import type { TruckRadio } from './truckradiorig.ts'
import type { TunnelShades } from './tunnelrig.ts'
import type { WardState } from './wardlevels.ts'
import type { WaypointMeshes } from './waypointmeshes.ts'
import type { Waypoints } from './waypoints.ts'
import type { FuelPoint, Pickup, World } from './world.ts'
import type * as THREE from 'three'

// Everything asked of the valley and not yet answered. The line dropping
// clears it whole (freshPending): nothing asked of a valley out of reach
// is ever answered, and a stale ask would misread the next answer.
export interface Pending {
  // Rule 3: a board.
  board: boolean
  // Rule 4: pickups, by index.
  takes: Set<number>
  // Rule 7: shelf units, as station:kind.
  buys: Set<string>
  // Rule 8: a berry.
  collect: boolean
  // Rule 12: drops, by id.
  drops: Set<number>
  // Rule 14: a trade with Moab.
  trade: boolean
  // Rule 18: bodies, by id.
  loots: Set<number>
  // Rule 20: entries of the Book of Shadows.
  book: Set<string>
  // Rule 21: a /friend or /unfriend; whether a /friends is waiting to be
  // shown; and who the last whisper went to, for a refusal's line.
  ask: PendingAsk | null
  showFriends: boolean
  whisperTo: string | null
  // A raider's card asked for (inspect.ts), by the name asked.
  inspect: string | null
  // Rule 34: who an invite went to, for a refusal's line.
  invite: string | null
  // Rule 35: what a crew frame named (a raider or a tag), for a refusal's
  // line.
  crew: string | null
  // Rule 23: a change to the Cabbage Stand.
  stand: boolean
  // Rule 33: a level bought at the Recycling Center.
  recycle: boolean
  // Rule 36: a rod, a dig, a cast or a reel at the firefly pond, and a
  // slurm into the jar.
  fish: boolean
  jar: boolean
}

export function freshPending(): Pending {
  return {
    board: false,
    takes: new Set(),
    buys: new Set(),
    collect: false,
    drops: new Set(),
    trade: false,
    loots: new Set(),
    book: new Set(),
    ask: null,
    showFriends: false,
    whisperTo: null,
    inspect: null,
    invite: null,
    crew: null,
    stand: false,
    recycle: false,
    fish: false,
    jar: false,
  }
}

// Rule 35: the account's crew (null: none) and the crews inviting it.
export interface CrewState {
  crew: CrewWire | null
  invites: { tag: string; name: string }[]
}

export interface GameState {
  // The account's pack as the valley last sent it (the welcome, then every
  // pack frame), with this client's own changes applied in the meantime.
  inventory: Inventory
  // The account's wallet in cents, as the valley last sent it (with this
  // client's own spending applied in the meantime).
  cash: number
  // What the account wears (cosmetics.ts), as the valley last sent it.
  cosmetics: CosmeticId[]
  // Everything asked of the valley and not yet answered.
  pending: Pending
  // The station whose Moab last made this raider his offer, while they
  // stay in his reach; null otherwise. He says it once each time.
  offeredBy: number | null
  // The account's progress through the season (season.ts) as the valley
  // last sent it.
  season: SeasonProgress
  // The Book of Shadows entries the account has found (book.ts), as the
  // valley last said (the welcome, then every book frame). And it with the entries
  // asked (pending.book), as one set (book.ts knownOf), kept in step with
  // each change, for the loop's asks.
  book: Set<string>
  known: Set<string>
  // The account's progress on the daily task (dailytask.ts) as the valley
  // last sent it, on the day it counts.
  task: TaskProgress
  // Rule 21: the account's friends list as the valley last sent it.
  friends: FriendWire[]
  // The account's XP in all (progression.ts) as the valley last sent it.
  xp: number
  // Every Citgo's shelves, one stock per station like world.fuelPoints.
  storeStock: ShopStock[]
  // The item on each number key: the account's, saved one change at a
  // time, in order (hotbarSaved).
  hotbar: Hotbar
  hotbarSaved: Promise<void>
  // Game seconds: advances by the capped frame step.
  time: number
  // A cigarette burning, its ember, the joint's perception, on `time`.
  effects: Effects
  // How high, stimulated and drunk, on `time` (wardlevels.ts).
  wards: WardState
  // The hotbar slot the hand holds (held.ts): picked with the number keys
  // or the wheel, used with the click. This page's alone; the account
  // keeps the bar, not where the hand is on it.
  selected: number
  // The tool in the hand as the loop last raised it (held.ts toolOf): the
  // flashlight, the slurm jar or a rod, or null for anything else.
  held: Tool | null
  // The left hand's lift: the flashlight up and on, or down and off; a
  // jar or a rod is held up for as long as it is in the hand.
  flashlight: Hand
  // The item the right hand last brought up, and when, on `time`.
  using: { kind: string; at: number } | null
  // The kind last used, which G in the valley passes (rule 27).
  lastUsed: string | null
  // The emote under way (emotes.ts), on performance.now() seconds; null
  // when none.
  emoting: Emoting | null
  // The static after geometrie shatters runs until this local ms
  // (performance.now). It is wall-clock, not `time`: `time` advances at
  // most CONFIG.render.maxStep a frame, so on a slow machine 1.6 s of it
  // can take half a minute, and the player would sit in static the whole
  // while.
  strikeUntil: number
  // Geometrie, the hit points (health.ts): the account's in the valley,
  // left and whole, as it last said.
  // After a touch nothing may touch again until graceUntil, and the view
  // shakes from hurtAt (both local ms, like strikeUntil).
  health: number
  healthMax: number
  graceUntil: number
  hurtAt: number
  started: boolean
  greeted: boolean
  // Times a shadowman's or the Caretaker's touch put this raider back at
  // the Citgo.
  strikes: number
  inventoryOpen: boolean
  // The Book of Shadows is open over the valley, with the pointer free for
  // it, as the pack's is.
  bookOpen: boolean
  // Gron's dialog, or the stand's, is open: the pointer is free for it,
  // and the game's keys, mouse look and menu overlay stand aside until it
  // closes.
  talking: boolean
  // What E would do right now; resolved every frame in the loop.
  interaction: Interaction<Pickup> | null
  // The last state frame sent to the valley, and seconds since.
  lastSent: PeerStateWire | null
  sinceSent: number
  // The shared world, once the valley has answered; null until then. It
  // stays as last said while the line is down, and nothing plays.
  world: WorldWire | null
  // The leg the truck is driving now, the valley's or our own, and what
  // the truck does for it (truckplan.ts).
  truckLeg: Leg | null
  truckPlan: TruckPlan | null
  // In the bed of the truck, whatever it is doing.
  aboard: boolean
  // The welcome has put us where the account last stood.
  placed: boolean
  // What lies dropped (sharedworld.ts rule 12), from every snapshot.
  drops: Drop[]
  // The shadowmen's tombstones (rule 17), from every snapshot.
  graves: Grave[]
  // Rule 18: the bodies lying in the valley, from every snapshot, and
  // which of them are this account's.
  corpses: CorpseWire[]
  myCorpses: number[]
  // Rule 19: what the account's locker holds, as the valley last sent it
  // (with this client's own moves applied in the meantime).
  // lockerOpen: the pack is open at the locker, with its Locker tab.
  stash: Inventory
  lockerOpen: boolean
  // Rule 31: the laptop's screen while this raider sits at it, for the
  // valley's answers; null otherwise.
  laptop: LaptopScreen | null
  // The raider's card open (inspect.ts), as the valley last sent it; null
  // while none is.
  inspected: InspectWire | null
  // Rule 34: the party as the valley last sent it (none at first).
  party: PartyWire
  // Rule 35: the crew and the invites waiting, as the valley last sent
  // them (none at first).
  crew: CrewState
  // Rule 23: the account's Cabbage Stand as the valley last sent it; null
  // before it has. And the last word on a change, for the stand's dialog.
  stand: StandLedger | null
  standSaid: string | null
  // Rule 33: the account's research as the valley last sent it (asked
  // for as the Recycling Center opens); null before it has. And the last
  // word on a level, for the dialog.
  research: Research | null
  researchSaid: string | null
  // Rule 36: the account's angler as the valley last sent it (asked for
  // as the tackle box opens); null before it has. The line in the water,
  // as cast (fishing.ts LineOut), and the last word on fishing.
  angler: AnglerWire | null
  line: LineOut | null
  fishSaid: string | null
  // The bait the rod casts with, picked at the tackle box; null for the
  // first one carried.
  bait: Bait | null
  // Inside a pond's firefly haven as last read; null before the welcome
  // has placed the raider.
  inFireflies: boolean | null
  // When the rod was last cast, on `time` (held.ts castPose); null once
  // the cast is over.
  castAt: number | null
  // The fish last landed, hoisted out of the water off the pond the
  // raider stands at (catchfanfare.ts hoistPose), and when, on `time`;
  // null once it is in the pack.
  hoist: { kind: string; at: number } | null
  // When the jar last scooped, on `time` (held.ts scoopPose); null once
  // the scoop is over.
  scoopAt: number | null
  // Rule 28: every Citgo the account has stood at, and the last, as the
  // valley last said (the welcome, then every citgos frame). The Citgo
  // portals, from every snapshot; the id of the one this raider opened, while it
  // stands; a portal asked of the valley and not yet answered; after
  // stepping through one or fast travelling, the local ms
  // (performance.now) before which no portal takes them; and whether the
  // map is open.
  citgos: CitgoLog
  portals: Portal[]
  myPortal: number | null
  pendingPortal: boolean
  portalGraceUntil: number
  mapOpen: boolean
  // Rule 37: the account's waypoints, as the valley last said (the
  // welcome, then every waypoints frame).
  waypoints: Waypoints
  // Rule 3: the map is open for us to pick where Marx drives (we were the
  // first one into the bed), and not yet picked.
  charting: boolean
  // Rule 25: a deal with Erwin not yet answered, his last word, and how
  // many times he has rambled at this raider.
  pendingDeal: boolean
  dealSaid: string | null
  rambled: number
  // The last trade with any trader, made a big deal of (tradefanfare.ts);
  // his window cheers it.
  tradeCheer: Fanfare | null
  // Rule 7: the last word on a buy, for the Citgo's trade window.
  shopSaid: string | null
  // Rule 26: where the account stands on each quest (null before the
  // valley says), and a step not yet answered.
  quests: Record<QuestId, QuestStage> | null
  pendingQuest: boolean
  // Shelf units asked of the valley and not yet answered, as station:kind.
  pendingBuys: Set<string>
  // The berry bushes as the valley last described them (the welcome, then
  // every daily frame); null before it has. The day's berries are the
  // valley's.
  daily: DailyWire | null
  // Lines that wait for the truck to roll: Matthew Marx walks from the
  // tailgate to his door first, and the truck holds until he is in.
  onTruckRolls: string[]
  // How many lines each NPC has said to this player.
  npcSaid: Record<NpcId, number>
}

export function createGameState(stations: number, hotbar: Hotbar): GameState {
  return {
    inventory: { ...STARTING_INVENTORY },
    cash: CONFIG.store.startingCash,
    cosmetics: [],
    pending: freshPending(),
    offeredBy: null,
    season: NO_PROGRESS,
    book: new Set(),
    known: new Set(),
    task: NO_TASK,
    friends: [],
    xp: 0,
    storeStock: freshStock(stations),
    hotbar,
    hotbarSaved: Promise.resolve(),
    time: 0,
    effects: NO_EFFECTS,
    wards: SOBER,
    selected: 0,
    held: null,
    flashlight: HAND_DOWN,
    using: null,
    lastUsed: null,
    strikeUntil: 0,
    health: BASE_GEOMETRIE,
    healthMax: BASE_GEOMETRIE,
    graceUntil: 0,
    hurtAt: -Infinity,
    emoting: null,
    started: false,
    greeted: false,
    strikes: 0,
    inventoryOpen: false,
    bookOpen: false,
    talking: false,
    interaction: null,
    lastSent: null,
    sinceSent: 0,
    world: null,
    truckLeg: null,
    truckPlan: null,
    aboard: false,
    placed: false,
    drops: [],
    graves: [],
    corpses: [],
    myCorpses: [],
    stash: {},
    lockerOpen: false,
    laptop: null,
    inspected: null,
    party: { members: [], invites: [] },
    crew: { crew: null, invites: [] },
    stand: null,
    standSaid: null,
    research: null,
    researchSaid: null,
    angler: null,
    line: null,
    fishSaid: null,
    bait: null,
    inFireflies: null,
    castAt: null,
    hoist: null,
    scoopAt: null,
    citgos: NO_CITGOS,
    portals: [],
    myPortal: null,
    pendingPortal: false,
    portalGraceUntil: 0,
    mapOpen: false,
    waypoints: NO_WAYPOINTS,
    charting: false,
    pendingDeal: false,
    dealSaid: null,
    rambled: 0,
    tradeCheer: null,
    shopSaid: null,
    quests: null,
    pendingQuest: false,
    pendingBuys: new Set(),
    daily: null,
    onTruckRolls: [],
    npcSaid: { marx: 0, carlsten: 0, moab: 0, tyler: 0 },
  }
}

// Everything boot() builds, and the state it shares.
export interface Game {
  state: GameState
  geo: Geo
  hud: Hud
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  sky: THREE.Object3D
  world: World
  // The drops' meshes, kept in step with state.drops.
  drops: DropMeshes
  // The tombstones, kept in step with state.graves.
  graves: Gravestones
  // The bodies, kept in step with state.corpses.
  corpses: CorpseMeshes
  // The Citgo portals, kept in step with the open ones of state.portals.
  portals: PortalMeshes
  // Rule 37: a pillar of light at each of state.waypoints.
  pillars: WaypointMeshes
  graph: RoadGraph
  truck: Truck
  // Marx's radio while the truck rolls (truckradiorig.ts), none under e2e.
  radio: TruckRadio | null
  // The clods and ruts his donuts leave (donutwakerig.ts), none without a
  // donut field.
  donutWake: DonutWake | null
  // The valley's music, none under e2e, which never plays sound, and the
  // settings that say how loud it plays.
  music: Music | null
  // The valley's sounds (sfxrig.ts), none under e2e either.
  sfx: Sfx | null
  settings: SettingsStore
  // The roads Matthew Marx drives (truckplan.ts): where he parks, the
  // joyride, his donuts for a seed; and what the valley is told of them.
  truckContext: TruckContext
  truckRoutes: TruckRoutes
  spawnStation: FuelPoint
  player: Player
  playerBody: PlayerBody
  // The hands in first person, and the flashlight's light.
  hands: FirstPersonHands
  // The line in the water over the view, while the rod fishes.
  fishHud: FishHud
  // The account and outfit from the titles; Gron changes them.
  pick: Titles
  // The phone, dialing Citgo portals (Q).
  phone: Phone
  shadowmen: ShadowBodies
  // The Caretaker in the corn maze.
  caretaker: CaretakerShade
  // The tunnel shades in the Undercroft.
  tunnel: TunnelShades
  // Shadowmen bursting in the beam.
  bursts: ShadowBursts
  // What a trip shows this raider that is not there (hallucinationrig.ts):
  // this client's alone, never sent or kept.
  hallucinations: Hallucinations
  mist: MistCards
  glow: Glow
  // The view through the wards and the blur of a use (trails.ts).
  trails: Trails
  // What a trip shows that is not there: platonic solids round the eye
  // (tripsolidsrig.ts) and constellations between the stars
  // (constellationrig.ts).
  solids: TripSolids
  constellations: Constellations
  // The items as the pack grid and the hotbar draw them.
  thumbs: ItemThumbs
  peers: Peers
  net: NetClient
}
