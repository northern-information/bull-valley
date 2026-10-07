// What the player is aimed at and what shows it: the store they stand in,
// the shelf unit in view, the NPCs in reach, what the glow rings for an
// interaction (glow.ts), and where an item's label floats. Three glue over
// the pure resolver in interactions.ts.

import * as THREE from 'three'
import { meshBounds } from './assets.ts'
import { itemById } from './items.ts'
import { insideStore, unitInView } from './store.ts'
import type { Game } from './game.ts'
import type { Interaction, ShelfSpot } from './interactions.ts'
import type { Vec3 } from './interfaces.ts'
import type { NpcSpot } from './npcs.ts'
import type { Pickup } from './world.ts'

// How far over the top of an item its label sits, in metres.
const LABEL_LIFT = 0.03

export interface Targets {
  // The store the player stands inside, as an index into world.fuelPoints,
  // or -1 outside every one.
  storeIndex(): number
  // The shelf unit in view inside store `station`, for the resolver.
  shelfInView(station: number): ShelfSpot | null
  // Marx while his truck stands still, Carlsten in store `station`, and
  // every Moab, for the resolver to weigh by distance.
  npcSpots(station: number): NpcSpot[]
  // What the glow rings for an interaction: the pickup, the shelf unit a
  // buy would take, a bush while today's berry is on it, Gron, or Marx,
  // Carlsten or Moab when E would talk to him. Nothing for the truck or the
  // stand.
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
      const seen = unitInView(world.facings[station], stock, eye, [
        look.x,
        look.y,
        look.z,
      ])
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

    npcSpots(station) {
      const spots: NpcSpot[] = []
      const marx = truck.driverAt()
      if (marx) spots.push({ id: 'marx', ...marx })
      const carlsten = world.clerks[station]
      if (carlsten) spots.push({ id: 'carlsten', ...carlsten })
      // A Moab under every station's sign.
      world.moabs.forEach((moab, i) => {
        spots.push({ id: 'moab', ...moab, station: i })
      })
      return spots
    },

    glowTarget,

    labelTarget(action) {
      switch (action?.kind) {
        case 'pickup':
        case 'buy':
          return glowTarget(action)
        case 'collect':
          return bushObject(action.bush)
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
