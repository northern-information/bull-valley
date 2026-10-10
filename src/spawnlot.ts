import {
  buildBerryBush,
  buildCabbageStand,
  buildDishArray,
  buildStandDressing,
  buildTombstone,
  buildWreck,
  WRECK,
} from './assets.ts'
import { CONFIG } from './config.ts'
import { buildGron, buildMoab, MOAB_BESIDE } from './figure.ts'
import {
  cellPoint,
  mazeHeart,
  mazeToWorld,
  ringSpots,
  SHINING_MAZE,
} from './maze.ts'
import { toLocal, toWorld } from './store.ts'
import type { DishArray, Wreck } from './assets.ts'
import type { DonutField } from './donuts.ts'
import type { GronRig, MoabRig } from './figure.ts'
import type { Ground } from './ground.ts'
import type { XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { PlantedTree } from './scatter.ts'
import type { StoreOrigin } from './store.ts'
import type { Walls } from './walls.ts'
import type { BerryBush, FuelPoint, StandRig } from './world.ts'
import type * as THREE from 'three'

// What stands on and round the spawn Citgo's lot, and under every
// station's sign: where each thing goes (station-local, from CONFIG) and
// the placing of it on the ground, each blocking on `walls`. buildWorld
// (world.ts) calls these in order, so the scene and the walls keep it.

export const DONUT_TREE_CLEAR = 4
// Where each dish of the array behind a station stands (CONFIG.dishes):
// rows back from the store, columns across the lot's width, each heading
// as the station faces.
export function dishSpotsOf(station: StoreOrigin): (XZ & { yaw: number })[] {
  const { rows, cols, first, spacing } = CONFIG.dishes
  const spots: (XZ & { yaw: number })[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const [x, , z] = toWorld(station, [
        first - row * spacing,
        0,
        (col - (cols - 1) / 2) * spacing,
      ])
      spots.push({ x, z, yaw: -station.yaw })
    }
  }
  return spots
}

// Whether a world point stands inside the dish array behind a station
// (CONFIG.dishes), out to its outermost pedestals.
export function insideDishArray(
  station: StoreOrigin,
  x: number,
  z: number
): boolean {
  const { rows, cols, first, spacing } = CONFIG.dishes
  const local = toLocal(station, x, z)
  return (
    local.x <= first &&
    local.x >= first - (rows - 1) * spacing &&
    Math.abs(local.z) <= ((cols - 1) / 2) * spacing
  )
}

// The lone pine among the dishes (CONFIG.lonePine), as buildTrees draws
// it, and Spunky's grave at its foot, toward the station.
export function lonePineOf(station: StoreOrigin): {
  at: XZ
  tree: PlantedTree
  grave: XZ
} {
  const { at, trunkH, canopyH, canopyR, tint, grave } = CONFIG.lonePine
  const [x, , z] = toWorld(station, [at.x, 0, at.z])
  const toStation = Math.hypot(station.x - x, station.z - z)
  return {
    at: { x, z },
    tree: { x, z, trunkH, canopyH, canopyR, yaw: 0, tint },
    grave: {
      x: x + ((station.x - x) / toStation) * grave.offset,
      z: z + ((station.z - z) / toStation) * grave.offset,
    },
  }
}

// Trees stand at least this far, in metres, off a store's walls, so a
// canopy never pokes through its roof.
export const STORE_TREE_CLEAR = 3
export function donutFieldOf(station: StoreOrigin): DonutField {
  const { field, radius } = CONFIG.truck.donuts
  const [x, , z] = toWorld(station, [field.x, 0, field.z])
  return { x, z, radius }
}

// The berry bushes: one on the spawn station's lot by the store's corner
// (CONFIG.daily.bush, station-local), standing on the lot deck, then the
// ring round the portal at the maze's heart (CONFIG.maze.bushes), each
// its own seed so no two grow alike. Each blocks like a post; the day's
// berries are the valley's to give. Where the maze lies comes back with
// them (MazePlace, for the Caretaker).
export function plantBushes(
  group: THREE.Group,
  ground: Ground,
  walls: Walls,
  spawnStation: FuelPoint | null
): { bushes: BerryBush[]; mazePlace: MazePlace | null } {
  const bushes: BerryBush[] = []
  const plantBush = (x: number, z: number, yaw: number, seed?: number) => {
    const mesh = buildBerryBush(seed)
    mesh.position.set(x, ground.at(x, z), z)
    mesh.rotation.y = yaw
    group.add(mesh)
    walls.addWall({ x, z }, { x, z }, CONFIG.daily.bushRadius)
    const berries = mesh.getObjectByName('berries')
    bushes.push({
      id: bushes.length,
      x,
      z,
      object: mesh,
      setBerries(visible) {
        if (berries) berries.visible = visible
      },
    })
  }
  let mazePlace: MazePlace | null = null
  if (spawnStation) {
    const [bx, , bz] = toWorld(spawnStation, [
      CONFIG.daily.bush.x,
      0,
      CONFIG.daily.bush.z,
    ])
    plantBush(bx, bz, -spawnStation.yaw)
    const [mx, , mz] = toWorld(spawnStation, [
      CONFIG.maze.at.x,
      0,
      CONFIG.maze.at.z,
    ])
    const place = { x: mx, z: mz, yaw: spawnStation.yaw }
    mazePlace = place
    const { count, across, along } = CONFIG.maze.bushes
    const heart = cellPoint(
      SHINING_MAZE,
      CONFIG.maze.size,
      mazeHeart(SHINING_MAZE)
    )
    ringSpots(heart, count, across, along).forEach((spot, i) => {
      const at = mazeToWorld(place, spot)
      plantBush(at.x, at.z, i * 2.1, 0xbe221 + i + 1)
    })
  }
  return { bushes, mazePlace }
}

// Gron, a couple of strides from the bush (CONFIG.gron, station-local),
// under his raincloud and turned to the pumps. He blocks like a post.
export function placeGron(
  group: THREE.Group,
  ground: Ground,
  walls: Walls,
  spawnStation: FuelPoint | null
): { gron: XZ | null; gronRig: GronRig | null } {
  let gron: XZ | null = null
  let gronRig: GronRig | null = null
  if (spawnStation) {
    const [gx, , gz] = toWorld(spawnStation, [
      CONFIG.gron.at.x,
      0,
      CONFIG.gron.at.z,
    ])
    gronRig = buildGron()
    gronRig.group.position.set(gx, ground.at(gx, gz), gz)
    // The figure faces +Z; turn it to the pump island at the origin.
    gronRig.group.rotation.y = Math.atan2(
      spawnStation.x - gx,
      spawnStation.z - gz
    )
    group.add(gronRig.group)
    walls.addWall({ x: gx, z: gz }, { x: gx, z: gz }, CONFIG.gron.radius)
    gron = { x: gx, z: gz }
  }
  return { gron, gronRig }
}

// The Bull Valley Cabbage Stand on the spawn station's lot
// (CONFIG.stand, station-local), its front to the pump island. It
// blocks along its table.
export function placeStand(
  group: THREE.Group,
  ground: Ground,
  walls: Walls,
  spawnStation: FuelPoint | null
): StandRig | null {
  let standRig: StandRig | null = null
  if (spawnStation) {
    const [sx, , sz] = toWorld(spawnStation, [
      CONFIG.stand.at.x,
      0,
      CONFIG.stand.at.z,
    ])
    const stand = buildCabbageStand()
    stand.position.set(sx, ground.at(sx, sz), sz)
    // The stand faces +Z; turn it to the pump island at the origin.
    const yaw = Math.atan2(spawnStation.x - sx, spawnStation.z - sz)
    stand.rotation.y = yaw
    group.add(stand)
    let dressing = buildStandDressing(1)
    stand.add(dressing)
    let dressed = 1
    standRig = {
      at: { x: sx, z: sz },
      group: stand,
      setLevel(level) {
        if (level === dressed) return
        stand.remove(dressing)
        dressing = buildStandDressing(level)
        stand.add(dressing)
        dressed = level
      },
    }
    // rotation.y turns the stand's +X, its long side, to (cos, -sin).
    const dx = Math.cos(yaw) * CONFIG.stand.halfLength
    const dz = -Math.sin(yaw) * CONFIG.stand.halfLength
    walls.addWall(
      { x: sx - dx, z: sz - dz },
      { x: sx + dx, z: sz + dz },
      CONFIG.stand.radius
    )
  }
  return standRig
}

// The green BMW in its tree beside the spawn station (CONFIG.wreck,
// station-local, `wreckAt` in the world), its nose turned to `toward` and
// tipped to the slope under it. The car blocks down its length, the tree
// like a post.
export function placeWreck(
  group: THREE.Group,
  ground: Ground,
  walls: Walls,
  spawnStation: FuelPoint | null,
  wreckAt: readonly [number, number, number] | null
): Wreck | null {
  let wreck: Wreck | null = null
  if (spawnStation && wreckAt) {
    const [wx, , wz] = wreckAt
    const [tx, , tz] = toWorld(spawnStation, [
      CONFIG.wreck.toward.x,
      0,
      CONFIG.wreck.toward.z,
    ])
    // The wreck faces +Z: rotation.y turns +Z to (sin, cos).
    const yaw = Math.atan2(tx - wx, tz - wz)
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)
    const half = WRECK.length / 2
    const nose = ground.at(wx + fx * half, wz + fz * half)
    const tail = ground.at(wx - fx * half, wz - fz * half)
    wreck = buildWreck()
    wreck.group.position.set(wx, ground.at(wx, wz), wz)
    wreck.group.rotation.order = 'YXZ'
    wreck.group.rotation.set(Math.atan2(tail - nose, WRECK.length), yaw, 0)
    group.add(wreck.group)
    const dx = fx * CONFIG.wreck.halfLength
    const dz = fz * CONFIG.wreck.halfLength
    walls.addWall(
      { x: wx - dx, z: wz - dz },
      { x: wx + dx, z: wz + dz },
      CONFIG.wreck.radius
    )
    const tree = { x: wx + fx * WRECK.treeAhead, z: wz + fz * WRECK.treeAhead }
    walls.addWall(tree, tree, WRECK.treeRadius)
  }
  return wreck
}

// The dish array behind the spawn station (CONFIG.dishes), every dish on
// the ground under its pedestal, its pedestal blocking like a post.
export function placeDishes(
  group: THREE.Group,
  ground: Ground,
  walls: Walls,
  dishSpots: readonly (XZ & { yaw: number })[]
): DishArray | null {
  let dishes: DishArray | null = null
  if (dishSpots.length > 0) {
    const spots = dishSpots.map((d) => ({ ...d, y: ground.at(d.x, d.z) }))
    dishes = buildDishArray(spots)
    group.add(dishes.group)
    for (const d of spots) walls.addWall(d, d, CONFIG.dishes.radius)
  }
  return dishes
}

// Spunky's grave at the lone pine's foot, facing the station, blocking
// like a small post. Scenery: it is no shadowman's, so it is the world's
// and not the valley's (graves.ts).
export function placeSpunkysGrave(
  group: THREE.Group,
  ground: Ground,
  walls: Walls,
  spawnStation: FuelPoint | null,
  pine: { grave: XZ } | null
): void {
  if (pine && spawnStation) {
    const { heading, name, seed, radius } = CONFIG.lonePine.grave
    const stone = buildTombstone(name, seed, heading)
    const { x, z } = pine.grave
    stone.group.position.set(x, ground.at(x, z), z)
    // The stone's face looks down +Z: rotation.y turns +Z to (sin, cos).
    stone.group.rotation.y = Math.atan2(spawnStation.x - x, spawnStation.z - z)
    group.add(stone.group)
    walls.addWall(pine.grave, pine.grave, radius)
  }
}

// Moab Coldë and his horse under every station's sign (CONFIG.moab,
// station-local), the horse broadside to the pump island and Moab, his
// back to its flank, facing the island and the lot. The horse blocks
// along its spine, and Moab like a post beside it.
export function placeMoabs(
  group: THREE.Group,
  ground: Ground,
  walls: Walls,
  stations: readonly FuelPoint[]
): { moabs: XZ[]; moabRigs: MoabRig[] } {
  const moabs: XZ[] = []
  const moabRigs: MoabRig[] = []
  for (const station of stations) {
    const [mx, , mz] = toWorld(station, [CONFIG.moab.at.x, 0, CONFIG.moab.at.z])
    // Turn the rig so its +X, the way Moab faces, points at the pump
    // island at the origin: rotation.y turns +X to (cos, -sin), and +Z to
    // (sin, cos).
    const yaw = Math.atan2(-(station.z - mz), station.x - mx)
    const my = ground.at(mx, mz)
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    // The fire roots lie on the lot: heights in the rig's own space.
    const rig = buildMoab(
      (x, z) => ground.at(mx + x * cos + z * sin, mz - x * sin + z * cos) - my
    )
    rig.group.position.set(mx, my, mz)
    rig.group.rotation.y = yaw
    group.add(rig.group)
    const along = CONFIG.moab.halfLength
    const dx = Math.sin(yaw) * along
    const dz = Math.cos(yaw) * along
    walls.addWall(
      { x: mx - dx, z: mz - dz },
      { x: mx + dx, z: mz + dz },
      CONFIG.moab.radius
    )
    // The rig's yaw turns its local (x, z) to (x cos + z sin, z cos - x sin).
    const [bx, bz] = MOAB_BESIDE
    const sx = mx + bx * Math.cos(yaw) + bz * Math.sin(yaw)
    const sz = mz + bz * Math.cos(yaw) - bx * Math.sin(yaw)
    walls.addWall({ x: sx, z: sz }, { x: sx, z: sz }, CONFIG.moab.standRadius)
    moabs.push({ x: mx, z: mz })
    moabRigs.push(rig)
  }
  return { moabs, moabRigs }
}
