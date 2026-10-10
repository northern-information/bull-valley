// The valley in the browser: the systems boot() builds (Game) and the
// state they share and change (GameState). boot() makes one of each; actions.ts,
// valleysync.ts, input.ts, targets.ts and loop.ts each take the Game.

import { CONFIG } from './config.ts'
import { NO_TASK } from './dailytask.ts'
import { SOBER } from './geometrie.ts'
import { HAND_DOWN } from './hands.ts'
import { NO_EFFECTS } from './hotbar.ts'
import { STARTING_INVENTORY } from './inventory.ts'
import { createTruck } from './marx.ts'
import { NO_PROGRESS } from './season.ts'
import { freshStock } from './store.ts'
import type { CaretakerShade } from './caretakerrig.ts'
import type { CorpseMeshes } from './corpsemeshes.ts'
import type { Corpse, CorpseWire } from './corpses.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { TaskProgress } from './dailytask.ts'
import type { DropMeshes } from './dropmeshes.ts'
import type { Drop } from './drops.ts'
import type { Emoting } from './emotes.ts'
import type { FirstPersonHands } from './fphands.ts'
import type { PendingAsk } from './friends.ts'
import type { Geometrie } from './geometrie.ts'
import type { Glow } from './glow.ts'
import type { Grave } from './graves.ts'
import type { Gravestones } from './gravestones.ts'
import type { Hand } from './hands.ts'
import type { Effects, Hotbar } from './hotbar.ts'
import type { Hud } from './hud.ts'
import type { Interaction } from './interactions.ts'
import type { Geo, Inventory, ShopStock } from './interfaces.ts'
import type { ItemThumbs } from './itemthumbs.ts'
import type { Leg, TruckRoutes, TruckState } from './marx.ts'
import type { MistCards } from './mistcards.ts'
import type { Music } from './musicrig.ts'
import type { NetClient } from './net.ts'
import type { NpcId } from './npcs.ts'
import type { Peers } from './peers.ts'
import type { Player } from './player.ts'
import type { PlayerBody } from './playerbody.ts'
import type {
  DailyWire,
  FriendWire,
  PeerStateWire,
  WorldWire,
} from './protocol.ts'
import type { QuestId, QuestStage } from './quests.ts'
import type { RoadGraph } from './roadgraph.ts'
import type { Scope } from './scope.ts'
import type { SeasonProgress } from './season.ts'
import type { SettingsStore } from './settingsui.ts'
import type { ShadowBursts } from './shadowburst.ts'
import type { ShadowCards } from './shadowcards.ts'
import type { StandLedger } from './stand.ts'
import type { Titles } from './titles.ts'
import type { Trails } from './trails.ts'
import type { Truck } from './truck.ts'
import type { TruckContext, TruckPlan } from './truckplan.ts'
import type { FuelPoint, Pickup, World } from './world.ts'
import type * as THREE from 'three'

export interface GameState {
  // The account's pack as the valley last sent it (the welcome, then every
  // pack frame), with this client's own changes applied in the meantime.
  // Alone, the starting pack, and nothing is kept.
  inventory: Inventory
  // The account's wallet in cents, as the valley last sent it (with this
  // client's own spending applied in the meantime); alone, a fresh one,
  // and nothing is kept.
  cash: number
  // What the account wears (cosmetics.ts), as the valley last sent it;
  // alone, nothing, and nothing is kept.
  cosmetics: CosmeticId[]
  // A trade asked of Moab and not yet answered.
  pendingTrade: boolean
  // The station whose Moab last made this raider his offer, while they
  // stay in his reach; null otherwise. He says it once each time.
  offeredBy: number | null
  // The account's progress through the season (season.ts) as the valley
  // last sent it; alone, none, and nothing is kept.
  season: SeasonProgress
  // The Book of Shadows entries the account has found (book.ts), as the
  // valley last said (the welcome, then every book frame); alone, what this
  // client has come across, and nothing is kept. Entries asked of the
  // valley and not yet answered.
  book: Set<string>
  bookAsked: Set<string>
  // The account's progress on the daily task (dailytask.ts) as the valley
  // last sent it, on the day it counts; alone, none, and nothing is kept.
  task: TaskProgress
  // Rule 20: the account's friends list as the valley last sent it; a
  // /friend or /unfriend waiting on it; whether a /friends is waiting to
  // be shown; and who the last whisper went to, for a refusal's line.
  friends: FriendWire[]
  pendingAsk: PendingAsk | null
  showFriends: boolean
  whisperTo: string | null
  // The account's XP in all (progression.ts) as the valley last sent it;
  // alone, none, and nothing is kept.
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
  // How high, stimulated and drunk, on `time` (geometrie.ts).
  geometrie: Geometrie
  // The flashlight in the left hand: up and on, or down and off.
  flashlight: Hand
  // The item the right hand last brought up, and when, on `time`.
  using: { kind: string; at: number } | null
  // The static after a shadowman's touch runs until this local ms
  // (performance.now). It is wall-clock, not `time`: `time` advances at
  // most CONFIG.render.maxStep a frame, so on a slow machine 1.6 s of it
  // can take half a minute, and the player would sit in static the whole
  // while.
  // The emote under way (emotes.ts), on performance.now() seconds; null
  // when none.
  emoting: Emoting | null
  strikeUntil: number
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
  // and the game's keys, mouse look and pause screen stand aside until it
  // closes.
  talking: boolean
  // What E would do right now; resolved every frame in the loop.
  interaction: Interaction<Pickup> | null
  // The last state frame sent to the valley, and seconds since.
  lastSent: PeerStateWire | null
  sinceSent: number
  // The shared world, once the valley has answered. Null offline, where
  // the valley is this player's alone.
  world: WorldWire | null
  // Played alone, Matthew Marx's truck this client keeps (marx.ts).
  aloneTruck: TruckState
  // The leg the truck is driving now, the valley's or our own, and what
  // the truck does for it (truckplan.ts).
  truckLeg: Leg | null
  truckPlan: TruckPlan | null
  // In the bed of the truck, whatever it is doing; and asked of the valley
  // and not yet answered.
  aboard: boolean
  pendingBoard: boolean
  // The welcome has put us where the account last stood.
  placed: boolean
  // Pickups asked of the valley and not yet answered.
  pendingTakes: Set<number>
  // What lies dropped (sharedworld.ts rule 12): the valley's, from every
  // snapshot, or this raider's own when played alone, numbered from
  // nextDrop. Drops asked of the valley and not yet answered, by id.
  drops: Drop[]
  nextDrop: number
  pendingDrops: Set<number>
  // The shadowmen's tombstones (rule 17): the valley's, from every
  // snapshot, or this raider's own when played alone, numbered from
  // nextGrave.
  graves: Grave[]
  nextGrave: number
  // Rule 18: the bodies lying in the valley, the valley's from every
  // snapshot, or this raider's own when played alone (aloneCorpses, with
  // what each holds, numbered from nextCorpse); which of them are this
  // account's; and those asked of the valley and not yet answered.
  corpses: CorpseWire[]
  myCorpses: number[]
  aloneCorpses: Corpse[]
  nextCorpse: number
  pendingLoots: Set<number>
  // Rule 19: what the account's locker holds, as the valley last sent it
  // (with this client's own moves applied in the meantime); alone, nothing.
  // lockerOpen: the pack is open at the locker, with its Locker tab.
  stash: Inventory
  lockerOpen: boolean
  // Rule 23: the account's Cabbage Stand as the valley last sent it; null
  // alone, where there is none. A change asked of the valley and not yet
  // answered, and the last word on one, for the stand's dialog.
  stand: StandLedger | null
  pendingStand: boolean
  standSaid: string | null
  // Rule 24: a deal with Erwin not yet answered, his last word, and how
  // many times he has rambled at this raider.
  pendingDeal: boolean
  dealSaid: string | null
  rambled: number
  // Rule 25: where the account stands on each quest (null before the
  // valley says, or played alone), and a step not yet answered.
  quests: Record<QuestId, QuestStage> | null
  pendingQuest: boolean
  // Shelf units asked of the valley and not yet answered, as station:kind.
  pendingBuys: Set<string>
  // The berry bushes as the valley last described them (the welcome, then
  // every daily frame); null offline. The day's berries are the valley's.
  daily: DailyWire | null
  // A berry asked of the valley and not yet answered.
  pendingCollect: boolean
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
    pendingTrade: false,
    offeredBy: null,
    season: NO_PROGRESS,
    book: new Set(),
    bookAsked: new Set(),
    task: NO_TASK,
    friends: [],
    pendingAsk: null,
    showFriends: false,
    whisperTo: null,
    xp: 0,
    storeStock: freshStock(stations),
    hotbar,
    hotbarSaved: Promise.resolve(),
    time: 0,
    effects: NO_EFFECTS,
    geometrie: SOBER,
    flashlight: HAND_DOWN,
    using: null,
    strikeUntil: 0,
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
    aloneTruck: createTruck(Date.now()),
    truckLeg: null,
    truckPlan: null,
    aboard: false,
    pendingBoard: false,
    placed: false,
    pendingTakes: new Set(),
    drops: [],
    nextDrop: 0,
    pendingDrops: new Set(),
    graves: [],
    nextGrave: 0,
    corpses: [],
    myCorpses: [],
    aloneCorpses: [],
    nextCorpse: 0,
    pendingLoots: new Set(),
    stash: {},
    lockerOpen: false,
    stand: null,
    pendingStand: false,
    standSaid: null,
    pendingDeal: false,
    dealSaid: null,
    rambled: 0,
    quests: null,
    pendingQuest: false,
    pendingBuys: new Set(),
    daily: null,
    pendingCollect: false,
    onTruckRolls: [],
    npcSaid: { marx: 0, carlsten: 0, moab: 0 },
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
  graph: RoadGraph
  truck: Truck
  // The valley's music, none under e2e, which never plays sound, and the
  // settings that say how loud it plays.
  music: Music | null
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
  // The account and outfit from the titles; Gron changes them.
  pick: Titles
  scope: Scope
  shadowmen: ShadowCards
  // The Caretaker in the corn maze.
  caretaker: CaretakerShade
  // Shadowmen bursting in the beam.
  bursts: ShadowBursts
  mist: MistCards
  glow: Glow
  // The view on a trip: the blur and the trails (trails.ts).
  trails: Trails
  // The items as the pack grid and the hotbar draw them.
  thumbs: ItemThumbs
  peers: Peers
  net: NetClient
}
