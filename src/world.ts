import * as THREE from 'three'
import { boundaryMaterial, buildLandmarkBeacon } from './assets.ts'
import { bookSights } from './booksights.ts'
import { buildCastleSite } from './castlesite.ts'
import { CONFIG } from './config.ts'
import { unitToWorld } from './coords.ts'
import { buildCornMaze, mazeFrame, mazeLamps, mazePlaceOf } from './cornmaze.ts'
import { onDriveIn } from './drivein.ts'
import { buildDriveIn } from './driveinsite.ts'
import { pondsOf } from './fishing.ts'
import { Ground } from './ground.ts'
import { onParkGrounds, parkRings } from './industrial.ts'
import { buildIndustrialSite } from './industrialsite.ts'
import { KEEP, landmarkWorldPositions } from './landmarks.ts'
import { LOOKOUT, onLookout } from './lookout.ts'
import { mazeToWorld } from './maze.ts'
import { carve, castlePlace, moatFloor, onMoatGrounds } from './moat.ts'
import { MOAT_STATION } from './moatslurms.ts'
import { nearestYard } from './npcs.ts'
import { buildCroft, buildPlaza, CROFT_TREE_CLEAR } from './plazasite.ts'
import { buildPoles } from './poles.ts'
import { placePond } from './pondsite.ts'
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
  placeRecyclers,
  placeSpunkysGrave,
  placeStand,
  placeTyler,
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
  laptopAt,
  lockerSpot,
  onStoreGrounds,
  STORE_LAYOUT,
  toWorld,
  worldFacings,
} from './store.ts'
import { buildStreetlights } from './streetlights.ts'
import {
  backRoomRing,
  inBackRoom,
  mallCenter,
  onMallGrounds,
  plazaLotMiddle,
  STRIP_MALL,
} from './stripmall.ts'
import { inUndercroft, UNDERCROFT } from './undercroft.ts'
import { Walls } from './walls.ts'
import { buildRoads, buildShoulders, buildWater } from './worldsurfaces.ts'
import type { DishArray, PortalRig, Wreck } from './assets.ts'
import type { Sight } from './book.ts'
import type { CastleSite } from './castlesite.ts'
import type { YardSpot } from './castleyard.ts'
import type { DonutField } from './donuts.ts'
import type { DriveInSite } from './driveinsite.ts'
import type { GronRig, MoabRig, TylerRig } from './figure.ts'
import type { Geo, HeightAt, Metres, ShopStock, XZ } from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { JerichoRig } from './jerichomodel.ts'
import type { MazePlace } from './maze.ts'
import type { Yard } from './npcs.ts'
import type { CroftRig, PlazaRig } from './plazasite.ts'
import type { PondRig } from './pondsite.ts'
import type { Cue } from './sfx.ts'
import type { CrawlingSlurm } from './slurmrig.ts'
import type { Feet } from './slurms.ts'
import type { StoreOrigin, WorldFacing } from './store.ts'
import type { Streetlights } from './streetlights.ts'
import type { TopiaryRig } from './topiaryrig.ts'

export type { CastleSite } from './castlesite.ts'
export type { CroftRig, PlazaRig } from './plazasite.ts'
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
  // stocks: one per station, indexed like fuelPoints. `seconds` is the
  // shared clock, for the slurms off its dripline (slurms.ts): what they
  // sound like this frame, and Carlsten's line when he says it (a curse,
  // or his thanks when a foot got the last one first); `feet`, every
  // raider on foot this client sees, squash them underfoot.
  update(
    x: number,
    z: number,
    stocks: readonly ShopStock[],
    seconds: number,
    feet: readonly Feet[]
  ): { cues: Cue[]; curse: string | null }
  // Unit `unit` of `kind` at `station` (its slot on the facing), or null
  // when the display is parked elsewhere.
  unitFor(station: number, kind: string, unit: number): THREE.Object3D | null
  // David Carlsten behind the counter, riding with the display.
  clerk: THREE.Object3D
  // Whether he is out on `station`'s lot after the slurms, with no one
  // behind the counter to talk to.
  clerkAway(station: number): boolean
  // The slurms crawling on the parked station's lot (slurmrig.ts), and one
  // caught in a jar, gone from it (sharedworld.ts rule 36).
  crawlingSlurms(): CrawlingSlurm[]
  jarSlurm(station: number, slot: number, index: number): void
  // Dev: bring the next drop of slurms at the parked station to now.
  hurrySlurms(): void
  // Dev: hold every drop off (or let them fall again), Carlsten behind
  // the counter until then.
  holdSlurms(on: boolean): void
  // The locker doors in the back room, riding with it too: what the glow
  // rings when E would open the stash.
  lockers: THREE.Object3D
  // The laptop on the bathroom's card table, riding with it too: what the
  // glow rings when E would sit down at it.
  laptop: THREE.Object3D
}

export interface LandmarkPoint extends XZ {
  n: string
}

export interface Pickup extends XZ {
  kind: PickupKind
  count: number
  // The walled room it lies in, when it does (protocol.ts
  // PickupSpec.within): taken only from inside it.
  within?: readonly XZ[]
  mesh: THREE.Object3D
  taken: boolean
}

export interface Spawn extends XZ {
  yaw: number
}

// Trees keep this far off the pond's landing.
const POND_TREE_CLEAR = 6

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
  // Tyler Etters in the back of his red Jeep beside the spawn station's
  // Moab: where he sits, and his rig, the body for the glow and update(t)
  // for his typing. Null without a spawn station.
  tyler: XZ | null
  tylerRig: TylerRig | null
  // Jericho, the Candlebearer, sat beside the payphone on Castle
  // Entropy's rim: where he sits, his rig (the body for the glow), and
  // the graveyard nearest him, which his last line pins on the raider's
  // map (npcs.ts nearestYard). Null without the castle, or the survey
  // without a graveyard.
  jericho: XZ | null
  jerichoRig: JerichoRig | null
  celestialYard: Yard | null
  // Where E opens the lockers in each back room (store.ts lockerSpot),
  // indexed like fuelPoints.
  lockers: XZ[]
  // Where E sits down at the laptop in each bathroom (store.ts laptopAt),
  // indexed like fuelPoints.
  laptops: XZ[]
  // The middle of the Citgo portal ring on each station's lot
  // (CONFIG.portal.ring; sharedworld.ts rule 28), indexed like fuelPoints:
  // where fast travel sets a raider down.
  rings: XZ[]
  // The Cabbage Stand on the spawn station's lot (sharedworld.ts rule 23):
  // where its middle is, the stand itself for the glow, and setLevel to
  // dress it for the raider's own level. Null without a spawn station.
  stand: StandRig | null
  // The recycling vending machine on every station's lot (sharedworld.ts
  // rule 33), indexed like fuelPoints: where its middle is, and the
  // machine itself for the glow.
  recyclers: RecyclerRig[]
  // The green BMW in a tree by the spawn station, update(t) for its smoke
  // and hazards; null without a spawn station.
  wreck: Wreck | null
  // The dish array behind the spawn station, update(t) to slew it; null
  // without a spawn station.
  dishes: DishArray | null
  // Bull Valley Plaza, the dead strip mall beside the spawn station,
  // update(t) for its one flickering tube and the candles, and its locked
  // back room; null without a spawn station.
  plaza: PlazaRig | null
  // The Undercroft under it, through the office's trapdoor; null without
  // the plaza.
  undercroft: CroftRig | null
  // The industrial park behind the plaza (industrialsite.ts): where its
  // lurkers keep (the hello's lurks), the floppy disk for Gron's last
  // quest, and the flicker of what still burns inside; null without a
  // spawn station.
  industrial: {
    lurks: XZ[]
    disk: { at: XZ; object: THREE.Object3D }
    update(t: number): void
  } | null
  // What to stand on anywhere: the terrain, or the road or lot over it.
  ground: Ground
  // What stops you: the store walls and fixtures, the berry bush, Gron,
  // Moab and his horse, Tyler's Jeep, the recycling machine, the wreck and its tree, the dishes, the plaza, the
  // poles and lamps.
  walls: Walls
  // Every station's shelf facings in the world, indexed like fuelPoints.
  facings: WorldFacing[][]
  shelves: ShelfDisplay
  streetlights: Streetlights
  // The portal at the corn maze's heart; null without a spawn station.
  portal: MazePortal | null
  // The lookout tower by the maze's gate; null without a spawn station.
  lookout: LookoutRig | null
  // The hedge animals in the corn maze (topiaries.ts), update(t) on the
  // valley's clock; null without a spawn station.
  topiaries: TopiaryRig | null
  // The drive-in past the maze's far end (driveinsite.ts), its film run
  // by driveinrig.ts; null without a spawn station.
  driveIn: DriveInSite | null
  // Where the corn maze lies, for the Caretaker (caretaker.ts); null
  // without a spawn station.
  mazePlace: MazePlace | null
  // The field across the road where Matthew Marx does donuts when nobody
  // boards (donuts.ts); null without a spawn station.
  donutField: DonutField | null
  // The places of the Book of Shadows, each found by walking within its
  // reach (book.ts sightsInReach).
  sights: Sight[]
  // Castle Entropy and its moat, out the spawn Citgo's door past the donut
  // field; null without
  // a spawn station.
  castle: CastleSite | null
  // The firefly ponds (fishing.ts pondsOf, sharedworld.ts rule 36), the
  // one behind the spawn Citgo and the one past the corn maze: each its
  // place and shore, the tackle box on its landing, and update(t) for the
  // fireflies. None without a spawn station or water near it.
  ponds: PondRig[]
  // The payphones (castleyard.ts payphoneSpot, sharedworld.ts rule 28):
  // the one on Castle Entropy's rim, none without the castle.
  payphones: YardSpot[]
}

// The terrain as buildWorld may cut into it (terrain.ts HeightField): the
// grid uncut, and the cut, after which every height the world asks for
// is the cut ground's.
interface Carvable {
  raw: HeightAt
  carve(cut: (raw: HeightAt) => HeightAt): void
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

export interface RecyclerRig {
  at: XZ
  group: THREE.Group
}

// The portal at the corn maze's heart: where it stands, where it puts you
// (outside the gate, facing it), and its rig, update(t) for the swirl.
export interface MazePortal {
  at: XZ
  exit: Spawn
  rig: PortalRig
  // Erwin's rose, laid before the portal (quests.ts): shown to a raider
  // whose quest says they laid it.
  rose: THREE.Object3D
}

// The lookout tower by the corn maze's gate (lookout.ts): where E climbs
// up (the ladder's foot) and where it climbs down (the top, on the deck),
// each where the climb leaves you, whether a point is up on the deck, and
// the toolbox at its foot.
export interface LookoutRig {
  foot: Spawn
  top: Spawn
  on(x: number, z: number): boolean
  // The toolbox at its foot the torches come out of (sharedworld.ts rule
  // 39).
  toolbox: XZ
}

// Beacon markers for the hand-placed landmarks, color-coded so they read
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

// Every slurm a jar could catch now (sharedworld.ts rule 36): those on the
// parked Citgo's lot and those down on the moat's floor.
export function crawlingSlurms(world: World): CrawlingSlurm[] {
  const moat = world.castle?.crawlingSlurms() ?? []
  return [...world.shelves.crawlingSlurms(), ...moat]
}

// A slurm caught in someone's jar, gone from wherever it crawled: the
// moat's by MOAT_STATION, else a Citgo's lot.
export function jarSlurm(
  world: World,
  station: number,
  slot: number,
  index: number
): void {
  if (station === MOAT_STATION) world.castle?.jarSlurm(slot, index)
  else world.shelves.jarSlurm(station, slot, index)
}

export function buildWorld(
  geo: Geo,
  heightAt: HeightAt,
  terrain: Carvable | null = null
): World {
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
  const shelves = buildShelves(fuel.points, ground)
  group.add(shelves.group)
  const spawnStation = chooseSpawnStation(geo, metres, fuel.points)
  const maze = spawnStation ? mazeFrame(spawnStation) : null
  const donutField = spawnStation ? donutFieldOf(spawnStation) : null
  // Castle Entropy's moat is cut into the terrain before anything else
  // stands, so all that does stands on the cut ground (moat.ts).
  const castlePlaceAt = spawnStation ? castlePlace(spawnStation) : null
  const raw = terrain ? terrain.raw : heightAt
  const moatAt = castlePlaceAt
    ? { place: castlePlaceAt, floor: moatFloor(raw, castlePlaceAt) }
    : null
  if (moatAt && terrain) {
    terrain.carve((uncut) => carve(uncut, moatAt.place, moatAt.floor))
  }
  const onMoat = (x: number, z: number) =>
    moatAt ? onMoatGrounds(moatAt.place, x, z) : false
  const wreckAt = spawnStation
    ? toWorld(spawnStation, [CONFIG.wreck.at.x, 0, CONFIG.wreck.at.z])
    : null
  // The ponds with the fireflies.
  const pondsAt = spawnStation
    ? pondsOf(geo.water, (u, v) => unitToWorld(u, v, metres), spawnStation)
    : []
  const dishSpots = spawnStation ? dishSpotsOf(spawnStation) : []
  const pine = spawnStation ? lonePineOf(spawnStation) : null
  const plaza = spawnStation
    ? buildPlaza(spawnStation, geo, metres, heightAt, ground, walls)
    : null
  if (plaza) group.add(plaza.group)
  const croft = plaza
    ? buildCroft(plaza, metres, heightAt, ground, walls)
    : null
  if (croft) group.add(croft.group)
  // The industrial park behind the plaza (industrialsite.ts).
  const industrial = spawnStation
    ? buildIndustrialSite(spawnStation, heightAt, ground, walls)
    : null
  if (industrial) group.add(industrial.group)
  group.add(
    buildTrees(
      geo,
      metres,
      ground.at,
      mask,
      rng,
      (x, z) =>
        (maze ? maze.covers(x, z, CONFIG.maze.treeClear) : false) ||
        (spawnStation
          ? onDriveIn(
              mazePlaceOf(spawnStation),
              { x, z },
              CONFIG.driveIn.treeClear
            )
          : false) ||
        (spawnStation
          ? onLookout(
              mazePlaceOf(spawnStation),
              { x, z },
              LOOKOUT.spread + CONFIG.maze.lookout.clear
            )
          : false) ||
        (donutField
          ? Math.hypot(x - donutField.x, z - donutField.z) <
            donutField.radius + DONUT_TREE_CLEAR
          : false) ||
        (wreckAt
          ? Math.hypot(x - wreckAt[0], z - wreckAt[2]) < CONFIG.wreck.treeClear
          : false) ||
        // A pond's landing stands in the open.
        pondsAt.some(
          (p) => Math.hypot(x - p.landing.x, z - p.landing.z) < POND_TREE_CLEAR
        ) ||
        dishSpots.some(
          (d) => Math.hypot(x - d.x, z - d.z) < CONFIG.dishes.treeClear
        ) ||
        (plaza ? onMallGrounds(plaza.origin, x, z, STORE_TREE_CLEAR) : false) ||
        (croft
          ? inUndercroft(croft.rig.place, { x, z }, CROFT_TREE_CLEAR)
          : false) ||
        (industrial
          ? onParkGrounds(industrial.origin, x, z, CONFIG.industrial.treeClear)
          : false) ||
        // The lone pine stands alone among the dishes.
        (spawnStation ? insideDishArray(spawnStation, x, z) : false) ||
        onMoat(x, z) ||
        // No tree grows through a store or its back room.
        fuel.points.some((p) => onStoreGrounds(p, x, z, STORE_TREE_CLEAR)),
      pine ? [pine.tree] : []
    )
  )
  // The roadside draws from its own seed, so retuning the poles never moves
  // the reeds, graves or pickups that draw after it.
  const roadside = placeRoadside(geo.roads, metres, {
    avoid: [
      ...fuel.points,
      ...(plaza
        ? [mallCenter(plaza.origin), plazaLotMiddle(plaza.origin)]
        : []),
    ],
  })
  group.add(buildPoles(roadside.poles, ground.at, walls))
  const streetlights = buildStreetlights(
    [
      ...roadside.lamps,
      ...stationLamps(fuel.points),
      ...(spawnStation && maze ? mazeLamps(maze, spawnStation) : []),
      ...(industrial ? industrial.lamps : []),
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
    rng,
    plaza
      ? [
          ...STRIP_MALL.loot.map((spot) => {
            const [x, , z] = toWorld(plaza.origin, [spot.x, 0, spot.z])
            const loot = { x, z, kind: spot.kind, count: spot.count }
            // What lies in the office is the office's alone.
            return inBackRoom(plaza.origin, x, z)
              ? { ...loot, within: backRoomRing(plaza.origin) }
              : loot
          }),
          // And under it, the Undercroft's.
          ...(croft
            ? UNDERCROFT.loot.map((spot) => ({
                ...mazeToWorld(croft.rig.place, spot),
                kind: spot.kind,
                count: spot.count,
              }))
            : []),
          // And the industrial park's, building by building.
          ...(industrial ? industrial.loot : []),
        ]
      : [],
    onMoat
  )
  group.add(pickupSet.group)
  let portal: MazePortal | null = null
  let lookout: LookoutRig | null = null
  let topiaries: TopiaryRig | null = null
  if (spawnStation && maze) {
    const corn = buildCornMaze(maze, spawnStation, heightAt, ground, walls)
    group.add(corn.group)
    portal = corn.portal
    lookout = corn.lookout
    topiaries = corn.topiaries
  }
  const driveIn = spawnStation
    ? buildDriveIn(mazePlaceOf(spawnStation), heightAt, ground, walls)
    : null
  if (driveIn) group.add(driveIn.group)

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
  const recyclers = placeRecyclers(group, ground, walls, fuel.points)
  const { tyler, tylerRig } = placeTyler(group, ground, walls, spawnStation)
  const castle = moatAt
    ? buildCastleSite(moatAt.place, raw, moatAt.floor, ground, walls)
    : null
  if (castle) group.add(castle.group)
  const ponds = pondsAt.map((at) => placePond(at, ground, walls))
  for (const pond of ponds) group.add(pond.group)

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
    tyler,
    tylerRig,
    jericho: castle ? { x: castle.jericho.x, z: castle.jericho.z } : null,
    jerichoRig: castle ? castle.jerichoRig : null,
    celestialYard: castle
      ? nearestYard(
          castle.jericho,
          geo.graveyards.map((yard) => ({
            ...unitToWorld(yard.c[0], yard.c[1], metres),
            name: yard.n,
          }))
        )
      : null,
    lockers: fuel.points.map(lockerSpot),
    laptops: fuel.points.map(laptopAt),
    rings: fuel.points.map((point) => {
      const { ring } = CONFIG.portal
      const [x, , z] = toWorld(point, [ring.x, 0, ring.z])
      return { x, z }
    }),
    stand: standRig,
    recyclers,
    wreck,
    dishes,
    plaza: plaza ? plaza.rig : null,
    undercroft: croft ? croft.rig : null,
    industrial: industrial
      ? {
          lurks: industrial.lurks,
          disk: industrial.disk,
          update: (t) => industrial.update(t),
        }
      : null,
    ground,
    walls,
    facings: fuel.points.map(worldFacings),
    shelves,
    streetlights,
    portal,
    lookout,
    topiaries,
    driveIn,
    mazePlace,
    donutField,
    sights: bookSights({
      stations: fuel.points,
      spawn: spawnStation,
      maze,
      portal,
      mazePlace,
      donutField,
      wreck: wreckAt ? { x: wreckAt[0], z: wreckAt[2] } : null,
      dishes: dishSpots,
      plaza: plaza ? mallCenter(plaza.origin) : null,
      undercroft: croft ? croft.rig.place : null,
      industrial: industrial ? parkRings(industrial.origin) : [],
      landmarks: landmarks.points,
      castle: castle ? castle.middle : null,
    }),
    castle,
    ponds,
    payphones: castle ? [castle.payphone] : [],
  }
}
