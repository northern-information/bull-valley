// The topiaries in the world (topiaries.ts): the hedge animals drawn
// (topiarymodel.ts) on `ground.at`, each turned broadside across its
// corridor, and every spot's corridor stood on the walls as a gate
// (walls.ts addGate) that holds while an animal stands there. Each frame
// the valley's clock says where each should be, and an animal goes there
// only while this raider sees neither end (topiaries.ts mayMove): in view
// of the camera, within sight, and with no corn between, unless the raider
// is up the lookout, over the corn. Where it lands within earshot it
// rustles.

import * as THREE from 'three'
import { castShadows } from './assetkit.ts'
import { CONFIG } from './config.ts'
import {
  dealSpots,
  mayMove,
  spotOfGate,
  TOPIARIES,
  topiariesAt,
  topiaryGate,
  topiarySpots,
} from './topiaries.ts'
import { buildTopiary } from './topiarymodel.ts'
import type { MazeFrame } from './cornmaze.ts'
import type { Ground } from './ground.ts'
import type { XZ } from './interfaces.ts'
import type { Cue } from './sfx.ts'
import type { TopiarySpot, TopiaryStand } from './topiaries.ts'
import type { Walls } from './walls.ts'

// What the raider sees with this frame.
export interface TopiaryView {
  camera: THREE.Camera
  eye: XZ
  // Up the lookout: the corn hides nothing.
  overCorn: boolean
  // Whether the corn stands between two points (walls.ts between).
  blocked: (from: XZ, to: XZ) => boolean
}

export interface TopiaryRig {
  group: THREE.Group
  // Whether an animal stands in a gate's spot: the gate holds.
  stands(gate: string): boolean
  // Where each stands as this raider sees it, for the dev hook.
  shown(): (TopiaryStand | null)[]
  // Stepped on the valley's clock (seconds); what it sounds like.
  update(seconds: number, view: TopiaryView): Cue[]
}

// Seen within this much of a spot's middle, and this high over its ground.
const SEEN_RADIUS = 2.4
const SEEN_HEIGHT = 1.4

export function placeTopiaries(
  frame: MazeFrame,
  ground: Ground,
  walls: Walls
): TopiaryRig {
  const cfg = CONFIG.topiaries
  const spots = topiarySpots()
  const pools = dealSpots(spots)
  const world = (p: XZ) => frame.toWorld(p.x, p.z)
  for (const spot of spots) {
    walls.addGate(world(spot.a), world(spot.b), cfg.gateHalf, topiaryGate(spot))
  }
  // The world way of maze-local +x, away from the road; a Three yaw turns
  // local +X to (cos, -sin).
  const o = frame.toWorld(0, 0)
  const ax = frame.toWorld(1, 0)
  const awayYaw = Math.atan2(-(ax.z - o.z), ax.x - o.x)

  const group = new THREE.Group()
  group.name = 'topiaries'
  const bodies = TOPIARIES.map((kind, i) => {
    const body = buildTopiary(kind, cfg.length, 0x70b + i)
    castShadows(body)
    body.visible = false
    group.add(body)
    return body
  })
  const shown: (TopiaryStand | null)[] = TOPIARIES.map(() => null)
  const standing = new Set<number>()

  const frustum = new THREE.Frustum()
  const matrix = new THREE.Matrix4()
  const sphere = new THREE.Sphere()

  return {
    group,
    stands: (gate) => {
      const id = spotOfGate(gate)
      return id !== null && standing.has(id)
    },
    shown: () => [...shown],
    update(seconds, view) {
      const { camera, eye } = view
      camera.updateMatrixWorld()
      matrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      )
      frustum.setFromProjectionMatrix(matrix)
      const sees = (spot: TopiarySpot) => {
        const at = world(spot)
        if (Math.hypot(at.x - eye.x, at.z - eye.z) > cfg.sightRange) {
          return false
        }
        sphere.center.set(at.x, ground.at(at.x, at.z) + SEEN_HEIGHT, at.z)
        sphere.radius = SEEN_RADIUS
        if (!frustum.intersectsSphere(sphere)) return false
        return view.overCorn || !view.blocked(eye, at)
      }
      const inTheWay = (spot: TopiarySpot) => {
        const at = world(spot)
        return Math.hypot(at.x - eye.x, at.z - eye.z) < cfg.holdNear
      }
      const cues: Cue[] = []
      const due = topiariesAt(pools, seconds)
      due.forEach((stand, i) => {
        const was = shown[i]
        if (!stand || !mayMove(was, stand, sees, inTheWay)) return
        if (was) standing.delete(was.spot.id)
        standing.add(stand.spot.id)
        shown[i] = stand
        const at = world(stand.spot)
        const body = bodies[i]
        body.visible = true
        body.position.set(at.x, ground.at(at.x, at.z), at.z)
        body.rotation.y = awayYaw + (stand.away ? 0 : Math.PI)
        // The first placing is no move; one heard after is.
        if (was && Math.hypot(at.x - eye.x, at.z - eye.z) <= cfg.hearRange) {
          cues.push({ id: 'topiary-rustle', x: at.x, z: at.z, rate: 1 })
        }
      })
      return cues
    },
  }
}
