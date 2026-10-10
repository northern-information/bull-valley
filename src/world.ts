import * as THREE from 'three'
import { boundaryMaterial, buildLandmarkBeacon } from './assets.ts'
import { bookSights } from './booksights.ts'
import { CONFIG } from './config.ts'
import { unitToWorld } from './coords.ts'
import { buildCornMaze, mazeFrame, mazeLamps } from './cornmaze.ts'
import { Ground } from './ground.ts'
import { KEEP, landmarkWorldPositions } from './landmarks.ts'
import { buildPoles } from './poles.ts'
import { mulberry32 } from './rng.ts'
import { placeRoadside } from './roadside.ts'
import {
  buildGraveyards,
  buildMask,
  buildPickups,
  buildReeds,
  buildTrees,
} from './scatter.ts'
import {
  dishSpotsOf,
  DONUT_TREE_CLEAR,
  donutFieldOf,
  insideDishArray,
  lonePineOf,
  placeDishes,
  placeGron,
  placeMoabs,
  placeSpunkysGrave,
  placeStand,
  placeWreck,
  plantBushes,
  STORE_TREE_CLEAR,
} from './spawnlot.ts'
import { buildShelves } from './stationdisplay.ts'
import {
  buildFuelStations,
  chooseSpawnStation,
  stationLamps,
} from './stations.ts'
import {
  insideStore,
  lockerSpot,
  STORE_LAYOUT,
  toWorld,
  worldFacings,
} from './store.ts'
import { buildStreetlights } from './streetlights.ts'
import { Walls } from './walls.ts'
import { buildRoads, buildShoulders, buildWater } from './worldsurfaces.ts'
import type { DishArray, PortalRig, Wreck } from './assets.ts'
import type { Sight } from './book.ts'
import type { DonutField } from './donuts.ts'
import type { GronRig, MoabRig } from './figure.ts'
import type { Geo, HeightAt, Metres, ShopStock, XZ } from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { MazePlace } from './maze.ts'
import type { StoreOrigin, WorldFacing } from './store.ts'
import type { Streetlights } from './streetlights.ts'

export type { Streetlights } from './streetlights.ts'

// Builds every static feature of Bull Valley from the survey's geo.json:
// roads, water, wetland reeds, woods, graveyards, gas stations, landmarks,
// cabbages, the village boundary. Returns the scene group plus the gameplay
// anchors main.ts needs. Asset meshes come from assets.ts; this file places
// them.

// A world point with its ground height.
export interface WorldPoint {
  x: number
  y: number
  z: number
}

// A station's pump island, which way it faces (local +X toward the road),
// and the height its store stands on (store.ts storeBase).
export interface FuelPoint extends StoreOrigin {
  name: string
}

// The one set of stocked shelves (assets.ts buildShelfDisplay), parked at
// whichever store the player is nearest.
export interface ShelfDisplay {
  group: THREE.Group
  // Move the display to the store nearest (x, z), inside
  // CONFIG.store.displayRange, and show what is left on its shelves.
  // stocks: one per station, indexed like fuelPoints.
  update(x: number, z: number, stocks: readonly ShopStock[]): void
  // Unit `unit` of `kind` at `station` (its slot on the facing), or null
  // when the display is parked elsewhere.
  unitFor(station: number, kind: string, unit: number): THREE.Object3D | null
  // David Carlsten behind the counter, riding with the display.
  clerk: THREE.Object3D
  // The locker doors in the back room, riding with it too: what the glow
  // rings when E would open the stash.
  lockers: THREE.Object3D
}

export interface LandmarkPoint extends XZ {
  n: string
}

export interface Pickup extends XZ {
  kind: PickupKind
  count: number
  mesh: THREE.Object3D
  taken: boolean
}

export interface Spawn extends XZ {
  yaw: number
}

// What buildWorld returns: the scene group plus the gameplay anchors.
export interface World {
  group: THREE.Group
  pickups: Pickup[]
  fuelPoints: FuelPoint[]
  landmarks: LandmarkPoint[]
  // Null only when the survey has no fuel point inside the frame.
  spawnStation: FuelPoint | null
  spawn: Spawn
  // The berry bushes (one berry a day each per account, sharedworld.ts rule
  // 8): the one on the spawn station's lot, then the ring round the portal
  // at the maze's heart. None without a spawn station.
  bushes: BerryBush[]
  // Gron, beside the bush (sharedworld.ts rule 9), and his rig: the body
  // for the glow, update(t) for his rain. Null without a spawn station.
  gron: XZ | null
  gronRig: GronRig | null
  // Where David Carlsten stands behind each counter, indexed like
  // fuelPoints; the shelf display carries his body to the nearest one.
  clerks: XZ[]
  // Moab Coldë and his horse under each station's sign, indexed like
  // fuelPoints: where the horse stands, and his rig, the body for the glow
  // and update(t) for the fire.
  moabs: XZ[]
  moabRigs: MoabRig[]
  // Where E opens the lockers in each back room (store.ts lockerSpot),
  // indexed like fuelPoints.
  lockers: XZ[]
  // The Cabbage Stand on the spawn station's lot (sharedworld.ts rule 23):
  // where its middle is, the stand itself for the glow, and setLevel to
  // dress it for the raider's own level. Null without a spawn station.
  stand: StandRig | null
  // The green BMW in a tree by the spawn station, update(t) for its smoke
  // and hazards; null without a spawn station.
  wreck: Wreck | null
  // The dish array behind the spawn station, update(t) to slew it; null
  // without a spawn station.
  dishes: DishArray | null
  // What to stand on anywhere: the terrain, or the road or lot over it.
  ground: Ground
  // What stops you: the store walls and fixtures, the berry bush, Gron,
  // Moab and his horse, the wreck and its tree, the dishes, the poles and
  // lamps.
  walls: Walls
  // Every station's shelf facings in the world, indexed like fuelPoints.
  facings: WorldFacing[][]
  shelves: ShelfDisplay
  streetlights: Streetlights
  // The portal at the corn maze's heart; null without a spawn station.
  portal: MazePortal | null
  // Where the corn maze lies, for the Caretaker (caretaker.ts); null
  // without a spawn station.
  mazePlace: MazePlace | null
  // The field across the road where Matthew Marx does donuts when nobody
  // boards (donuts.ts); null without a spawn station.
  donutField: DonutField | null
  // The places of the Book of Shadows, each found by walking within its
  // reach (book.ts sightsInReach).
  sights: Sight[]
}

// One berry bush: its id (sharedworld.ts BUSHES: 0 at the spawn Citgo, then
// the maze's), where it stands, the bush itself for the glow and the
// label, and its berries shown or picked clean.
export interface BerryBush extends XZ {
  id: number
  object: THREE.Object3D
  setBerries(visible: boolean): void
}

// The Cabbage Stand (sharedworld.ts rule 23), dressed for one raider's
// level.
export interface StandRig {
  at: XZ
  group: THREE.Group
  setLevel(level: number): void
}

// The portal at the corn maze's heart: where it stands, where it puts you
// (outside the gate, facing it), and its rig, update(t) for the swirl.
export interface MazePortal {
  at: XZ
  exit: Spawn
  rig: PortalRig
}

// across the fog — magenta for the Keep.
function buildLandmarks(
  geo: Pick<Geo, 'bbox'>,
  metres: Metres,
  heightAt: HeightAt
): { group: THREE.Group; points: LandmarkPoint[] } {
  const group = new THREE.Group()
  group.name = 'landmarks'
  const marks = landmarkWorldPositions(geo.bbox, metres).filter(
    (m) => m.u > 0 && m.u < 1 && m.v > 0 && m.v < 1
  )
  const COLORS: Partial<Record<string, string>> = {
    [KEEP]: '#e879f9',
  }
  const points: LandmarkPoint[] = []
  for (const mark of marks) {
    const y = heightAt(mark.x, mark.z)
    const color = COLORS[mark.n] || '#f59e0b'
    points.push({ n: mark.n, x: mark.x, z: mark.z })
    const beacon = buildLandmarkBeacon(color)
    beacon.position.set(mark.x, y, mark.z)
    group.add(beacon)
  }
  return { group, points }
}

function buildBoundary(
  geo: Pick<Geo, 'boundary'>,
  metres: Metres,
  heightAt: HeightAt
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'boundary'
  for (const ring of geo.boundary) {
    const pts = ring.map(([u, v]) => {
      const { x, z } = unitToWorld(u, v, metres)
      return new THREE.Vector3(x, heightAt(x, z) + 0.6, z)
    })
    group.add(
      new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        boundaryMaterial()
      )
    )
  }
  return group
}

export function buildWorld(geo: Geo, heightAt: HeightAt): World {
  const metres = geo.metres
  const rng = mulberry32(0x5cad0)
  const mask = buildMask(geo, metres)
  const group = new THREE.Group()
  group.name = 'bull-valley'

  // The roads and lots lay their surfaces over the terrain and register
  // them on the ground; from there on, everything stands on ground.at.
  const ground = new Ground(heightAt)
  const walls = new Walls()
  const roads = buildRoads(geo, metres, heightAt, ground)
  roads.receiveShadow = true
  group.add(roads)
  group.add(buildShoulders(geo, metres, heightAt, ground))
  group.add(buildWater(geo, metres, heightAt))
  const fuel = buildFuelStations(geo, metres, heightAt, ground, walls)
  const shelves = buildShelves(fuel.points)
  group.add(shelves.group)
  const spawnStation = chooseSpawnStation(geo, metres, fuel.points)
  const maze = spawnStation ? mazeFrame(spawnStation) : null
  const donutField = spawnStation ? donutFieldOf(spawnStation) : null
  const wreckAt = spawnStation
    ? toWorld(spawnStation, [CONFIG.wreck.at.x, 0, CONFIG.wreck.at.z])
    : null
  const dishSpots = spawnStation ? dishSpotsOf(spawnStation) : []
  const pine = spawnStation ? lonePineOf(spawnStation) : null
  group.add(
    buildTrees(
      geo,
      metres,
      ground.at,
      mask,
      rng,
      (x, z) =>
        (maze ? maze.covers(x, z, CONFIG.maze.treeClear) : false) ||
        (donutField
          ? Math.hypot(x - donutField.x, z - donutField.z) <
            donutField.radius + DONUT_TREE_CLEAR
          : false) ||
        (wreckAt
          ? Math.hypot(x - wreckAt[0], z - wreckAt[2]) < CONFIG.wreck.treeClear
          : false) ||
        dishSpots.some(
          (d) => Math.hypot(x - d.x, z - d.z) < CONFIG.dishes.treeClear
        ) ||
        // The lone pine stands alone among the dishes.
        (spawnStation ? insideDishArray(spawnStation, x, z) : false) ||
        // No tree grows through a store or its back room.
        fuel.points.some((p) => insideStore(p, x, z, STORE_TREE_CLEAR)),
      pine ? [pine.tree] : []
    )
  )
  // The roadside draws from its own seed, so retuning the poles never moves
  // the reeds, graves or pickups that draw after it.
  const roadside = placeRoadside(geo.roads, metres, { avoid: fuel.points })
  group.add(buildPoles(roadside.poles, ground.at, walls))
  const streetlights = buildStreetlights(
    [
      ...roadside.lamps,
      ...stationLamps(fuel.points),
      ...(spawnStation && maze ? mazeLamps(maze, spawnStation) : []),
    ],
    ground,
    walls
  )
  group.add(streetlights.group)
  group.add(buildReeds(geo, metres, ground.at, rng))
  group.add(buildGraveyards(geo, metres, ground.at, rng))
  group.add(fuel.group)
  const landmarks = buildLandmarks(geo, metres, ground.at)
  group.add(landmarks.group)
  group.add(buildBoundary(geo, metres, ground.at))
  const pickupSet = buildPickups(
    geo,
    metres,
    ground.at,
    fuel.points,
    dishSpots,
    pine,
    rng
  )
  group.add(pickupSet.group)
  let portal: MazePortal | null = null
  if (spawnStation && maze) {
    const corn = buildCornMaze(maze, spawnStation, heightAt, ground, walls)
    group.add(corn.group)
    portal = corn.portal
  }

  const spawn: Spawn = spawnStation
    ? { x: spawnStation.x + 5, z: spawnStation.z + 5, yaw: 0 }
    : { x: 0, z: 0, yaw: 0 }

  // What stands on the spawn lot and under every sign (spawnlot.ts), in
  // this order, so the scene and the walls keep it.
  const { bushes, mazePlace } = plantBushes(group, ground, walls, spawnStation)
  const { gron, gronRig } = placeGron(group, ground, walls, spawnStation)
  const standRig = placeStand(group, ground, walls, spawnStation)
  const wreck = placeWreck(group, ground, walls, spawnStation, wreckAt)
  const dishes = placeDishes(group, ground, walls, dishSpots)
  placeSpunkysGrave(group, ground, walls, spawnStation, pine)
  const { moabs, moabRigs } = placeMoabs(group, ground, walls, fuel.points)

  return {
    group,
    pickups: pickupSet.pickups,
    fuelPoints: fuel.points,
    landmarks: landmarks.points,
    spawnStation,
    spawn,
    bushes,
    gron,
    gronRig,
    clerks: fuel.points.map((point) => {
      const { x, z } = STORE_LAYOUT.clerk
      const [cx, , cz] = toWorld(point, [x, 0, z])
      return { x: cx, z: cz }
    }),
    moabs,
    moabRigs,
    lockers: fuel.points.map(lockerSpot),
    stand: standRig,
    wreck,
    dishes,
    ground,
    walls,
    facings: fuel.points.map(worldFacings),
    shelves,
    streetlights,
    portal,
    mazePlace,
    donutField,
    sights: bookSights({
      stations: fuel.points,
      spawn: spawnStation,
      maze,
      portal,
      donutField,
      wreck: wreckAt ? { x: wreckAt[0], z: wreckAt[2] } : null,
      dishes: dishSpots,
      landmarks: landmarks.points,
    }),
  }
}
