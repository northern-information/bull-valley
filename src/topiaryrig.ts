// The topiaries in the world (topiaries.ts): the hedge animals drawn
// (topiarymodel.ts) on `ground.at`, each turned broadside across its
// corridor, and every spot's corridor stood on the walls as a gate
// (walls.ts addGate) that holds while an animal stands there. Each frame
// the valley's clock says where each should be, and an animal goes there
// only while this raider sees neither end (topiaries.ts mayMove): in view
// of the camera, within sight, and with no corn between, unless the raider
// is up the lookout, over the corn. Where it lands within earshot it
// rustles.
//
// The valley keeps each one's health (sharedworld.ts rule 39): hurt by a
// torch, it shows the Elden Ring bar over its back (healthbar.ts) to a
// raider near enough, and shudders at every blow (`struck`). Burned away,
// it bursts into flame, falls onto its back and kicks while it blackens,
// burns down into the ground (topiaries.ts deathPose), and its corridor
// opens; grown
// back, it shows itself again where the clock has it, the moment nobody
// here is looking (topiaries.ts mayAppear).

import * as THREE from 'three'
import { castShadows } from './assetkit.ts'
import { CONFIG } from './config.ts'
import { buildHealthBar, setHealthBar, stepHealthBar } from './healthbar.ts'
import {
  burnedAway,
  deathPose,
  mayAppear,
  mayMove,
  spotOfGate,
  swingTarget,
  theTopiaries,
  TOPIARIES,
  topiariesAt,
  topiaryGate,
} from './topiaries.ts'
import { buildTopiaryParts, poseDeath } from './topiarymodel.ts'
import type { MazeFrame } from './cornmaze.ts'
import type { Ground } from './ground.ts'
import type { HealthBar } from './healthbar.ts'
import type { XZ } from './interfaces.ts'
import type { Cue } from './sfx.ts'
import type { TopiaryHealth, TopiarySpot, TopiaryStand } from './topiaries.ts'
import type { TopiaryParts } from './topiarymodel.ts'
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
  // The topiary a torch swung from `at` along `dir` lands on, or null
  // (topiaries.ts swingTarget).
  target(at: XZ, dir: XZ, reach: number): number | null
  // A blow landed on topiary `index`: it shudders. Where it stands, for
  // the sound, or null while it is not shown.
  struck(index: number): XZ | null
  // Stepped on the valley's clock (seconds), with the valley's word on
  // each one's health (null before the first) and a running time and step
  // (seconds) for the fire and the bars; what it sounds like.
  update(
    seconds: number,
    view: TopiaryView,
    health: readonly TopiaryHealth[] | null,
    time: number,
    dt: number
  ): Cue[]
}

// Seen within this much of a spot's middle, and this high over its ground.
const SEEN_RADIUS = 2.4
const SEEN_HEIGHT = 1.4
// The bar floats this high over the ground, this wide.
const BAR_HEIGHT = 3.3
const BAR_WIDTH = 1.8
// A blow shudders it this long, this far round, radians.
const SHUDDER_SECONDS = 0.35
const SHUDDER = 0.06

// One animal as drawn.
interface Body {
  group: THREE.Group
  bar: HealthBar
  // When (running time) its last blow landed, and when it caught fire;
  // null with none.
  struckAt: number | null
  burningAt: number | null
  // Whether it has ever been placed, since this raider came.
  placed: boolean
  // The rig it is drawn as (topiarymodel.ts).
  parts: TopiaryParts
}

export function placeTopiaries(
  frame: MazeFrame,
  ground: Ground,
  walls: Walls
): TopiaryRig {
  const cfg = CONFIG.topiaries
  const { spots, pools } = theTopiaries()
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
  const bodies: Body[] = TOPIARIES.map((kind, i) => {
    const parts = buildTopiaryParts(kind, cfg.length, 0x70b + i)
    const body = parts.group
    castShadows(body)
    body.visible = false
    group.add(body)
    const bar = buildHealthBar(BAR_WIDTH)
    bar.sprite.visible = false
    bar.sprite.position.y = BAR_HEIGHT
    body.add(bar.sprite)
    return {
      group: body,
      parts,
      bar,
      struckAt: null,
      burningAt: null,
      placed: false,
    }
  })
  const shown: (TopiaryStand | null)[] = TOPIARIES.map(() => null)
  const standing = new Set<number>()
  let now = 0

  const frustum = new THREE.Frustum()
  const matrix = new THREE.Matrix4()
  const sphere = new THREE.Sphere()

  // Stands animal `i` at `stand`, whole and green.
  const stand = (i: number, to: TopiaryStand) => {
    const was = shown[i]
    if (was) standing.delete(was.spot.id)
    standing.add(to.spot.id)
    shown[i] = to
    const body = bodies[i]
    const at = world(to.spot)
    body.group.visible = true
    body.group.position.set(at.x, ground.at(at.x, at.z), at.z)
    body.group.rotation.y = awayYaw + (to.away ? 0 : Math.PI)
    body.placed = true
  }

  // Animal `i` dying, `seconds` in (topiaries.ts deathPose); whether it
  // is over.
  const burn = (i: number, seconds: number, time: number) => {
    const pose = deathPose(seconds)
    poseDeath(bodies[i].parts, pose, time)
    return pose.over
  }

  // Animal `i` whole again: green, on its feet and unlit.
  const heal = (i: number) => {
    poseDeath(bodies[i].parts, null, 0)
    bodies[i].burningAt = null
  }

  // Animal `i` out of the valley: unseen, and its corridor open.
  const hide = (i: number) => {
    const was = shown[i]
    if (was) standing.delete(was.spot.id)
    shown[i] = null
    bodies[i].group.visible = false
    bodies[i].bar.sprite.visible = false
  }

  return {
    group,
    stands: (gate) => {
      const id = spotOfGate(gate)
      return id !== null && standing.has(id)
    },
    shown: () => [...shown],
    target(at, dir, reach) {
      const spines = shown.map((stand, i) =>
        stand && bodies[i].burningAt === null
          ? { a: world(stand.spot.a), b: world(stand.spot.b) }
          : null
      )
      return swingTarget(spines, at, dir, reach)
    },
    struck(index) {
      const body = bodies[index]
      const stand = shown[index]
      if (!body || !stand) return null
      body.struckAt = now
      return world(stand.spot)
    },
    update(seconds, view, health, time, dt) {
      now = time
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
      due.forEach((next, i) => {
        const body = bodies[i]
        const kept = health?.[i]
        // Burned away: it burns out where it stood, then is gone.
        if (burnedAway(kept)) {
          if (!shown[i]) return
          if (body.burningAt === null) {
            body.burningAt = time
            const at = world(shown[i].spot)
            cues.push({ id: 'topiary-burn', x: at.x, z: at.z, rate: 1 })
          }
          const over = burn(i, time - body.burningAt, time)
          body.bar.sprite.visible = false
          if (over) {
            hide(i)
            heal(i)
          }
          return
        }
        if (body.burningAt !== null) heal(i)
        const was = shown[i]
        if (!was) {
          // Never placed since this raider came: it is simply there.
          // Grown back: only where nobody here is looking.
          if (next && (!body.placed || mayAppear(next, sees, inTheWay))) {
            stand(i, next)
          }
        } else if (next && mayMove(was, next, sees, inTheWay)) {
          stand(i, next)
          const at = world(next.spot)
          if (Math.hypot(at.x - eye.x, at.z - eye.z) <= cfg.hearRange) {
            cues.push({ id: 'topiary-rustle', x: at.x, z: at.z, rate: 1 })
          }
        }
        // Its bar, once hurt, to a raider near enough.
        const where = shown[i] ? world(shown[i].spot) : null
        const share = kept ? kept.hp / cfg.hp : 1
        const near =
          where !== null &&
          Math.hypot(where.x - eye.x, where.z - eye.z) <= cfg.barRange
        body.bar.sprite.visible = near && share < 1
        if (share !== body.bar.target) setHealthBar(body.bar, share)
        stepHealthBar(body.bar, dt)
        // A blow shudders it.
        const since = body.struckAt === null ? Infinity : time - body.struckAt
        const shudder =
          since < SHUDDER_SECONDS
            ? Math.sin(since * 60) * SHUDDER * (1 - since / SHUDDER_SECONDS)
            : 0
        body.parts.roll.rotation.z = shudder
      })
      return cues
    },
  }
}
