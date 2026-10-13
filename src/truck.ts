// Matthew Marx's white Chevy: a low-poly pickup that parks, drives road
// routes, and carries the player in its bed. The body is buildTruckBody()
// in assets.ts, with Matthew Marx at the wheel (the shared body, figure.ts),
// visible through the cab glass. All route math comes from roadgraph.ts —
// this class just consumes a walker.

import * as THREE from 'three'
import { buildTruckBody, castShadows } from './assets.ts'
import { CONFIG } from './config.ts'
import {
  applyPose,
  attachBook,
  attachCigarette,
  buildFigure,
} from './figure.ts'
import { TAILGATE, TO_DOOR, TO_DOOR_SECONDS, WALK_SPEED } from './marx.ts'
import { POSES, samplePose } from './poses.ts'
import { createWalker } from './roadgraph.ts'
import type { CigaretteRig, Figure } from './figure.ts'
import type { HeightAt, Vec3, XZ } from './interfaces.ts'
import type { RoadPoint, Walker } from './roadgraph.ts'
import type { TruckPose } from './shadowmen.ts'
import type { TruckPlan } from './truckplan.ts'

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
  // True on the frame a drive home ends, parked at the Citgo.
  arrived: boolean
}

// Where Matthew Marx is: at the wheel, or reading by the tailgate.
export type DriverPost = 'cab' | 'tailgate'

// The truck mesh and the driver inside it.
interface TruckModel {
  group: THREE.Group
  driver: Figure
  cigarette: CigaretteRig
  // His paperback, out only at the tailgate.
  book: THREE.Group
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
  const book = attachBook(driver)
  placeDriver(driver, book, 'cab')
  return { group, driver, cigarette, book }
}

// The light the lamps throw, truck-local: one shadow-casting spot for the
// pair of headlights, low and down the road ahead, and one red spot for
// the taillights, back over the ground behind. One spot per pair keeps it
// to two shadow passes a frame. Physical units, like the station lights.
interface Lamp {
  color: string
  intensity: number
  distance: number
  angle: number
  penumbra: number
  at: Vec3
  aim: Vec3
}
const LAMPS: readonly Lamp[] = [
  {
    color: '#fbe7a3',
    intensity: 900,
    distance: 60,
    angle: 0.55,
    penumbra: 0.45,
    at: [0, 0.95, 2.95],
    aim: [0, 0.4, 30],
  },
  {
    color: '#ff2a1a',
    intensity: 60,
    distance: 12,
    angle: 1.0,
    penumbra: 0.6,
    at: [0, 1.15, -2.95],
    aim: [0, 0, -7],
  },
]
const LAMP_SHADOW_MAP = 512
function attachLamps(group: THREE.Group): THREE.SpotLight[] {
  const spots: THREE.SpotLight[] = []
  for (const lamp of LAMPS) {
    const spot = new THREE.SpotLight(
      lamp.color,
      lamp.intensity,
      lamp.distance,
      lamp.angle,
      lamp.penumbra
    )
    spot.position.set(...lamp.at)
    spot.target.position.set(...lamp.aim)
    spot.castShadow = true
    spot.shadow.mapSize.set(LAMP_SHADOW_MAP, LAMP_SHADOW_MAP)
    spot.shadow.camera.near = 0.2
    spot.shadow.camera.far = lamp.distance
    spot.shadow.bias = -0.001
    spot.shadow.normalBias = 0.03
    group.add(spot, spot.target)
    spots.push(spot)
  }
  return spots
}

// Working vectors for bedSeat() and driverAt(); their values never leave
// the method.
const SCRATCH = new THREE.Vector3()
const AT = new THREE.Vector3()

// Rider spots in the bed, truck-local [x, z]: the middle first, then the
// corners. Riders past the last seat double up.
const BED_SEATS: readonly [number, number][] = [
  [0, -1.45],
  [-0.45, -1.0],
  [0.45, -1.9],
  [-0.45, -1.9],
]

// Matthew Marx is full scale, like every figure. 'cab' seats him at the
// wheel with his hips at 1.0 m: the sit pose folds his shins so his boots
// stay inside the lower cab (floor at 0.55 m) and his head stops inside the
// roof slab. 'tailgate' stands him by the open tailgate (marx.ts
// TAILGATE), facing whoever comes out of the Citgo, reading his paperback;
// the book goes away when he takes the wheel.
const SEAT_HIP_Y = 1.0
function placeDriver(
  driver: Figure,
  book: THREE.Group,
  post: DriverPost
): void {
  book.visible = post === 'tailgate'
  if (post === 'tailgate') {
    applyPose(driver, samplePose('read'))
    driver.group.position.set(TAILGATE.x, 0, TAILGATE.z)
    driver.group.rotation.y = Math.PI - 0.5
  } else {
    applyPose(driver, samplePose('sit'))
    driver.group.position.set(0.45, SEAT_HIP_Y - driver.hipY, 0.55)
    driver.group.rotation.y = 0
  }
}

// When the truck leaves from where he reads, Matthew Marx puts the book
// away and walks from the tailgate round the rear corner and up the driver
// side to his door (marx.ts TO_DOOR), and the truck holds until he is in.
// Metres covered by one full walk cycle; the stride in playerbody.ts.
const STRIDE = 1.5

// How long the donut slide averages the turn over.
const DRIFT_SECONDS = 0.5

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
  book: THREE.Group
  // The headlights' and taillights' spots, casting shadows only while the
  // player is near enough to see them (castShadowsNear).
  lamps: THREE.SpotLight[]
  post: DriverPost
  // Matthew Marx's walk to the door before this route, or null when he
  // is already at the wheel; the route holds for TO_DOOR_SECONDS.
  toDoor: Walker | null
  toDoorWalked: number
  time: number
  // Seconds since the current route started; negative before it does.
  elapsed: number
  // When set, the route is driven against the clock: the distance covered
  // is speed × seconds since this local ms, so every client that knows the
  // departure time agrees where the truck is. Null drives by frame time.
  startedAt: number | null
  travelled: number
  // The local ms (performance.now) of the last update(): x and z are where
  // the truck was then, which can be a whole frame ago on a slow machine.
  updatedAt: number
  // Doing donuts (driveDonuts): the nose swings into the turn by `drift`
  // radians, from the turn rate averaged over the last moments, so the bed
  // slides out the way a real donut throws it.
  drifting: boolean
  drift: number
  heading: number
  turnAvg: number
  metresAvg: number
  // Where the truck parks by the spawn Citgo and which way it faces there,
  // and whether the drive on now ends there, parked, with Marx reading.
  home: XZ
  homeDir: XZ
  homeAfter: boolean

  constructor({ scene, groundAt }: TruckOptions) {
    this.groundAt = groundAt
    const model = buildTruck()
    this.group = model.group
    castShadows(this.group)
    this.lamps = attachLamps(this.group)
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
    this.book = model.book
    this.post = 'cab'
    this.toDoor = null
    this.toDoorWalked = 0
    this.time = 0
    this.elapsed = 0
    this.startedAt = null
    this.travelled = 0
    this.updatedAt = 0
    this.drifting = false
    this.drift = 0
    this.heading = 0
    this.turnAvg = 0
    this.metresAvg = 0
    this.home = { x: 0, z: 0 }
    this.homeDir = { x: 0, z: 1 }
    this.homeAfter = false
  }

  // Where the truck parks at home, facing which way.
  setHome(home: XZ, dir: XZ): void {
    this.home = { x: home.x, z: home.z }
    this.homeDir = { x: dir.x, z: dir.z }
  }

  // Parked at home, Matthew Marx reading at the tailgate.
  parkHome(): void {
    this.homeAfter = false
    this.drifting = false
    this.parkAt(this.home.x, this.home.z, this.homeDir.x, this.homeDir.z)
    this.setDriverPost('tailgate')
  }

  // One of Matthew Marx's legs (truckplan.ts), driven against the server
  // clock: toLocalMs turns a server ms into this page's performance.now.
  follow(plan: TruckPlan, toLocalMs: (serverMs: number) => number): void {
    if (plan.kind === 'park') {
      this.parkHome()
      return
    }
    const [start, next] = plan.points
    const len = Math.hypot(next.x - start.x, next.z - start.z) || 1
    this.parkAt(
      start.x,
      start.z,
      (next.x - start.x) / len,
      (next.z - start.z) / len
    )
    this.setDriverPost(plan.fromTailgate ? 'tailgate' : 'cab')
    const at = toLocalMs(plan.at)
    if (plan.donuts) this.driveDonuts(plan.points, at)
    else this.driveRouteAt(plan.points, at, plan.speed)
    this.homeAfter = plan.home
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

  // Matthew Marx reads at the tailgate while the truck is parked at home;
  // any drive puts him back at the wheel.
  setDriverPost(post: DriverPost): void {
    this.post = post
    placeDriver(this.driver, this.book, post)
  }

  // Where Matthew Marx stands (or sits) to be talked to, in the world.
  // Null while the truck is on the move, the walk to the door included.
  driverAt(): XZ | null {
    if (this.moving) return null
    const { x, z } = this.driver.group.getWorldPosition(AT)
    return { x, z }
  }

  driveRoute(
    points: readonly RoadPoint[] | null,
    speed: number = CONFIG.truck.speed
  ) {
    if (!points || points.length < 2) return
    if (this.post === 'tailgate') {
      this.toDoor = createWalker(TO_DOOR)
      this.toDoorWalked = 0
      this.book.visible = false
    } else {
      this.toDoor = null
      this.setDriverPost('cab')
    }
    this.walker = createWalker(points)
    this.speed = speed
    this.drifting = false
    this.drift = 0
    this.moving = true
    this.startedAt = null
    this.elapsed = 0
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

  // Matthew Marx's donuts (donuts.ts), driven against the clock like
  // driveRouteAt when startedAt is set, drifting all the way.
  driveDonuts(points: readonly RoadPoint[], startedAt: number | null) {
    const { speed } = CONFIG.truck.donuts
    if (startedAt === null) this.driveRoute(points, speed)
    else this.driveRouteAt(points, startedAt, speed)
    if (!this.walker) return
    this.drifting = true
    this.heading = Math.atan2(this.dirX, this.dirZ)
    this.turnAvg = 0
    this.metresAvg = 0
  }

  // Advances the current route. Returns { x, z, moving, done, arrived }:
  // done is true on the frame the route finishes and stays true until the
  // next route; arrived only on the frame a drive home parks.
  update(dt: number, nowMs: number = performance.now()): TruckState {
    this.updatedAt = nowMs
    // Matthew Marx glances about now and then (up from the page, when he
    // is reading), and smokes.
    this.time += dt
    this.cigarette.update(this.time)
    this.driver.joints.neck.rotation.y =
      Math.sin(this.time * 0.35) * Math.max(0, Math.sin(this.time * 0.11)) * 0.6
    let arrived = false
    if (this.walker && this.moving) {
      this.elapsed =
        this.startedAt === null
          ? this.elapsed + dt
          : (nowMs - this.startedAt) / 1000
      let hold = 0
      if (this.post === 'tailgate' && this.toDoor) {
        hold = TO_DOOR_SECONDS
        if (this.elapsed < hold) this.walkToDoor(this.elapsed)
        else this.setDriverPost('cab')
      }
      const due = this.speed * Math.max(0, this.elapsed - hold)
      const metres = Math.max(0, due - this.travelled)
      this.travelled += metres
      const s = this.walker.advance(metres)
      this.x = s.x
      this.z = s.z
      this.dirX = s.dirX
      this.dirZ = s.dirZ
      if (s.done) this.moving = false
      if (this.drifting) this.slide(dt, metres)
      this.pose()
      if (s.done && this.homeAfter) {
        this.parkHome()
        arrived = true
      }
    }
    return {
      x: this.x,
      z: this.z,
      moving: this.moving,
      done: !!this.walker && !this.moving,
      arrived,
    }
  }

  // Matthew Marx some seconds into his walk to the door.
  walkToDoor(seconds: number): void {
    if (!this.toDoor) return
    const metres = WALK_SPEED * Math.max(0, seconds)
    const s = this.toDoor.advance(metres - this.toDoorWalked)
    this.toDoorWalked = metres
    applyPose(
      this.driver,
      samplePose('walk', (metres / STRIDE) * POSES.walk.seconds)
    )
    this.driver.group.position.set(s.x, 0, s.z)
    this.driver.group.rotation.y = Math.atan2(s.dirX, s.dirZ)
  }

  // True once the current route covers ground: after Matthew Marx's walk
  // to the door, if he had one.
  rolling(): boolean {
    return this.walker !== null && this.travelled > 0
  }

  // The nose into the turn: the turn per metre, both averaged over about
  // DRIFT_SECONDS so the route's corners blur into one steady slide, up to
  // CONFIG.truck.donuts.drift at the tightest loop.
  slide(dt: number, metres: number): void {
    const heading = Math.atan2(this.dirX, this.dirZ)
    const turn = Math.atan2(
      Math.sin(heading - this.heading),
      Math.cos(heading - this.heading)
    )
    this.heading = heading
    const k = Math.min(1, dt / DRIFT_SECONDS)
    this.turnAvg += (turn - this.turnAvg) * k
    this.metresAvg += (metres - this.metresAvg) * k
    const { drift, loop } = CONFIG.truck.donuts
    const curvature = this.metresAvg > 1e-4 ? this.turnAvg / this.metresAvg : 0
    this.drift = Math.max(-drift, Math.min(drift, curvature * loop.min * drift))
  }

  pose() {
    this.group.position.set(this.x, this.groundAt(this.x, this.z), this.z)
    this.group.rotation.y =
      Math.atan2(this.dirX, this.dirZ) + (this.drifting ? this.drift : 0)
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

  // A dismount spot just off the driver's side.
  hopOutSpot(): XZ {
    const spot = new THREE.Vector3(3, 0, -1.0)
    this.group.localToWorld(spot)
    return { x: spot.x, z: spot.z }
  }

  // Where the truck stands and faces as drawn, for its headlights'
  // beam (shadowmen.ts headlightBeam).
  headlights(): TruckPose {
    const { x, y, z } = this.group.position
    return { x, y, z, heading: this.group.rotation.y }
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.x - x, this.z - z)
  }

  // The lamps render their shadow maps only while the player at (x, z)
  // is within CONFIG.render.liveRadius: past the fog no one sees them,
  // and Three skips the pass only on autoUpdate false, never for
  // distance. The lights stay in the scene either way, so the shaders
  // never recompile for a changed count.
  castShadowsNear(x: number, z: number): void {
    const near = this.distanceTo(x, z) <= CONFIG.render.liveRadius
    for (const lamp of this.lamps) {
      if (near && !lamp.shadow.autoUpdate) lamp.shadow.needsUpdate = true
      lamp.shadow.autoUpdate = near
    }
  }
}
