// What the player is aimed at and what shows it: the store they stand in,
// the shelf unit in view, the NPCs in reach, what the glow rings for an
// interaction (glow.ts), and where an item's label floats. Three glue over
// the pure resolver in interactions.ts.

import * as THREE from 'three'
import { meshBounds } from './assets.ts'
import { itemById } from './items.ts'
import { insideStore, unitInView } from './store.ts'
import { crawlingSlurms } from './world.ts'
import type { Game } from './game.ts'
import type {
  Interaction,
  LockerSpot,
  ShelfSpot,
  View,
} from './interactions.ts'
import type { Vec3 } from './interfaces.ts'
import type { NpcSpot } from './npcs.ts'
import type { Pickup } from './world.ts'

// How far over the top of an item its label sits, in metres.
const LABEL_LIFT = 0.03
// How far over its base a pickup is aimed at: about its middle.
const PICKUP_MIDDLE = 0.08

export interface Targets {
  // The store the player stands inside, as an index into world.fuelPoints,
  // or -1 outside every one.
  storeIndex(): number
  // The shelf unit in view inside store `station`, for the resolver.
  shelfInView(station: number): ShelfSpot | null
  // Marx while his truck stands still, Carlsten in store `station`, every
  // Moab, Tyler and Jericho, for the resolver to weigh by distance.
  npcSpots(station: number): NpcSpot[]
  // What the eye sees, for the resolver: where it is, where it looks, the
  // feet's height, the ground under any point, and each pickup's middle.
  view(): View<Pickup>
  // The lockers in store `station`'s back room, for the resolver; none
  // outside every store.
  lockerSpots(station: number): LockerSpot[]
  // The laptop in store `station`'s bathroom, the same way.
  laptopSpots(station: number): LockerSpot[]
  // What the glow rings for an interaction: the pickup, the shelf unit a
  // buy would take, a bush while today's berry is on it, Gron, or Marx,
  // Carlsten, Moab, Tyler or Jericho when E would talk to him, your body, the lockers,
  // the laptop, the Cabbage Stand. Nothing for the truck.
  glowTarget(action: Interaction<Pickup> | null): THREE.Object3D | null
  // What an item's label floats over: the pickup, the shelf unit a buy
  // would take, or a bush, picked or not. Null for anything else.
  labelTarget(action: Interaction<Pickup> | null): THREE.Object3D | null
  // Where the label sits: just over the top of the item's meshes (its
  // halo would lift it into the air), in the view's 0..1 across and down.
  // Null when the point is behind the camera.
  labelAt(target: THREE.Object3D): { x: number; y: number } | null
}

export function createTargets(game: Game): Targets {
  const { camera, world, truck, player, state } = game
  const look = new THREE.Vector3()
  const labelPoint = new THREE.Vector3()
  const pickupPoint = new THREE.Vector3()
  const heightOf = (pickup: Pickup) =>
    pickup.mesh.getWorldPosition(pickupPoint).y + PICKUP_MIDDLE
  const bushObject = (id: number) =>
    world.bushes.find((b) => b.id === id)?.object ?? null

  const glowTarget = (
    action: Interaction<Pickup> | null
  ): THREE.Object3D | null => {
    switch (action?.kind) {
      case 'pickup':
        return action.pickup.mesh
      case 'buy':
        return world.shelves.unitFor(action.station, action.item, action.unit)
      case 'collect':
        return action.status === 'ready' ? bushObject(action.bush) : null
      case 'talk':
        return world.gronRig?.figure.group ?? null
      case 'trade':
        return world.moabRigs[action.station]?.figure.group ?? null
      case 'loot':
        return game.corpses.objectOf(action.corpse)
      case 'locker':
        return world.shelves.lockers
      case 'laptop':
        return world.shelves.laptop
      case 'stand':
        return world.stand?.group ?? null
      case 'recycle':
        return world.wreck?.car ?? null
      case 'jar-slurm':
        return (
          crawlingSlurms(world).find(
            (s) =>
              s.station === action.station &&
              s.slot === action.slot &&
              s.index === action.index
          )?.object ?? null
        )
      case 'deal':
        return world.plaza?.dealer.group ?? null
      case 'locked':
        return world.plaza?.door ?? null
      case 'lay':
        return world.portal?.rig.group ?? null
      // What is not there glows as the real one would.
      case 'hallucination':
        return game.hallucinations.objectOf(action.id)
      case 'speak':
        switch (action.npc) {
          case 'marx':
            return truck.driver.group
          case 'carlsten':
            return world.shelves.clerk
          case 'moab':
            return action.station === undefined
              ? null
              : (world.moabRigs[action.station]?.figure.group ?? null)
          case 'tyler':
            return world.tylerRig?.figure.group ?? null
          case 'jericho':
            return world.jerichoRig?.body ?? null
        }
        break
      default:
        return null
    }
  }

  return {
    storeIndex: () =>
      world.fuelPoints.findIndex((station) =>
        insideStore(station, player.pos.x, player.pos.z)
      ),

    shelfInView(station) {
      if (station < 0) return null
      camera.getWorldDirection(look)
      const eye: Vec3 = [
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ]
      const stock = state.storeStock[station]
      const seen = unitInView(
        world.facings[station],
        stock,
        eye,
        [look.x, look.y, look.z],
        world.walls.between
      )
      const item = seen ? itemById(seen.facing.kind) : null
      if (!seen || !item || item.price === undefined) return null
      return {
        item: item.id,
        station,
        unit: seen.unit,
        price: item.price,
        affordable: state.cash >= item.price,
      }
    },

    view() {
      camera.getWorldDirection(look)
      return {
        eye: [camera.position.x, camera.position.y, camera.position.z],
        dir: [look.x, look.y, look.z],
        feet: player.groundY,
        groundAt: world.ground.at,
        heightOf,
      }
    },

    npcSpots(station) {
      const spots: NpcSpot[] = []
      const marx = truck.driverAt()
      if (marx) spots.push({ id: 'marx', ...marx })
      // Out on the lot after the slurms, there is no one behind the
      // counter to talk to (slurms.ts).
      const carlsten = world.clerks[station]
      if (carlsten && !world.shelves.clerkAway(station)) {
        spots.push({ id: 'carlsten', ...carlsten, station })
      }
      // A Moab under every station's sign.
      world.moabs.forEach((moab, i) => {
        spots.push({ id: 'moab', ...moab, station: i })
      })
      // Tyler, in the back of his Jeep by the spawn Citgo's Moab.
      if (world.tyler) spots.push({ id: 'tyler', ...world.tyler })
      // Jericho, by the payphone on Castle Entropy's rim.
      if (world.jericho) spots.push({ id: 'jericho', ...world.jericho })
      return spots
    },

    lockerSpots(station) {
      const spot = world.lockers[station]
      return station >= 0 && spot ? [{ ...spot, station }] : []
    },

    laptopSpots(station) {
      const spot = world.laptops[station]
      return station >= 0 && spot ? [{ ...spot, station }] : []
    },

    glowTarget,

    labelTarget(action) {
      switch (action?.kind) {
        case 'pickup':
        case 'buy':
          return glowTarget(action)
        case 'collect':
          return bushObject(action.bush)
        case 'hallucination':
          return action.item === undefined ? null : glowTarget(action)
        default:
          return null
      }
    },

    labelAt(target) {
      const box = meshBounds(target)
      if (box.isEmpty()) return null
      box.getCenter(labelPoint)
      labelPoint.y = box.max.y + LABEL_LIFT
      labelPoint.project(camera)
      if (labelPoint.z > 1) return null
      return { x: (labelPoint.x + 1) / 2, y: (1 - labelPoint.y) / 2 }
    },
  }
}
