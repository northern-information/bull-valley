// window.__bv: the dev-only introspection hook the e2e specs read the game
// through. boot() installs it last, after the input listeners, and only in
// dev builds, so production bundles never carry it.

import { unitToWorld } from './coords.ts'
import { hurry } from './marx.ts'
import type { Actions } from './actions.ts'
import type { CaretakerShade } from './caretakerrig.ts'
import type { ChatLine } from './chat.ts'
import type { Drop } from './drops.ts'
import type { Game } from './game.ts'
import type { Hand } from './hands.ts'
import type { Hotbar } from './hotbar.ts'
import type { Inventory } from './interfaces.ts'
import type { TruckState } from './marx.ts'
import type { MistCards } from './mistcards.ts'
import type { NetStatus } from './net.ts'
import type { Player } from './player.ts'
import type { Peer } from './presence.ts'
import type { DailyWire, PeerStateWire, WorldWire } from './protocol.ts'
import type { RoadGraph } from './roadgraph.ts'
import type { ShadowCards } from './shadowcards.ts'
import type { Truck } from './truck.ts'
import type { World } from './world.ts'
import type * as THREE from 'three'

interface BvHook {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  player: Player
  world: World
  truck: Truck
  graph: RoadGraph
  shadowmen: ShadowCards
  caretaker: CaretakerShade
  mist: MistCards
  // Times a touch put this raider back at the Citgo.
  readonly strikes: number
  net: {
    readonly status: NetStatus
    readonly id: string | null
    peers(): Peer[]
  }
  // The shared world as the valley last sent it; null offline.
  readonly valley: WorldWire | null
  // Matthew Marx's truck: the valley's, or this client's own alone.
  readonly marx: TruckState
  // The berry bushes as the valley last described them; null offline.
  readonly daily: DailyWire | null
  readonly aboard: boolean
  // What the glow rings right now (glow.ts); null for nothing.
  readonly glow: THREE.Object3D | null
  // In cents.
  readonly cash: number
  // The pack as this client holds it: the valley's last word, plus guesses.
  readonly inventory: Inventory
  // What lies dropped: the valley's, or this raider's alone.
  readonly drops: readonly Drop[]
  // The item on each number key, slot 0 for 1.
  readonly hotbar: Hotbar
  // The chat log, oldest first.
  readonly chat: readonly ChatLine[]
  // The flashlight in the left hand, and the item the right last raised.
  readonly flashlight: Hand
  // The last state frame sent to the valley: where it last heard we are.
  readonly sent: PeerStateWire | null
  readonly using: { kind: string; at: number } | null
  teleport(u: number, v: number): void
  // The left button, for a page without pointer lock.
  toggleFlashlight(): void
  // A shadowman standing still at world (x, z): the valley's, through a
  // dev frame, or this client's own, played alone.
  placeShadowman(x: number, z: number): void
  // The Caretaker moved to world (x, z), formed, its hunt forgotten,
  // floating still until it has someone to hunt: the valley's, through a
  // dev frame, or this client's own, played alone.
  placeCaretaker(x: number, z: number): void
  hurryTruck(seconds?: number): void
  // A quiet valley: no crossing shadowman rushes anyone, only one a spec
  // places. The valley's, through a dev frame, or this client's own.
  calm(): void
}

declare global {
  interface Window {
    __bv?: BvHook
  }
}

export function installDevHook(game: Game, actions: Actions): void {
  const { state: s, net, peers, hud, glow, player } = game
  window.__bv = {
    scene: game.scene,
    camera: game.camera,
    renderer: game.renderer,
    player,
    world: game.world,
    truck: game.truck,
    graph: game.graph,
    shadowmen: game.shadowmen,
    caretaker: game.caretaker,
    mist: game.mist,
    get strikes() {
      return s.strikes
    },
    net: {
      get status() {
        return net.status
      },
      get id() {
        return net.id
      },
      peers: () => peers.list(),
    },
    get valley() {
      return s.world
    },
    get marx() {
      return s.world?.truck ?? s.aloneTruck
    },
    get daily() {
      return s.daily
    },
    get aboard() {
      return s.aboard
    },
    get glow() {
      return glow.target
    },
    get cash() {
      return s.cash
    },
    get inventory() {
      return s.inventory
    },
    get drops() {
      return s.drops
    },
    get hotbar() {
      return s.hotbar
    },
    get chat() {
      return hud.chatLines
    },
    get flashlight() {
      return s.flashlight
    },
    get sent() {
      return s.lastSent
    },
    get using() {
      return s.using
    },
    teleport(u: number, v: number) {
      const { x, z } = unitToWorld(u, v, game.geo.metres)
      player.relocate(x, z)
    },
    toggleFlashlight: () => actions.toggleFlashlight(),
    placeShadowman(x: number, z: number) {
      if (net.online) net.send({ type: 'dev', op: 'shadowman', x, z })
      else game.shadowmen.place(x, z)
    },
    placeCaretaker(x: number, z: number) {
      if (net.online) net.send({ type: 'dev', op: 'caretaker', x, z })
      else game.caretaker.place(x, z)
    },
    calm() {
      if (net.online) net.send({ type: 'dev', op: 'calm' })
      else game.shadowmen.calm = true
    },
    hurryTruck(seconds = 5) {
      // In the shared valley the server keeps Marx's day; a dev server
      // lets a spec bring his next change closer.
      if (s.world) net.send({ type: 'dev', op: 'hurry', seconds })
      else {
        actions.setAloneTruck(
          hurry(s.aloneTruck, Date.now(), seconds, game.truckRoutes)
        )
      }
    },
  }
}
