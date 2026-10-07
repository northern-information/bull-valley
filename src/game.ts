// The valley in the browser: the systems boot() builds (Game) and the
// state they share and change (GameState). boot() makes one of each; actions.ts,
// valleysync.ts, input.ts, targets.ts and loop.ts each take the Game.

import { CONFIG } from './config.ts'
import { SOBER } from './geometrie.ts'
import { HAND_DOWN } from './hands.ts'
import { NO_EFFECTS } from './hotbar.ts'
import { STARTING_INVENTORY } from './inventory.ts'
import { createTruck } from './marx.ts'
import { freshStock } from './store.ts'
import type { CaretakerShade } from './caretakerrig.ts'
import type { DropMeshes } from './dropmeshes.ts'
import type { Drop } from './drops.ts'
import type { FirstPersonHands } from './fphands.ts'
import type { Geometrie } from './geometrie.ts'
import type { Glow } from './glow.ts'
import type { Hand } from './hands.ts'
import type { Effects, Hotbar } from './hotbar.ts'
import type { Hud } from './hud.ts'
import type { Interaction } from './interactions.ts'
import type { Geo, Inventory, ShopStock } from './interfaces.ts'
import type { ItemThumbs } from './itemthumbs.ts'
import type { Leg, TruckRoutes, TruckState } from './marx.ts'
import type { MistCards } from './mistcards.ts'
import type { NetClient } from './net.ts'
import type { NpcId } from './npcs.ts'
import type { Peers } from './peers.ts'
import type { Player } from './player.ts'
import type { PlayerBody } from './playerbody.ts'
import type { DailyWire, PeerStateWire, WorldWire } from './protocol.ts'
import type { RoadGraph } from './roadgraph.ts'
import type { Scope } from './scope.ts'
import type { ShadowBursts } from './shadowburst.ts'
import type { ShadowCards } from './shadowcards.ts'
import type { Titles } from './titles.ts'
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
  strikeUntil: number
  started: boolean
  greeted: boolean
  // Times a shadowman's or the Caretaker's touch put this raider back at
  // the Citgo.
  strikes: number
  inventoryOpen: boolean
  // Gron's dialog is open: the pointer is free for it, and the game's
  // keys, mouse look and pause screen stand aside until it closes.
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
    storeStock: freshStock(stations),
    hotbar,
    hotbarSaved: Promise.resolve(),
    time: 0,
    effects: NO_EFFECTS,
    geometrie: SOBER,
    flashlight: HAND_DOWN,
    using: null,
    strikeUntil: 0,
    started: false,
    greeted: false,
    strikes: 0,
    inventoryOpen: false,
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
  graph: RoadGraph
  truck: Truck
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
  // The items as the pack grid and the hotbar draw them.
  thumbs: ItemThumbs
  peers: Peers
  net: NetClient
  // prefers-reduced-motion: Gron's rain and Moab's fire hold still.
  still: boolean
}
