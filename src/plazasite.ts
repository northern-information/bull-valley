import * as THREE from 'three'
import {
  buildDumpster,
  buildPlazaSign,
  buildShoppingCart,
  buildStripMall,
  buildTrapdoor,
  buildUndercroft,
  castShadows,
  DUMPSTER,
  FUEL_LAYOUT,
  lotMaterial,
  PLAZA_SIGN,
} from './assets.ts'
import { CONFIG } from './config.ts'
import { applyPose, buildFigure } from './figure.ts'
import { FOG_GATE, FOG_IN, FOG_SPOT, FOG_WALL, inChamber } from './fogwall.ts'
import { buildFogWall } from './fogwallrig.ts'
import { mazeToWorld, worldToMaze } from './maze.ts'
import { samplePose } from './poses.ts'
import { nearestRoadside } from './stations.ts'
import { toLocal, toWorld } from './store.ts'
import {
  inBackRoom,
  mallDeck,
  mallGate,
  mallOrigin,
  mallWalls,
  STRIP_MALL,
} from './stripmall.ts'
import {
  croftWalls,
  inUndercroft,
  UNDERCROFT,
  undercroftPlace,
} from './undercroft.ts'
import { LOT_LIFT, makeRibbonAccumulator } from './worldsurfaces.ts'
import type { StripMallRig } from './assets.ts'
import type { Ground } from './ground.ts'
import type { Geo, HeightAt, Metres, XZ } from './interfaces.ts'
import type { LockId } from './keys.ts'
import type { MazePlace } from './maze.ts'
import type { StoreOrigin } from './store.ts'
import type { Walls } from './walls.ts'
import type { FuelPoint, Spawn } from './world.ts'

// Bull Valley Plaza, the dead strip mall beside the spawn Citgo
// (stripmall.ts), and the Undercroft under it (undercroft.ts), as
// buildWorld (world.ts) places them: each on the ground, its floor
// registered and its walls on `walls`.

// The Undercroft as the game reads it (undercroft.ts): where it lies (its
// corner high over the survey's), the height of its floor, the trapdoor
// in the office above and the ladder's foot below as a raider climbs them
// (each where they stand, and the way they face), whether a point is down
// there, and its candles' flicker.
export interface CroftRig {
  place: MazePlace
  deck: number
  // Where E climbs: the hatch's middle and the ladder's foot.
  hatch: XZ
  foot: XZ
  // Where a raider stands after climbing, and the way they face.
  trapdoor: Spawn
  ladder: Spawn
  // The fog wall across the deep chamber's door (fogwall.ts): where E
  // passes through it, where that leaves a raider, whether a point is on
  // its inner side, and whether the Warden stands, for the fog to show.
  fog: XZ
  through: Spawn
  chamber(x: number, z: number): boolean
  setFog(standing: boolean): void
  inside(x: number, z: number): boolean
  update(t: number): void
}

// Trees keep this far off the Undercroft's footprint: a tree there would
// stand on its floor.
export const CROFT_TREE_CLEAR = 10

// The Undercroft (undercroft.ts): a sealed stone box over a far corner of
// the survey, its floor CONFIG.undercroft.lift over the highest ground
// under it and registered as a floor, its stone and fixtures as walls (its
// outer stone keeping anyone on the surface out); and the trapdoor in the
// plaza's office floor, the way down.
export function buildCroft(
  plaza: { origin: StoreOrigin; group: THREE.Group },
  metres: Metres,
  heightAt: HeightAt,
  ground: Ground,
  walls: Walls
): { group: THREE.Group; rig: CroftRig } {
  const group = new THREE.Group()
  group.name = 'croft'
  const place = undercroftPlace(metres)
  const { size, wall } = UNDERCROFT
  let highest = -Infinity
  for (let x = -wall; x <= size.across + wall; x += 4) {
    for (let z = -wall; z <= size.along + wall; z += 4) {
      const p = mazeToWorld(place, { x, z })
      highest = Math.max(highest, heightAt(p.x, p.z))
    }
  }
  const deck = highest + CONFIG.undercroft.lift
  // Its floor, along its x (the world's, unturned), as wide as its z.
  const cos = Math.cos(place.yaw)
  const sin = Math.sin(place.yaw)
  const mid = mazeToWorld(place, { x: 0, z: size.along / 2 })
  ground.addFloor(
    mid.x,
    mid.z,
    cos,
    sin,
    -wall,
    size.across + wall,
    size.along / 2 + wall,
    deck
  )
  for (const w of croftWalls()) {
    walls.addWall(mazeToWorld(place, w.a), mazeToWorld(place, w.b), w.half)
  }
  const croft = buildUndercroft()
  croft.group.position.set(place.x, deck, place.z)
  croft.group.rotation.y = -place.yaw
  group.add(croft.group)

  // The fog wall in the deep chamber's door, a gate on the walls while the
  // Warden stands (the loop says who it lets by, walls.setGates).
  const fogA = mazeToWorld(place, FOG_WALL.a)
  const fogB = mazeToWorld(place, FOG_WALL.b)
  walls.addGate(fogA, fogB, FOG_WALL.half, FOG_GATE)
  const fogWall = buildFogWall(
    Math.hypot(fogB.x - fogA.x, fogB.z - fogA.z),
    FOG_WALL.height
  )
  fogWall.group.position.set((fogA.x + fogB.x) / 2, deck, (fogA.z + fogB.z) / 2)
  fogWall.group.rotation.y = Math.atan2(-(fogB.z - fogA.z), fogB.x - fogA.x)
  group.add(fogWall.group)
  const through = mazeToWorld(place, FOG_IN)
  const onward = mazeToWorld(place, FOG_IN.face)

  // The trapdoor in the office floor.
  const hatch = buildTrapdoor()
  const [tx, , tz] = toWorld(plaza.origin, [
    STRIP_MALL.trapdoor.x,
    0,
    STRIP_MALL.trapdoor.z,
  ])
  hatch.position.set(tx, ground.at(tx, tz), tz)
  hatch.rotation.y = -plaza.origin.yaw
  group.add(hatch)

  // Climbing up, a raider steps off beside the hatch toward the office's
  // door; climbing down, off the ladder's foot into the entry chamber.
  // The camera looks along (-sin yaw, -cos yaw).
  const [ux, , uz] = toWorld(plaza.origin, [
    STRIP_MALL.trapdoor.x + 1,
    0,
    STRIP_MALL.trapdoor.z,
  ])
  const foot = mazeToWorld(place, UNDERCROFT.ladder)
  const face = mazeToWorld(place, UNDERCROFT.ladder.face)
  return {
    group,
    rig: {
      place,
      deck,
      hatch: { x: tx, z: tz },
      foot,
      trapdoor: { x: ux, z: uz, yaw: Math.atan2(-(ux - tx), -(uz - tz)) },
      ladder: {
        x: foot.x,
        z: foot.z,
        yaw: Math.atan2(-(face.x - foot.x), -(face.z - foot.z)),
      },
      fog: mazeToWorld(place, FOG_SPOT),
      through: {
        x: through.x,
        z: through.z,
        yaw: Math.atan2(-(onward.x - through.x), -(onward.z - through.z)),
      },
      chamber: (x, z) => inChamber(worldToMaze(place, { x, z })),
      setFog: (standing) => fogWall.set(standing),
      inside: (x, z) => inUndercroft(place, { x, z }),
      update: (t) => {
        croft.update(t)
        fogWall.update(t)
      },
    },
  }
}

// The plaza as the game reads it: the rig, where the back room's locked
// door stands, which lock it is, and whether a point is behind it.
export interface PlazaRig extends StripMallRig {
  lock: LockId
  doorAt: XZ
  inBackRoom(x: number, z: number): boolean
  // Erwin von Dutch, the squatter who deals (dealer.ts): where he sits,
  // and his figure for the glow.
  dealer: { at: XZ; group: THREE.Group }
}

// Bull Valley Plaza beside the spawn station (CONFIG.stripMall,
// stripmall.ts). Its asphalt goes down first: the lot out front in strips,
// each reaching the centreline of the road nearest it (so the lot follows
// the road as the Citgo's does, its seam under the road), and the drives
// round both ends and the alley behind, every piece registered on the
// ground. Then the building stands level on its slab over the highest
// ground under it, its deck registered as a floor and its walls on
// `walls`; then the pylon by the road, the dumpsters, the carts, and the
// stalls painted on the lot.
const PLAZA_STRIP = 4
// The lot never reaches less far than this past its front, or further,
// whatever road is nearest.
const PLAZA_REACH = { min: 10, max: 40 }
const PLAZA_STRIPE = { width: 0.12, color: '#5e5c55', lift: LOT_LIFT + 0.02 }

export function buildPlaza(
  station: FuelPoint,
  geo: Pick<Geo, 'roads'>,
  metres: Metres,
  heightAt: HeightAt,
  ground: Ground,
  walls: Walls
): { group: THREE.Group; rig: PlazaRig; origin: StoreOrigin } {
  const group = new THREE.Group()
  group.name = 'plaza'
  const frame = mallOrigin(station, 0)
  const cos = Math.cos(frame.yaw)
  const sin = Math.sin(frame.yaw)
  const at = (x: number, z: number): XZ => {
    const [wx, , wz] = toWorld(frame, [x, 0, z])
    return { x: wx, z: wz }
  }
  const lots = makeRibbonAccumulator(ground)
  const { lot } = STRIP_MALL
  for (let z0 = lot.z0; z0 < lot.z1; z0 += PLAZA_STRIP) {
    const z1 = Math.min(lot.z1, z0 + PLAZA_STRIP)
    const zc = (z0 + z1) / 2
    const front = at(lot.x0, zc)
    const road = nearestRoadside(geo.roads, metres, front.x, front.z)
    const reach = road ? toLocal(frame, road.x, road.z).x : PLAZA_REACH.min
    const x1 = Math.min(PLAZA_REACH.max, Math.max(PLAZA_REACH.min, reach))
    const mid = at(0, zc)
    lots.addPatch({
      x: mid.x,
      z: mid.z,
      cos,
      sin,
      x0: lot.x0,
      x1,
      halfWidth: (z1 - z0) / 2,
      step: 3,
      heightAt,
      color: FUEL_LAYOUT.lotColor,
      lift: LOT_LIFT,
    })
  }
  for (const piece of STRIP_MALL.asphalt) {
    const mid = at(0, (piece.z[0] + piece.z[1]) / 2)
    lots.addPatch({
      x: mid.x,
      z: mid.z,
      cos,
      sin,
      x0: piece.x[0],
      x1: piece.x[1],
      halfWidth: (piece.z[1] - piece.z[0]) / 2,
      step: 3,
      heightAt,
      color: FUEL_LAYOUT.lotColor,
      lift: LOT_LIFT,
    })
  }
  const lotMesh = lots.build('plaza-lot', lotMaterial())
  lotMesh.receiveShadow = true
  group.add(lotMesh)

  // The stalls, draped on the lot just over it. Nobody stands on paint.
  const stripes = makeRibbonAccumulator(null)
  for (const z of STRIP_MALL.stripes.z) {
    const mid = at(0, z)
    stripes.addPatch({
      x: mid.x,
      z: mid.z,
      cos,
      sin,
      x0: STRIP_MALL.stripes.x0,
      x1: STRIP_MALL.stripes.x1,
      halfWidth: PLAZA_STRIPE.width / 2,
      step: 1,
      heightAt,
      color: PLAZA_STRIPE.color,
      lift: PLAZA_STRIPE.lift,
    })
  }
  group.add(stripes.build('plaza-stripes'))

  // The building, level on its slab.
  const front = at(STRIP_MALL.walk, 0)
  const deck = mallDeck(frame, ground.at(front.x, front.z), heightAt)
  const origin = mallOrigin(station, deck)
  ground.addFloor(
    origin.x,
    origin.z,
    cos,
    sin,
    -STRIP_MALL.depth,
    STRIP_MALL.walk,
    STRIP_MALL.length / 2,
    deck,
    'tile'
  )
  for (const wall of mallWalls(origin)) {
    walls.addWall(wall.a, wall.b, wall.half, undefined, wall.low)
  }
  // The back room's door: a gate, standing for whoever lacks its key
  // (keys.ts; the game says who, walls.setGates).
  const { lock } = STRIP_MALL
  const gate = mallGate(origin)
  walls.addGate(gate.a, gate.b, gate.half, gate.gate)
  const mall = buildStripMall()
  mall.group.position.set(origin.x, deck, origin.z)
  mall.group.rotation.y = -origin.yaw
  group.add(mall.group)
  // Erwin von Dutch, on the floor at the foot of his mattress in the
  // Golden Wok (STRIP_MALL.dealer), facing the candles; he blocks like a
  // post.
  const { dealer } = STRIP_MALL
  const wickAt = at(dealer.x, dealer.z)
  const facing = at(dealer.face.x, dealer.face.z)
  const wick = buildFigure('squatter')
  applyPose(wick, samplePose('rest'))
  wick.group.position.set(wickAt.x, deck, wickAt.z)
  // The figure faces +Z: rotation.y turns it to (sin, cos).
  wick.group.rotation.y = Math.atan2(facing.x - wickAt.x, facing.z - wickAt.z)
  castShadows(wick.group)
  group.add(wick.group)
  walls.addWall(wickAt, wickAt, CONFIG.dealer.radius)
  const rig: PlazaRig = {
    ...mall,
    lock: lock.id,
    doorAt: at((lock.a.x + lock.b.x) / 2, (lock.a.z + lock.b.z) / 2),
    inBackRoom: (x, z) => inBackRoom(origin, x, z),
    dealer: { at: wickAt, group: wick.group },
  }

  // What lies round it, each on the ground under it and turned in the
  // plaza's frame: an asset's yaw turns +X to (cos, -sin), so the frame's
  // own turn is -yaw.
  const place = (object: THREE.Object3D, x: number, z: number, yaw: number) => {
    const p = at(x, z)
    object.position.set(p.x, ground.at(p.x, p.z), p.z)
    object.rotation.y = -origin.yaw + yaw
    group.add(object)
    return p
  }
  const { pylon, dumpsters, carts } = STRIP_MALL.props
  place(buildPlazaSign(), pylon.x, pylon.z, pylon.yaw)
  // Its legs stand along its own Z, which its yaw turns to (sin, cos).
  for (const d of [-PLAZA_SIGN.legs / 2, PLAZA_SIGN.legs / 2]) {
    const leg = at(
      pylon.x + d * Math.sin(pylon.yaw),
      pylon.z + d * Math.cos(pylon.yaw)
    )
    walls.addWall(leg, leg, PLAZA_SIGN.leg)
  }
  // The dumpsters stand along the wall, their length down the alley.
  for (const spot of dumpsters) {
    place(buildDumpster(spot.fallen), spot.x, spot.z, spot.yaw + Math.PI / 2)
    const along = DUMPSTER.length / 2 - DUMPSTER.width / 2
    const dx = Math.sin(spot.yaw) * along
    const dz = Math.cos(spot.yaw) * along
    // Over on its side, it lies out from where it stood.
    const off = spot.fallen ? -DUMPSTER.height / 2 : 0
    walls.addWall(
      at(spot.x + off - dx, spot.z - dz),
      at(spot.x + off + dx, spot.z + dz),
      DUMPSTER.width / 2
    )
  }
  for (const spot of carts) {
    place(buildShoppingCart(spot.fallen), spot.x, spot.z, spot.yaw)
  }
  return { group, rig, origin }
}
