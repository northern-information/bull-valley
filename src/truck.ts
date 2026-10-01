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
import type { RoadPoint, Walker } from './roadgraph.ts'
import type { HeightAt } from './terrain.ts'

export interface TruckOptions {
  scene: THREE.Object3D
  heightAt: HeightAt
}

// What update() returns each frame.
export interface TruckState {
  x: number
  z: number
  moving: boolean
  // True from the frame the route finishes until the next route.
  done: boolean
}

// Where Matthew Marx is: at the wheel, or working the tailgate shop.
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
  driver.group.scale.setScalar(DRIVER_SCALE)
  group.add(driver.group)
  const cigarette = attachCigarette(driver)
  placeDriver(driver, 'cab')
  return { group, driver, cigarette }
}

// The low-poly cab is short for a full-size body, so Matthew Marx is a
// little under scale everywhere: in the cab his head clears the roof and
// his boots stay inside.
const DRIVER_SCALE = 0.85

// 'cab' puts him at the wheel with his hips at 1.18 m; 'tailgate' leans him
// by the open tailgate, facing the customers behind the truck.
function placeDriver(driver: Figure, post: DriverPost): void {
  if (post === 'tailgate') {
    applyPose(driver, samplePose('lean'))
    driver.group.position.set(0.8, 0, -3.2)
    driver.group.rotation.y = Math.PI - 0.5
  } else {
    applyPose(driver, samplePose('sit'))
    driver.group.position.set(0.45, 1.18 - driver.hipY * DRIVER_SCALE, 0.55)
    driver.group.rotation.y = 0
  }
}

export class Truck {
  heightAt: HeightAt
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

  constructor({ scene, heightAt }: TruckOptions) {
    this.heightAt = heightAt
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

  // Matthew Marx works the tailgate shop while the truck is parked for the
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
  }

  // Advances the current route. Returns { x, z, moving, done } — done is true
  // on the frame the route finishes and stays true until the next route.
  update(dt: number): TruckState {
    // Matthew Marx glances about now and then, and smokes.
    this.time += dt
    this.cigarette.update(this.time)
    this.driver.joints.neck.rotation.y =
      Math.sin(this.time * 0.35) * Math.max(0, Math.sin(this.time * 0.11)) * 0.6
    if (this.walker && this.moving) {
      const s = this.walker.advance(this.speed * dt)
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
    this.group.position.set(this.x, this.heightAt(this.x, this.z), this.z)
    this.group.rotation.y = Math.atan2(this.dirX, this.dirZ)
    this.group.updateMatrixWorld()
  }

  // Where the rider's eyes sit: middle of the bed, CONFIG.truck.bedEye up.
  bedSeat(): { x: number; y: number; z: number } {
    const seat = new THREE.Vector3(0, 0.85 + CONFIG.truck.bedEye, -1.45)
    this.group.localToWorld(seat)
    return { x: seat.x, y: seat.y, z: seat.z }
  }

  // A dismount spot just off the passenger side.
  hopOutSpot(): RoadPoint {
    const spot = new THREE.Vector3(3, 0, -1.0)
    this.group.localToWorld(spot)
    return { x: spot.x, z: spot.z }
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.x - x, this.z - z)
  }
}
