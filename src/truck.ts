// Matthew Marx's white Chevy: a low-poly pickup that parks, drives road
// routes, and carries the player in its bed. The body is buildTruckBody()
// in assets.ts, with Matthew Marx at the wheel (the shared body, figure.ts),
// visible through the cab glass. All route math comes from roadgraph.ts —
// this class just consumes a walker.

import * as THREE from 'three'
import { buildTruckBody } from './assets.ts'
import { CONFIG } from './config.ts'
import { applyPose, attachCigarette, buildFigure } from './figure.ts'
import { samplePose } from './poses.ts'
import { createWalker } from './roadgraph.ts'
import type { CigaretteRig, Figure } from './figure.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { RoadPoint, Walker } from './roadgraph.ts'

export interface TruckOptions {
  scene: THREE.Object3D
  // What the truck stands on: world.ground.at, never the bare terrain.
  groundAt: HeightAt
}

// What update() returns each frame.
export interface TruckState {
  x: number
  z: number
  moving: boolean
  // True from the frame the route finishes until the next route.
  done: boolean
}

// Where Matthew Marx is: at the wheel, or leaning on the tailgate.
export type DriverPost = 'cab' | 'tailgate'

// The truck mesh and the driver inside it.
interface TruckModel {
  group: THREE.Group
  driver: Figure
  cigarette: CigaretteRig
}

// Local space: the truck faces +Z, origin at ground level under the middle.
export function buildTruckMesh(): THREE.Group {
  return buildTruck().group
}

function buildTruck(): TruckModel {
  const group = buildTruckBody()
  // Matthew Marx in the driver seat (left side, +X), hands on the wheel.
  const driver = buildFigure('marx')
  group.add(driver.group)
  const cigarette = attachCigarette(driver)
  placeDriver(driver, 'cab')
  return { group, driver, cigarette }
}

// A working vector for bedSeat(); its value never leaves the method.
const SCRATCH = new THREE.Vector3()

// Rider spots in the bed, truck-local [x, z]: the middle first, then the
// corners. CONFIG.net.seats riders fit before they double up.
const BED_SEATS: readonly [number, number][] = [
  [0, -1.45],
  [-0.45, -1.0],
  [0.45, -1.9],
  [-0.45, -1.9],
]

// Matthew Marx is full scale, like every figure. 'cab' seats him at the
// wheel with his hips at 1.0 m: the sit pose folds his shins so his boots
// stay inside the lower cab (floor at 0.55 m) and his head stops inside the
// roof slab. 'tailgate' leans him by the open tailgate, facing whoever
// comes out of the Citgo.
const SEAT_HIP_Y = 1.0
function placeDriver(driver: Figure, post: DriverPost): void {
  if (post === 'tailgate') {
    applyPose(driver, samplePose('lean'))
    driver.group.position.set(0.8, 0, -3.2)
    driver.group.rotation.y = Math.PI - 0.5
  } else {
    applyPose(driver, samplePose('sit'))
    driver.group.position.set(0.45, SEAT_HIP_Y - driver.hipY, 0.55)
    driver.group.rotation.y = 0
  }
}

export class Truck {
  groundAt: HeightAt
  group: THREE.Group
  walker: Walker | null
  speed: number
  x: number
  z: number
  dirX: number
  dirZ: number
  moving: boolean
  driver: Figure
  cigarette: CigaretteRig
  time: number
  // When set, the route is driven against the clock: the distance covered
  // is speed × seconds since this local ms, so every client that knows the
  // departure time agrees where the truck is. Null drives by frame time.
  startedAt: number | null
  travelled: number

  constructor({ scene, groundAt }: TruckOptions) {
    this.groundAt = groundAt
    const model = buildTruck()
    this.group = model.group
    scene.add(this.group)
    this.walker = null
    this.speed = CONFIG.truck.speed
    this.x = 0
    this.z = 0
    this.dirX = 0
    this.dirZ = 1
    this.moving = false
    this.driver = model.driver
    this.cigarette = model.cigarette
    this.time = 0
    this.startedAt = null
    this.travelled = 0
  }

  parkAt(x: number, z: number, dirX = 0, dirZ = 1) {
    this.walker = null
    this.moving = false
    this.x = x
    this.z = z
    this.dirX = dirX
    this.dirZ = dirZ
    this.pose()
  }

  // Matthew Marx waits at the tailgate while the truck is parked for the
  // loadout; any drive puts him back at the wheel.
  setDriverPost(post: DriverPost): void {
    placeDriver(this.driver, post)
  }

  driveRoute(
    points: readonly RoadPoint[] | null,
    speed: number = CONFIG.truck.speed
  ) {
    if (!points || points.length < 2) return
    placeDriver(this.driver, 'cab')
    this.walker = createWalker(points)
    this.speed = speed
    this.moving = true
    this.startedAt = null
    this.travelled = 0
  }

  // Drives a route that left at startedAt (local ms, from clock.ts). A
  // start in the past puts the truck where it already is; one in the
  // future holds it until then.
  driveRouteAt(
    points: readonly RoadPoint[] | null,
    startedAt: number,
    speed: number = CONFIG.truck.speed
  ) {
    this.driveRoute(points, speed)
    if (this.walker) this.startedAt = startedAt
  }

  // Advances the current route. Returns { x, z, moving, done } — done is true
  // on the frame the route finishes and stays true until the next route.
  update(dt: number, nowMs: number = performance.now()): TruckState {
    // Matthew Marx glances about now and then, and smokes.
    this.time += dt
    this.cigarette.update(this.time)
    this.driver.joints.neck.rotation.y =
      Math.sin(this.time * 0.35) * Math.max(0, Math.sin(this.time * 0.11)) * 0.6
    if (this.walker && this.moving) {
      let metres = this.speed * dt
      if (this.startedAt !== null) {
        const due = (this.speed * (nowMs - this.startedAt)) / 1000
        metres = Math.max(0, due - this.travelled)
      }
      this.travelled += metres
      const s = this.walker.advance(metres)
      this.x = s.x
      this.z = s.z
      this.dirX = s.dirX
      this.dirZ = s.dirZ
      if (s.done) this.moving = false
      this.pose()
    }
    return {
      x: this.x,
      z: this.z,
      moving: this.moving,
      done: !!this.walker && !this.moving,
    }
  }

  pose() {
    this.group.position.set(this.x, this.groundAt(this.x, this.z), this.z)
    this.group.rotation.y = Math.atan2(this.dirX, this.dirZ)
    this.group.updateMatrixWorld()
  }

  // Where a rider's eyes sit: a spot in the bed, CONFIG.truck.bedEye up.
  // Seat 0 is the middle of the bed; the others pair up along the sides
  // for a full truck, and a fifth rider shares the first seat again. The
  // loop calls this every frame of the ride, so it reuses one vector.
  bedSeat(slot = 0): { x: number; y: number; z: number } {
    const [sx, sz] = BED_SEATS[slot % BED_SEATS.length]
    const seat = SCRATCH.set(sx, 0.85 + CONFIG.truck.bedEye, sz)
    this.group.localToWorld(seat)
    return { x: seat.x, y: seat.y, z: seat.z }
  }

  // A dismount spot just off the passenger side.
  hopOutSpot(): XZ {
    const spot = new THREE.Vector3(3, 0, -1.0)
    this.group.localToWorld(spot)
    return { x: spot.x, z: spot.z }
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.x - x, this.z - z)
  }
}
