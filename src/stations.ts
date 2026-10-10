import * as THREE from 'three'
import {
  FUEL_LAYOUT,
  fuelStationParts,
  lotMaterial,
  makeGlowSprite,
} from './assets.ts'
import { projectOnSegment, unitToWorld } from './coords.ts'
import { roadWidth } from './roadside.ts'
import { STORE_LAYOUT, storeBase, storeWalls, toWorld } from './store.ts'
import { LOT_LIFT, makeRibbonAccumulator } from './worldsurfaces.ts'
import type { Ground } from './ground.ts'
import type { Geo, HeightAt, Metres, Road, XZ } from './interfaces.ts'
import type { LampSpot } from './roadside.ts'
import type { Walls } from './walls.ts'
import type { FuelPoint } from './world.ts'

// A geometry and material pair from assets.ts, ready to instance.
interface MeshPart {
  name: string
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
}

// The closest point on any road centreline to (x, z), with that road's
// paved width. Null when the survey has no roads.
function nearestRoadside(
  roads: readonly Road[],
  metres: Metres,
  x: number,
  z: number
): { x: number; z: number; dist: number; width: number } | null {
  let best: { x: number; z: number; dist: number; width: number } | null = null
  for (const road of roads) {
    const width = roadWidth(road.c)
    for (let i = 0; i < road.p.length - 1; i++) {
      const a = unitToWorld(road.p[i][0], road.p[i][1], metres)
      const b = unitToWorld(road.p[i + 1][0], road.p[i + 1][1], metres)
      const p = projectOnSegment(x, z, a.x, a.z, b.x, b.z)
      if (best && p.dist >= best.dist) continue
      best = { x: p.x, z: p.y, dist: p.dist, width }
    }
  }
  return best
}

// Low-poly Citgo stations at every fuel point inside the frame: a walk-in
// store, canopy over a pump island, tall lit road sign, and an asphalt lot
// between them and the road. Each station faces its nearest road, with the
// pump island FUEL_LAYOUT.roadEdgeDistance back from the road's edge and
// the store behind it: the OSM fuel point only says which road and roughly
// where along it. Each store's floor registers on the ground and its walls
// on `walls`. The returned points are the pump islands, where the truck
// parks nearby. The data keeps the real OSM names for

export function buildFuelStations(
  geo: Pick<Geo, 'fuel' | 'roads'>,
  metres: Metres,
  heightAt: HeightAt,
  ground: Ground,
  walls: Walls
): { group: THREE.Group; points: FuelPoint[] } {
  const group = new THREE.Group()
  group.name = 'fuel'
  const stations = geo.fuel.filter(
    (f) => f.p[0] > 0.015 && f.p[0] < 0.985 && f.p[1] > 0.015 && f.p[1] < 0.985
  )
  const count = stations.length

  const parts = fuelStationParts()
  const L = FUEL_LAYOUT
  const instanced = (part: MeshPart, n: number) => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, n)
    mesh.name = part.name
    return mesh
  }
  const store = parts.store.map((part) => instanced(part, count))
  const canopies = instanced(parts.canopy, count)
  const canopyPoles = instanced(parts.canopyPole, count * 2)
  const pumps = parts.pump.map((part) => instanced(part, count * 2))
  const canopyLights = instanced(parts.canopyLight, count * 2)
  const cansPer = L.trashCans.length
  const trashCans = parts.trashCan.map((part) =>
    instanced(part, count * cansPer)
  )
  const signPoles = instanced(parts.signPole, count)
  const signs = instanced(parts.sign, count)
  const lots = makeRibbonAccumulator(ground)

  const dummy = new THREE.Object3D()
  const points: FuelPoint[] = []
  for (let i = 0; i < count; i++) {
    const at = unitToWorld(stations[i].p[0], stations[i].p[1], metres)
    const road = nearestRoadside(geo.roads, metres, at.x, at.z)
    // Local +X points at the road. With no road to face, the station stays
    // on its fuel point facing +X.
    let yaw = 0
    let x = at.x
    let z = at.z
    // From the pump island to the road centreline.
    let setback = L.roadEdgeDistance
    if (road && road.dist > 0) {
      yaw = Math.atan2(road.z - at.z, road.x - at.x)
      setback = road.width / 2 + L.roadEdgeDistance
      x = road.x - Math.cos(yaw) * setback
      z = road.z - Math.sin(yaw) * setback
    }
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)

    // The lot: asphalt draped on the terrain from the building front to the
    // road centreline, just under the road ribbon, so the two meet with the
    // seam hidden under the road. Drawing it registers it on the ground,
    // so everything placed after stands on its surface.
    lots.addPatch({
      x,
      z,
      cos,
      sin,
      x0: L.lot.back,
      x1: setback,
      halfWidth: L.lot.halfWidth,
      step: 3,
      heightAt,
      color: L.lotColor,
      lift: LOT_LIFT,
    })
    const y = ground.at(x, z)
    const storeY = storeBase({ x, z, yaw }, y, heightAt)
    const origin: FuelPoint = { x, z, yaw, y: storeY, name: stations[i].n }
    points.push(origin)

    // The store behind the pumps: its parts are already in station-local
    // space, so every one takes the pump island's matrix, raised to stand
    // level over the slope. Its floor is a flat deck at the slab top, and
    // its walls and fixtures block.
    dummy.position.set(x, storeY, z)
    dummy.rotation.set(0, -yaw, 0)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    for (const mesh of store) mesh.setMatrixAt(i, dummy.matrix)
    ground.addFloor(
      x,
      z,
      cos,
      sin,
      STORE_LAYOUT.back,
      STORE_LAYOUT.front,
      STORE_LAYOUT.halfWidth,
      storeY + STORE_LAYOUT.floor
    )
    for (const wall of storeWalls(origin)) {
      walls.addWall(wall.a, wall.b, wall.half)
    }

    // Canopy and pump island at the fuel point itself, on the lot.
    dummy.position.set(x, y, z)
    dummy.updateMatrix()
    canopies.setMatrixAt(i, dummy.matrix)
    for (let p = 0; p < 2; p++) {
      const off = p === 0 ? L.canopyPoleOffset : -L.canopyPoleOffset
      dummy.position.set(x - sin * off, y, z + cos * off)
      dummy.updateMatrix()
      canopyPoles.setMatrixAt(i * 2 + p, dummy.matrix)
      const pumpOff = p === 0 ? L.pumpOffset : -L.pumpOffset
      dummy.position.set(x - sin * pumpOff, y, z + cos * pumpOff)
      dummy.updateMatrix()
      for (const mesh of pumps) mesh.setMatrixAt(i * 2 + p, dummy.matrix)
      canopyLights.setMatrixAt(i * 2 + p, dummy.matrix)
    }
    // Trash cans, each on its own ground sample.
    L.trashCans.forEach(([tx, , tz], t) => {
      const cx = x + cos * tx - sin * tz
      const cz = z + sin * tx + cos * tz
      dummy.position.set(cx, ground.at(cx, cz), cz)
      dummy.updateMatrix()
      for (const mesh of trashCans) {
        mesh.setMatrixAt(i * cansPer + t, dummy.matrix)
      }
    })

    // Tall road sign out front, at the lot's corner.
    const sx = x + cos * L.signDistance - sin * L.signAlong
    const sz = z + sin * L.signDistance + cos * L.signAlong
    const sy = ground.at(sx, sz)
    dummy.position.set(sx, sy, sz)
    dummy.updateMatrix()
    signPoles.setMatrixAt(i, dummy.matrix)
    dummy.position.set(sx, sy + L.signHeight, sz)
    dummy.updateMatrix()
    signs.setMatrixAt(i, dummy.matrix)
    const sprite = makeGlowSprite(parts.glow, L.glowScale)
    sprite.position.set(sx, sy + L.signHeight, sz)
    group.add(sprite)
  }
  for (const mesh of [
    ...store,
    canopies,
    canopyPoles,
    canopyLights,
    ...pumps,
    ...trashCans,
    signPoles,
    signs,
  ]) {
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
  // Under the station lights (buildShelves) the solid parts throw shadows
  // and the building, the pumps, the cans and the lot catch them. The
  // floor, the roof, the glass and the tubes throw none.
  const noShadow = /floor|foundation|roof|window|light/
  for (const mesh of [...store, canopyPoles, ...pumps, ...trashCans]) {
    mesh.castShadow = !noShadow.test(mesh.name)
    mesh.receiveShadow = true
  }
  const lotMesh = lots.build('lots', lotMaterial())
  lotMesh.receiveShadow = true
  group.add(lotMesh)
  return { group, points }
}

// Sodium lamps on every station's lot, in station-local space (local +X
// toward the road): one at each road-side corner, its arm over the road,
// and one at each back corner beside the store, its arm over the lot.

// Sodium lamps on every station's lot, in station-local space (local +X
// toward the road): one at each road-side corner, its arm over the road,
// and one at each back corner beside the store, its arm over the lot.
// Every arm reaches along local +X.
const STATION_LAMPS: readonly XZ[] = [
  { x: FUEL_LAYOUT.roadEdgeDistance - 1.5, z: FUEL_LAYOUT.lot.halfWidth - 0.5 },
  {
    x: FUEL_LAYOUT.roadEdgeDistance - 1.5,
    z: -(FUEL_LAYOUT.lot.halfWidth - 0.5),
  },
  { x: FUEL_LAYOUT.lot.back + 1, z: FUEL_LAYOUT.lot.halfWidth - 1 },
  { x: FUEL_LAYOUT.lot.back + 1, z: -(FUEL_LAYOUT.lot.halfWidth - 1) },
]

export function stationLamps(points: readonly FuelPoint[]): LampSpot[] {
  return points.flatMap((point) =>
    STATION_LAMPS.map(({ x, z }) => {
      const [wx, , wz] = toWorld(point, [x, 0, z])
      // A lamp's yaw turns its local +X to (cos, -sin); the station's
      // turns local +X to (cos, sin).
      return { x: wx, z: wz, yaw: -point.yaw }
    })
  )
}

// The station lights, in station-local space: one spot under every
// fluorescent panel, the four in the store and the two under the canopy,
// all pointing down and all throwing shadows. A panel is an area light,
// so each spot is wide and firm-edged and the neighbours overlap into an
// even ceiling glow instead of pools. Like the shelf display they ride to
// the nearest station, because a spotlight at every Citgo would cost a
// shadow pass each, every frame. Intensities are candela (Three's lights

// The valley starts at a gas station: deterministically, the fuel point nearest
// the midpoint of the longest road named for Bull Valley, which keeps the
// spawn in the old survey's neighborhood. Falls back to the point nearest the
// frame center.
export function chooseSpawnStation(
  geo: Pick<Geo, 'roads'>,
  metres: Metres,
  fuelPoints: readonly FuelPoint[]
): FuelPoint | null {
  let bestRoad: Road | null = null
  for (const road of geo.roads) {
    if (!/bull valley/i.test(road.n || '')) continue
    if (!bestRoad || road.p.length > bestRoad.p.length) bestRoad = road
  }
  let target: XZ = { x: 0, z: 0 }
  if (bestRoad) {
    const mid = bestRoad.p[Math.floor(bestRoad.p.length / 2)]
    target = unitToWorld(mid[0], mid[1], metres)
  }
  let best: { station: FuelPoint; d: number } | null = null
  for (const station of fuelPoints) {
    const d = Math.hypot(station.x - target.x, station.z - target.z)
    if (!best || d < best.d) best = { station, d }
  }
  return best ? best.station : null
}

// The donut field (CONFIG.truck.donuts, station-local) in the world. Trees
