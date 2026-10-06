// One raid in the browser: the systems boot() builds (Game) and the state
// they share and change (GameState). boot() makes one of each; actions.ts,
// valleysync.ts, input.ts, targets.ts and loop.ts each take the Game.

import { CONFIG } from './config.ts'
import { NO_EFFECTS } from './hotbar.ts'
import { STARTING_INVENTORY } from './inventory.ts'
import { createRaid } from './raid.ts'
import { freshStock } from './store.ts'
import type { Glow } from './glow.ts'
import type { Effects, Hotbar } from './hotbar.ts'
import type { Hud } from './hud.ts'
import type { Interaction } from './interactions.ts'
import type { Geo, Inventory, Raid, ShopStock } from './interfaces.ts'
import type { ItemThumbs } from './itemthumbs.ts'
import type { MistCards } from './mistcards.ts'
import type { NetClient } from './net.ts'
import type { NpcId } from './npcs.ts'
import type { Peers } from './peers.ts'
import type { Player } from './player.ts'
import type { PlayerBody } from './playerbody.ts'
import type { DailyWire, PeerStateWire, RaidWire } from './protocol.ts'
import type { RoadGraph, Route } from './roadgraph.ts'
import type { Scope } from './scope.ts'
import type { ShadowCards } from './shadowcards.ts'
import type { Titles } from './titles.ts'
import type { Truck } from './truck.ts'
import type { FuelPoint, LandmarkPoint, Pickup, World } from './world.ts'
import type * as THREE from 'three'

export interface GameState {
  // The account's pack as the valley last sent it (the welcome, then every
  // pack frame), with this client's own changes applied in the meantime.
  // Alone, the starting pack, and nothing is kept.
  inventory: Inventory
  raid: Raid
  // Seconds since the raid began; never pauses.
  raidClock: number
  // The account's wallet in cents, as the valley last sent it (with this
  // client's own spending applied in the meantime); alone, a fresh one,
  // and nothing is kept.
  cash: number
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
  // The static after a shadowman's touch runs until this local ms
  // (performance.now). It is wall-clock, not `time`: `time` advances at
  // most CONFIG.render.maxStep a frame, so on a slow machine 1.6 s of it
  // can take half a minute, and the player would sit in static the whole
  // while.
  strikeUntil: number
  started: boolean
  greeted: boolean
  ended: boolean
  inventoryOpen: boolean
  // Gron's dialog is open: the pointer is free for it, and the game's
  // keys, mouse look and pause screen stand aside until it closes.
  talking: boolean
  // What E would do right now; resolved every frame in the loop.
  interaction: Interaction<Pickup> | null
  // The last state frame sent to the valley, and seconds since.
  lastSent: PeerStateWire | null
  sinceSent: number
  // The shared raid, once the valley has answered. Null offline, where the
  // raid is this player's alone.
  shared: RaidWire | null
  // Standing in the bed during the lobby, waiting on the others.
  aboard: boolean
  // Pickups asked of the valley and not yet answered.
  pendingTakes: Set<number>
  // Shelf units asked of the valley and not yet answered, as station:kind.
  pendingBuys: Set<string>
  // The berry bush as the valley last described it (the welcome, then
  // every daily frame); null offline. The day's berry is the valley's.
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
    raid: createRaid(0),
    raidClock: 0,
    cash: CONFIG.store.startingCash,
    storeStock: freshStock(stations),
    hotbar,
    hotbarSaved: Promise.resolve(),
    time: 0,
    effects: NO_EFFECTS,
    strikeUntil: 0,
    started: false,
    greeted: false,
    ended: false,
    inventoryOpen: false,
    talking: false,
    interaction: null,
    lastSent: null,
    sinceSent: 0,
    shared: null,
    aboard: false,
    pendingTakes: new Set(),
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
  graph: RoadGraph
  truck: Truck
  // The joyride the truck leaves on, from the spawn station.
  departRoute: Route
  spawnStation: FuelPoint
  // The cabbage stand and Mt. Coleman's Keep, if the survey has them.
  stand: LandmarkPoint | null
  keep: LandmarkPoint | null
  player: Player
  playerBody: PlayerBody
  // The account and outfit from the titles; Gron changes them.
  pick: Titles
  scope: Scope
  shadowmen: ShadowCards
  mist: MistCards
  glow: Glow
  // The items as the pack grid and the hotbar draw them.
  thumbs: ItemThumbs
  peers: Peers
  net: NetClient
  // prefers-reduced-motion: Gron's rain and Moab's fire hold still.
  still: boolean
}
