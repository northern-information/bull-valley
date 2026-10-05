import * as THREE from 'three'
import {
  boundaryMaterial,
  buildBerryBush,
  buildLandmarkBeacon,
  buildPickup,
  buildShelfDisplay,
  CANOPY,
  castShadows,
  fenceMaterial,
  FUEL_LAYOUT,
  fuelStationParts,
  gravestonePart,
  lotMaterial,
  makeGlowSprite,
  POLE_ARM_DROP,
  POLE_INSULATOR_X,
  poleParts,
  poleWireAnchors,
  reedPart,
  roadMaterial,
  SODIUM,
  sodiumHaloMaterial,
  sodiumPoolMaterial,
  STREETLIGHT,
  streetlightParts,
  TREE_CANOPY_HIGH,
  TREE_CANOPY_LOW,
  treeParts,
  waterMaterial,
  WIRE_SAG,
  wireMaterial,
} from './assets.ts'
import { CABBAGE_SEED, placeCabbages } from './cabbages.ts'
import { CONFIG } from './config.ts'
import {
  pointInPolygon,
  pointSegmentDistance,
  polygonBounds,
  projectOnSegment,
  unitToWorld,
} from './coords.ts'
import { applyPose, buildFigure } from './figure.ts'
import { Ground } from './ground.ts'
import { CIGARETTE_IDS } from './items.ts'
import {
  KEEP,
  landmarkWorldPositions,
  CABBAGE_STAND as STAND_NAME,
} from './landmarks.ts'
import { samplePose } from './poses.ts'
import { mulberry32, range } from './rng.ts'
import { placeRoadside, roadWidth } from './roadside.ts'
import {
  STORE_LAYOUT,
  storeBase,
  storeCenter,
  storeWalls,
  toWorld,
  worldFacings,
} from './store.ts'
import { Walls } from './walls.ts'
import type {
  Geo,
  HeightAt,
  Metres,
  Road,
  ShopStock,
  UnitPoint,
  Vec3,
  XZ,
} from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { Rng } from './rng.ts'
import type { LampSpot, PoleSpot } from './roadside.ts'
import type { StoreOrigin, WorldFacing } from './store.ts'

const PACK_SEED = 0xc16a7e

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

export interface GraveAnchor extends XZ {
  name: string
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
  // The unit a buy of `kind` would take at `station` with `left` in stock
  // (the last one standing), or null when the display is parked elsewhere.
  unitFor(station: number, kind: string, left: number): THREE.Object3D | null
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
  graveAnchors: GraveAnchor[]
  fuelPoints: FuelPoint[]
  landmarks: LandmarkPoint[]
  // Null only when the survey has no fuel point inside the frame.
  spawnStation: FuelPoint | null
  spawn: Spawn
  // The berry bush on the spawn station's lot (one berry a day per name,
  // sharedraid.ts rule 9); null without a spawn station.
  bush: XZ | null
  // The bush itself, for the glow, and its berries shown or picked clean.
  bushObject: THREE.Object3D | null
  setBerries(visible: boolean): void
  // What to stand on anywhere: the terrain, or the road or lot over it.
  ground: Ground
  // What stops you: the store walls and fixtures, the poles and lamps.
  walls: Walls
  // Every station's shelf facings in the world, indexed like fuelPoints.
  facings: WorldFacing[][]
  shelves: ShelfDisplay
  streetlights: Streetlights
}

// A geometry and material pair from assets.ts, ready to instance.
interface MeshPart {
  name: string
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
}

interface OccupancyMask {
  blocked(u: number, v: number): boolean
}

// Unlit (MeshBasicMaterial) tones — these render exactly as written, then
// fog. Widths are roadside.ts's, which the poles and lamps stand clear of.
const ROAD_COLOR: Partial<Record<string, string>> = {
  motorway: '#343a41',
  trunk: '#343a41',
  primary: '#32383f',
  secondary: '#30353c',
  tertiary: '#2d3238',
  residential: '#2a2f35',
  unclassified: '#2a2f35',
  service: '#332e22',
  track: '#363023',
}
const ROAD_DEFAULT_COLOR = '#2a2f35'
// Roads float ROAD_LIFT over the terrain to stay clear of it; a station lot
// sits a hair lower so the road covers their overlap.
const ROAD_LIFT = 0.3
const LOT_LIFT = 0.28

// Accumulates flat ribbons (roads, streams) and patches (lots) into one
// non-indexed geometry. Every surface it draws also registers on `ground`,
// so what is drawn and what things stand on can never drift apart. Pass
// null only for a surface nobody stands on, like a stream.
function makeRibbonAccumulator(ground: Ground | null) {
  const positions: number[] = []
  const colors: number[] = []
  return {
    add(
      points: readonly WorldPoint[],
      width: number,
      color: THREE.ColorRepresentation,
      lift: number
    ) {
      if (points.length < 2) return
      ground?.addRibbon(points, width, lift)
      const c = new THREE.Color(color)
      const half = width / 2
      // Per-point direction averaged over neighbouring segments (naive miter).
      const dirs: XZ[] = []
      for (let i = 0; i < points.length; i++) {
        const a = points[Math.max(0, i - 1)]
        const b = points[Math.min(points.length - 1, i + 1)]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const len = Math.hypot(dx, dz) || 1
        dirs.push({ x: dx / len, z: dz / len })
      }
      const left = points.map((pt, i) => ({
        x: pt.x - dirs[i].z * half,
        y: pt.y + lift,
        z: pt.z + dirs[i].x * half,
      }))
      const right = points.map((pt, i) => ({
        x: pt.x + dirs[i].z * half,
        y: pt.y + lift,
        z: pt.z - dirs[i].x * half,
      }))
      for (let i = 0; i < points.length - 1; i++) {
        const quad = [left[i], left[i + 1], right[i], right[i + 1]]
        for (const v of [
          quad[0],
          quad[2],
          quad[1],
          quad[1],
          quad[2],
          quad[3],
        ]) {
          positions.push(v.x, v.y, v.z)
          colors.push(c.r, c.g, c.b)
        }
      }
    },
    // A rectangular patch (a lot) draped on the ground: `along` runs from
    // x0 to x1 on the local axis (cos, sin) through (x, z), `halfWidth`
    // spans the perpendicular, and every grid vertex samples its own
    // height, so the patch follows a slope both ways.
    addPatch(
      x: number,
      z: number,
      cos: number,
      sin: number,
      x0: number,
      x1: number,
      halfWidth: number,
      step: number,
      heightAt: HeightAt,
      color: THREE.ColorRepresentation,
      lift: number
    ) {
      const c = new THREE.Color(color)
      ground?.addPatch(x, z, cos, sin, x0, x1, halfWidth, lift)
      const nx = Math.max(1, Math.ceil((x1 - x0) / step))
      const nz = Math.max(1, Math.ceil((halfWidth * 2) / step))
      const vertex = (i: number, j: number): WorldPoint => {
        const a = x0 + ((x1 - x0) * i) / nx
        const b = -halfWidth + (halfWidth * 2 * j) / nz
        const px = x + cos * a - sin * b
        const pz = z + sin * a + cos * b
        return { x: px, y: heightAt(px, pz) + lift, z: pz }
      }
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const q = [
            vertex(i, j),
            vertex(i + 1, j),
            vertex(i, j + 1),
            vertex(i + 1, j + 1),
          ]
          for (const v of [q[0], q[2], q[1], q[1], q[2], q[3]]) {
            positions.push(v.x, v.y, v.z)
            colors.push(c.r, c.g, c.b)
          }
        }
      }
    },
    build(name: string, material: THREE.Material = roadMaterial()): THREE.Mesh {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(positions), 3)
      )
      geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(colors), 3)
      )
      const normals = new Float32Array(positions.length)
      for (let i = 0; i < normals.length; i += 3) normals[i + 1] = 1
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = name
      return mesh
    },
  }
}

function toWorldPoints(
  unitPoints: readonly UnitPoint[],
  metres: Metres,
  heightAt: HeightAt
): WorldPoint[] {
  return unitPoints.map(([u, v]) => {
    const { x, z } = unitToWorld(u, v, metres)
    return { x, y: heightAt(x, z), z }
  })
}

// A 512×512 occupancy mask over the unit square marking roads and water, so
// trees never grow through either.
function buildMask(
  geo: Pick<Geo, 'roads' | 'water'>,
  metres: Metres
): OccupancyMask {
  const N = 512
  const mask = new Uint8Array(N * N)
  const buffer = 12 // metres of clearance around road centrelines

  for (const road of geo.roads) {
    for (let i = 0; i < road.p.length - 1; i++) {
      const [au, av] = road.p[i]
      const [bu, bv] = road.p[i + 1]
      const minU = Math.min(au, bu) - buffer / metres.width
      const maxU = Math.max(au, bu) + buffer / metres.width
      const minV = Math.min(av, bv) - buffer / metres.height
      const maxV = Math.max(av, bv) + buffer / metres.height
      const i0 = Math.max(0, Math.floor(minU * N))
      const i1 = Math.min(N - 1, Math.ceil(maxU * N))
      const j0 = Math.max(0, Math.floor(minV * N))
      const j1 = Math.min(N - 1, Math.ceil(maxV * N))
      for (let j = j0; j <= j1; j++) {
        for (let k = i0; k <= i1; k++) {
          const px = ((k + 0.5) / N) * metres.width
          const py = ((j + 0.5) / N) * metres.height
          const d = pointSegmentDistance(
            px,
            py,
            au * metres.width,
            av * metres.height,
            bu * metres.width,
            bv * metres.height
          )
          if (d < buffer) mask[j * N + k] = 1
        }
      }
    }
  }

  for (const water of geo.water) {
    if (water.k !== 'area' || water.p.length < 3) continue
    const b = polygonBounds(water.p)
    const i0 = Math.max(0, Math.floor(b.minX * N))
    const i1 = Math.min(N - 1, Math.ceil(b.maxX * N))
    const j0 = Math.max(0, Math.floor(b.minY * N))
    const j1 = Math.min(N - 1, Math.ceil(b.maxY * N))
    for (let j = j0; j <= j1; j++) {
      for (let k = i0; k <= i1; k++) {
        if (pointInPolygon((k + 0.5) / N, (j + 0.5) / N, water.p)) {
          mask[j * N + k] = 1
        }
      }
    }
  }

  return {
    blocked(u: number, v: number) {
      const k = Math.max(0, Math.min(N - 1, Math.floor(u * N)))
      const j = Math.max(0, Math.min(N - 1, Math.floor(v * N)))
      return mask[j * N + k] === 1
    },
  }
}

// Roads ride the terrain at their centreline heights; each one registers
// on the ground so things stand on the road deck, not the terrain under it.
function buildRoads(
  geo: Pick<Geo, 'roads'>,
  metres: Metres,
  heightAt: HeightAt,
  ground: Ground
): THREE.Mesh {
  const ribbons = makeRibbonAccumulator(ground)
  for (const road of geo.roads) {
    const points = toWorldPoints(road.p, metres, heightAt)
    ribbons.add(
      points,
      roadWidth(road.c),
      ROAD_COLOR[road.c] ?? ROAD_DEFAULT_COLOR,
      ROAD_LIFT
    )
  }
  return ribbons.build('roads')
}

function buildWater(
  geo: Pick<Geo, 'water'>,
  metres: Metres,
  heightAt: HeightAt
): THREE.Group {
  const positions: number[] = []
  const color = new THREE.Color('#102233')
  const colors: number[] = []
  for (const water of geo.water) {
    if (water.k !== 'area' || water.p.length < 3) continue
    const pts = water.p.map(([u, v]) => {
      const { x, z } = unitToWorld(u, v, metres)
      return new THREE.Vector2(x, z)
    })
    let level = Infinity
    for (const pt of pts) level = Math.min(level, heightAt(pt.x, pt.y))
    level += 0.25
    let triangles: number[][]
    try {
      triangles = THREE.ShapeUtils.triangulateShape(pts, [])
    } catch {
      continue
    }
    for (const tri of triangles) {
      for (const idx of tri) {
        positions.push(pts[idx].x, level, pts[idx].y)
        colors.push(color.r, color.g, color.b)
      }
    }
  }
  // Nobody stands on a stream, so it stays off the ground.
  const streams = makeRibbonAccumulator(null)
  for (const water of geo.water) {
    if (water.k === 'area' || water.p.length < 2) continue
    streams.add(toWorldPoints(water.p, metres, heightAt), 2.5, '#0c1a24', 0.15)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  )
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(colors), 3)
  )
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < normals.length; i += 3) normals[i + 1] = 1
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  const mesh = new THREE.Mesh(geometry, waterMaterial())
  mesh.name = 'water'

  const group = new THREE.Group()
  group.add(mesh)
  group.add(streams.build('streams'))
  return group
}

// Two-octave value noise so the woods gather into stands instead of a uniform
// sprinkle; Bull Valley is oak groves between open fields.
function woodsNoise(u: number, v: number): number {
  const hash = (ix: number, iy: number) => {
    const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453
    return s - Math.floor(s)
  }
  const value = (x: number, y: number) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    return (
      hash(ix, iy) * (1 - sx) * (1 - sy) +
      hash(ix + 1, iy) * sx * (1 - sy) +
      hash(ix, iy + 1) * (1 - sx) * sy +
      hash(ix + 1, iy + 1) * sx * sy
    )
  }
  return value(u * 13, v * 13) * 0.65 + value(u * 31 + 7, v * 31 + 3) * 0.35
}

function buildTrees(
  geo: Pick<Geo, 'reserves'>,
  metres: Metres,
  heightAt: HeightAt,
  mask: OccupancyMask,
  rng: Rng
): THREE.Group {
  const candidates: UnitPoint[] = []
  // Caps scaled for the ~15 km frame (2.6x the original survey's area).
  const CAP = 40000
  // Clustered scatter: dense inside the noise's stands, a thin sprinkle of
  // lone trees in the open.
  for (let i = 0; i < 220000 && candidates.length < CAP; i++) {
    const u = rng()
    const v = rng()
    if (mask.blocked(u, v)) continue
    if (woodsNoise(u, v) < 0.52 && rng() > 0.05) continue
    candidates.push([u, v])
  }
  // Denser stands inside the nature reserves.
  for (const reserve of geo.reserves) {
    const b = polygonBounds(reserve.p)
    for (let i = 0; i < 500 && candidates.length < CAP; i++) {
      const u = range(rng, b.minX, b.maxX)
      const v = range(rng, b.minY, b.maxY)
      if (!pointInPolygon(u, v, reserve.p)) continue
      if (mask.blocked(u, v)) continue
      candidates.push([u, v])
    }
  }

  const count = candidates.length
  const parts = treeParts()
  const trunks = new THREE.InstancedMesh(
    parts.trunk.geometry,
    parts.trunk.material,
    count
  )
  const canopies = new THREE.InstancedMesh(
    parts.canopy.geometry,
    parts.canopy.material,
    count
  )
  const dummy = new THREE.Object3D()
  const canopyLow = new THREE.Color(TREE_CANOPY_LOW)
  const canopyHigh = new THREE.Color(TREE_CANOPY_HIGH)
  const tint = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const [u, v] = candidates[i]
    const { x, z } = unitToWorld(u, v, metres)
    const y = heightAt(x, z)
    const trunkH = range(rng, 2.2, 4.2)
    const canopyH = range(rng, 4, 8)
    const canopyR = range(rng, 1.5, 3)
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, rng() * Math.PI * 2, 0)
    dummy.scale.set(1, trunkH, 1)
    dummy.updateMatrix()
    trunks.setMatrixAt(i, dummy.matrix)
    dummy.position.set(x, y + trunkH * 0.8, z)
    dummy.scale.set(canopyR, canopyH, canopyR)
    dummy.updateMatrix()
    canopies.setMatrixAt(i, dummy.matrix)
    canopies.setColorAt(i, tint.copy(canopyLow).lerp(canopyHigh, rng()))
  }
  trunks.instanceMatrix.needsUpdate = true
  canopies.instanceMatrix.needsUpdate = true
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true

  const group = new THREE.Group()
  group.add(trunks)
  group.add(canopies)
  group.name = 'trees'
  return group
}

// The poles are bucketed into square tiles, one InstancedMesh per part per
// tile, so frustum culling (which bounds each mesh by its instances) skips
// the tiles behind and beside you. One mesh across the whole valley would
// draw every pole, every frame.
const TILE = 1000

function byTile<T>(items: readonly T[], at: (item: T) => XZ): T[][] {
  const tiles = new Map<string, T[]>()
  for (const item of items) {
    const { x, z } = at(item)
    const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`
    let list = tiles.get(key)
    if (!list) {
      list = []
      tiles.set(key, list)
    }
    list.push(item)
  }
  return [...tiles.values()]
}

// Utility poles in lines along the named roads (roadside.ts), crossarms
// square to the road, three wires sagging from one pole to the next: two
// on the insulators, the telephone cable lower down. Each pole is a post
// on `walls`.
const WIRE_SEGMENTS = 4
const POLE_RADIUS = 0.25

function buildPoles(
  spots: readonly PoleSpot[],
  heightAt: HeightAt,
  walls: Walls
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'poles'
  const parts = poleParts()
  const wire = wireMaterial()
  const local = new THREE.Matrix4()
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  // A pole's frame: standing on the ground, turned and tilted.
  const frameOf = (spot: PoleSpot, out: THREE.Matrix4) =>
    out.compose(
      pos.set(spot.x, heightAt(spot.x, spot.z), spot.z),
      q.setFromEuler(euler.set(0, spot.yaw, spot.tilt)),
      one
    )
  const frame = new THREE.Matrix4()
  const nextFrame = new THREE.Matrix4()
  const anchorsOf = (spot: PoleSpot, f: THREE.Matrix4) =>
    poleWireAnchors(spot.height).map((a) =>
      new THREE.Vector3(...a).applyMatrix4(f)
    )

  const indexed = spots.map((spot, i) => ({ spot, i }))
  for (const tile of byTile(indexed, (e) => e.spot)) {
    const poles = new THREE.InstancedMesh(
      parts.pole.geometry,
      parts.pole.material,
      tile.length
    )
    const arms = new THREE.InstancedMesh(
      parts.arm.geometry,
      parts.arm.material,
      tile.length
    )
    const insulators = new THREE.InstancedMesh(
      parts.insulator.geometry,
      parts.insulator.material,
      tile.length * POLE_INSULATOR_X.length
    )
    const wirePoints: number[] = []
    tile.forEach(({ spot, i }, n) => {
      const { x, z, height: h } = spot
      frameOf(spot, frame)
      poles.setMatrixAt(n, m.copy(frame).multiply(local.makeScale(1, h, 1)))
      const armY = h - POLE_ARM_DROP
      arms.setMatrixAt(
        n,
        m.copy(frame).multiply(local.makeTranslation(0, armY, 0))
      )
      POLE_INSULATOR_X.forEach((ix, k) => {
        insulators.setMatrixAt(
          n * POLE_INSULATOR_X.length + k,
          m.copy(frame).multiply(local.makeTranslation(ix, armY, 0))
        )
      })
      walls.addWall({ x, z }, { x, z }, POLE_RADIUS)
      // The span to the next pole of the same line, filed with this pole.
      if (i + 1 >= spots.length) return
      const next = spots[i + 1]
      if (next.line !== spot.line) return
      const from = anchorsOf(spot, frame)
      const to = anchorsOf(next, frameOf(next, nextFrame))
      for (let w = 0; w < from.length; w++) {
        const a = from[w]
        const b = to[w]
        const sag = WIRE_SAG * a.distanceTo(b)
        for (let s = 0; s < WIRE_SEGMENTS; s++) {
          for (const t of [s / WIRE_SEGMENTS, (s + 1) / WIRE_SEGMENTS]) {
            wirePoints.push(
              a.x + (b.x - a.x) * t,
              a.y + (b.y - a.y) * t - 4 * sag * t * (1 - t),
              a.z + (b.z - a.z) * t
            )
          }
        }
      }
    })
    poles.instanceMatrix.needsUpdate = true
    arms.instanceMatrix.needsUpdate = true
    insulators.instanceMatrix.needsUpdate = true
    group.add(poles, arms, insulators)
    if (wirePoints.length) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(wirePoints, 3)
      )
      const wires = new THREE.LineSegments(geometry, wire)
      wires.name = 'wires'
      group.add(wires)
    }
  }
  return group
}

// Sodium streetlights at the junctions (roadside.ts). Each lamp is four
// instanced parts, a halo on one Points cloud, and a pool of orange light
// drawn on the ground under it: the roads are unlit, so no real light
// could brighten them. A few real lights ride to the lamps nearest the
// player and light what stands under them (the player, the truck, the
// trees). Each lamp is a post on `walls`.
const STREETLIGHT_GLOW = {
  // The pool on the ground: radius, rings and sectors of the fan, its
  // strength at the centre, and how far it floats over the ground: past
  // ROAD_LIFT, so a triangle reaching off a road edge still clears the deck.
  pool: { radius: 13, rings: 6, sectors: 20, alpha: 0.75, lift: 0.35 },
  halo: 7,
  // The real lights: how many, their candela and reach, and the distances
  // over which one fades out as the player walks away from its lamp.
  lights: 4,
  intensity: 60,
  distance: 22,
  fade: [45, 75] as const,
}

export interface Streetlights {
  group: THREE.Group
  // Park the real lights on the lamps nearest (x, z).
  update(x: number, z: number): void
}

function buildStreetlights(
  spots: readonly LampSpot[],
  ground: Ground,
  walls: Walls
): Streetlights {
  const G = STREETLIGHT_GLOW
  const group = new THREE.Group()
  group.name = 'streetlights'
  const meshes = streetlightParts().map((part) => {
    const mesh = new THREE.InstancedMesh(
      part.geometry,
      part.material,
      spots.length
    )
    mesh.name = part.name
    group.add(mesh)
    return mesh
  })
  const dummy = new THREE.Object3D()
  // Where each lamp's light comes from, in world space.
  const lenses: THREE.Vector3[] = []
  const haloPositions: number[] = []
  const poolPositions: number[] = []
  const poolColors: number[] = []
  const poolIndex: number[] = []
  const sodium = new THREE.Color(SODIUM)
  const { radius, rings, sectors, alpha, lift } = G.pool
  spots.forEach((spot, i) => {
    dummy.position.set(spot.x, ground.at(spot.x, spot.z), spot.z)
    dummy.rotation.set(0, spot.yaw, 0)
    dummy.updateMatrix()
    for (const mesh of meshes) mesh.setMatrixAt(i, dummy.matrix)
    walls.addWall(
      { x: spot.x, z: spot.z },
      { x: spot.x, z: spot.z },
      POLE_RADIUS
    )
    const lens = new THREE.Vector3(...STREETLIGHT.lens).applyMatrix4(
      dummy.matrix
    )
    lenses.push(lens)
    haloPositions.push(lens.x, lens.y - 0.1, lens.z)
    // A fan draped on the ground under the lens, bright at the centre and
    // gone at the rim: the centre, then `rings` rings of `sectors` vertices,
    // each shared by every triangle that meets it.
    const base = poolPositions.length / 3
    const vertex = (px: number, pz: number, k: number) => {
      poolPositions.push(px, ground.at(px, pz) + lift, pz)
      poolColors.push(sodium.r, sodium.g, sodium.b, alpha * k * k)
    }
    vertex(lens.x, lens.z, 1)
    for (let ring = 1; ring <= rings; ring++) {
      const r = (radius * ring) / rings
      for (let s = 0; s < sectors; s++) {
        const a = (Math.PI * 2 * s) / sectors
        vertex(
          lens.x + Math.cos(a) * r,
          lens.z + Math.sin(a) * r,
          1 - ring / rings
        )
      }
    }
    const at = (ring: number, s: number) =>
      ring === 0 ? base : base + 1 + (ring - 1) * sectors + (s % sectors)
    for (let s = 0; s < sectors; s++) {
      poolIndex.push(at(0, 0), at(1, s + 1), at(1, s))
      for (let ring = 1; ring < rings; ring++) {
        poolIndex.push(at(ring, s), at(ring, s + 1), at(ring + 1, s))
        poolIndex.push(at(ring + 1, s), at(ring, s + 1), at(ring + 1, s + 1))
      }
    }
  })
  for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true

  const haloGeometry = new THREE.BufferGeometry()
  haloGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(haloPositions, 3)
  )
  const halos = new THREE.Points(haloGeometry, sodiumHaloMaterial(G.halo))
  halos.name = 'streetlight-halos'
  group.add(halos)

  const poolGeometry = new THREE.BufferGeometry()
  poolGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(poolPositions, 3)
  )
  poolGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(poolColors, 4)
  )
  poolGeometry.setIndex(poolIndex)
  const pools = new THREE.Mesh(poolGeometry, sodiumPoolMaterial())
  pools.name = 'streetlight-pools'
  group.add(pools)

  // The real lights stay in the scene at zero when unused, so the shaders
  // never recompile for a changed count.
  const lights = Array.from({ length: G.lights }, () => {
    const light = new THREE.PointLight(SODIUM, 0, G.distance)
    group.add(light)
    return light
  })
  const order = lenses.map((_, i) => i)
  const dist = new Float32Array(lenses.length)
  const [near, far] = G.fade
  return {
    group,
    update(x, z) {
      for (let i = 0; i < lenses.length; i++) {
        dist[i] = Math.hypot(lenses[i].x - x, lenses[i].z - z)
      }
      order.sort((a, b) => dist[a] - dist[b])
      lights.forEach((light, k) => {
        if (k >= order.length) {
          light.intensity = 0
          return
        }
        const i = order[k]
        light.position.copy(lenses[i])
        light.position.y -= 0.3
        const fade = THREE.MathUtils.clamp((far - dist[i]) / (far - near), 0, 1)
        light.intensity = G.intensity * fade
      })
    },
  }
}

function buildReeds(
  geo: Pick<Geo, 'wetland'>,
  metres: Metres,
  heightAt: HeightAt,
  rng: Rng
): THREE.InstancedMesh {
  const spots: UnitPoint[] = []
  for (const wetland of geo.wetland) {
    if (wetland.length < 3) continue
    const b = polygonBounds(wetland)
    for (let i = 0; i < 40; i++) {
      const u = range(rng, b.minX, b.maxX)
      const v = range(rng, b.minY, b.maxY)
      if (pointInPolygon(u, v, wetland)) spots.push([u, v])
    }
  }
  const count = spots.length
  const reed = reedPart()
  const reeds = new THREE.InstancedMesh(reed.geometry, reed.material, count)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    const [u, v] = spots[i]
    const { x, z } = unitToWorld(u, v, metres)
    dummy.position.set(x, heightAt(x, z), z)
    dummy.rotation.set(range(rng, -0.12, 0.12), 0, range(rng, -0.12, 0.12))
    dummy.scale.set(1, range(rng, 1, 2), 1)
    dummy.updateMatrix()
    reeds.setMatrixAt(i, dummy.matrix)
  }
  reeds.instanceMatrix.needsUpdate = true
  reeds.name = 'reeds'
  return reeds
}

function buildGraveyards(
  geo: Pick<Geo, 'graveyards'>,
  metres: Metres,
  heightAt: HeightAt,
  rng: Rng
): { group: THREE.Group; anchors: GraveAnchor[] } {
  const group = new THREE.Group()
  group.name = 'graveyards'
  const anchors: GraveAnchor[] = []
  const stones: UnitPoint[] = []
  for (const yard of geo.graveyards) {
    const { x, z } = unitToWorld(yard.c[0], yard.c[1], metres)
    anchors.push({ x, z, name: yard.n })
    const b = polygonBounds(yard.p)
    let placed = 0
    for (let i = 0; i < 90 && placed < 24; i++) {
      const u = range(rng, b.minX, b.maxX)
      const v = range(rng, b.minY, b.maxY)
      if (!pointInPolygon(u, v, yard.p)) continue
      stones.push([u, v])
      placed++
    }
    // Faint fence line at the property edge.
    const pts = yard.p.map(([u, v]) => {
      const w = unitToWorld(u, v, metres)
      return new THREE.Vector3(w.x, heightAt(w.x, w.z) + 0.7, w.z)
    })
    const fence = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      fenceMaterial()
    )
    group.add(fence)
  }

  const stone = gravestonePart()
  const mesh = new THREE.InstancedMesh(
    stone.geometry,
    stone.material,
    stones.length
  )
  const dummy = new THREE.Object3D()
  for (let i = 0; i < stones.length; i++) {
    const [u, v] = stones[i]
    const { x, z } = unitToWorld(u, v, metres)
    dummy.position.set(x, heightAt(x, z), z)
    dummy.rotation.set(
      range(rng, -0.06, 0.06),
      rng() * Math.PI * 2,
      range(rng, -0.08, 0.08)
    )
    dummy.scale.setScalar(range(rng, 0.8, 1.3))
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
  return { group, anchors }
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
// parks nearby and a raid extracts. The data keeps the real OSM names for
// the HUD; the visual is uniformly Citgo for now.
function buildFuelStations(
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
    lots.addPatch(
      x,
      z,
      cos,
      sin,
      L.lot.back,
      setback,
      L.lot.halfWidth,
      3,
      heightAt,
      L.lotColor,
      LOT_LIFT
    )
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

// The station lights, in station-local space: one spot under every
// fluorescent panel, the four in the store and the two under the canopy,
// all pointing down and all throwing shadows. A panel is an area light,
// so each spot is wide and firm-edged and the neighbours overlap into an
// even ceiling glow instead of pools. Like the shelf display they ride to
// the nearest station, because a spotlight at every Citgo would cost a
// shadow pass each, every frame. Intensities are candela (Three's lights
// are physical).
const STATION_LIGHTS = {
  store: { color: '#e6eef0', intensity: 32, distance: 10, angle: 1.2 },
  canopy: { color: '#eef4f0', intensity: 80, distance: 14, angle: 1.05 },
  // How far below the panel's face the spot sits.
  drop: 0.08,
  penumbra: 0.3,
  shadowMap: 512,
}

interface StationLights {
  group: THREE.Group
  // Off (zero intensity) away from every store. The lights stay in the
  // scene either way, so the shaders never recompile for a changed count.
  setOn(on: boolean): void
}

function buildStationLights(): StationLights {
  const group = new THREE.Group()
  group.name = 'station-lights'
  const spots: THREE.SpotLight[] = []
  const hang = (
    at: Vec3,
    tuning: {
      color: string
      intensity: number
      distance: number
      angle: number
    }
  ) => {
    const spot = new THREE.SpotLight(
      tuning.color,
      tuning.intensity,
      tuning.distance,
      tuning.angle,
      STATION_LIGHTS.penumbra
    )
    spot.position.set(...at)
    spot.target.position.set(at[0], 0, at[2])
    spot.castShadow = true
    spot.shadow.mapSize.set(STATION_LIGHTS.shadowMap, STATION_LIGHTS.shadowMap)
    spot.shadow.camera.near = 0.2
    spot.shadow.camera.far = tuning.distance
    spot.shadow.bias = -0.001
    spot.shadow.normalBias = 0.03
    spot.userData.intensity = tuning.intensity
    group.add(spot, spot.target)
    spots.push(spot)
  }
  // One spot under each panel in the store.
  for (const panel of STORE_LAYOUT.boxes) {
    if (panel.finish !== 'light') continue
    const [x, y, z] = panel.center
    hang(
      [x, y - panel.size[1] / 2 - STATION_LIGHTS.drop, z],
      STATION_LIGHTS.store
    )
  }
  // One under each canopy tube, over its pump.
  const tubeY = CANOPY.height - CANOPY.thickness / 2 - STATION_LIGHTS.drop
  for (const z of [FUEL_LAYOUT.pumpOffset, -FUEL_LAYOUT.pumpOffset]) {
    hang([0, tubeY, z], STATION_LIGHTS.canopy)
  }
  return {
    group,
    setOn(on) {
      for (const spot of spots) {
        spot.intensity = on ? (spot.userData.intensity as number) : 0
      }
    },
  }
}

// One stocked display for every store. Building 15 stores' worth of shelf
// units would cost thousands of draw calls, and the walls and the fog hide
// every store but the one you are near, so the one display follows you:
// it parks at the store nearest the player and hides the units that store
// has sold. Each kind sells from its last unit back. David Carlsten rides
// along behind the counter, so every Citgo has its clerk, and the station
// lights ride with it.
function buildShelves(points: readonly FuelPoint[]): ShelfDisplay {
  const { group: display, slots } = buildShelfDisplay()
  display.visible = false
  const clerk = buildFigure('carlsten')
  applyPose(clerk, samplePose('stand'))
  const spot = STORE_LAYOUT.clerk
  clerk.group.position.set(spot.x, STORE_LAYOUT.floor, spot.z)
  clerk.group.rotation.y = spot.yaw
  display.add(clerk.group)
  castShadows(display)
  // The display and the lights park together at the nearest station.
  const lights = buildStationLights()
  const group = new THREE.Group()
  group.name = 'nearest-station'
  group.add(display, lights.group)
  const centers = points.map(storeCenter)
  const facings = STORE_LAYOUT.facings
  let parked = -1
  return {
    group,
    unitFor(station, kind, left) {
      if (station !== parked) return null
      const slot = slots.find(
        (s) => facings[s.facing].kind === kind && s.unit === left - 1
      )
      return slot?.object ?? null
    },
    update(x, z, stocks) {
      let best = -1
      let bestD = CONFIG.store.displayRange
      centers.forEach((c, i) => {
        const d = Math.hypot(c.x - x, c.z - z)
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      parked = best
      display.visible = best >= 0
      lights.setOn(best >= 0)
      if (best < 0) return
      const at = points[best]
      group.position.set(at.x, at.y, at.z)
      group.rotation.set(0, -at.yaw, 0)
      const stock = stocks[best] ?? {}
      for (const slot of slots) {
        const left = stock[facings[slot.facing].kind] ?? 0
        slot.object.visible = slot.unit < left
      }
    },
  }
}

// Beacon markers for the hand-placed landmarks, color-coded so they read
// across the fog — cyan for the Cabbage Stand, magenta for the Keep.
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
    [STAND_NAME]: '#22d3ee',
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

function buildPickups(
  geo: Pick<Geo, 'bbox' | 'reserves' | 'wetland'>,
  metres: Metres,
  heightAt: HeightAt,
  fuelPoints: readonly FuelPoint[],
  rng: Rng
): { group: THREE.Group; pickups: Pickup[] } {
  const group = new THREE.Group()
  group.name = 'pickups'
  const pickups: Pickup[] = []
  const place = (
    x: number,
    z: number,
    kind: PickupKind,
    count: number,
    seed?: number,
    yaw = 0
  ) => {
    const mesh = buildPickup(kind, seed)
    mesh.position.set(x, heightAt(x, z), z)
    mesh.rotation.y = yaw
    group.add(mesh)
    pickups.push({ kind, count, mesh, x, z, taken: false })
  }
  // A pack waits at every fuel station inside the survey square. Brand, yaw,
  // and stick layout draw from their own seed so the world scatter after
  // this loop never shifts.
  const packRng = mulberry32(PACK_SEED)
  for (const station of fuelPoints) {
    place(
      station.x + range(rng, -4, 4),
      station.z + range(rng, -4, 4),
      CIGARETTE_IDS[Math.floor(packRng() * CIGARETTE_IDS.length)],
      3,
      Math.floor(packRng() * 0xffffffff),
      packRng() * Math.PI * 2
    )
  }
  // Weed grows where nobody mows: the reserves and the wetland edges.
  for (const reserve of geo.reserves) {
    const b = polygonBounds(reserve.p)
    for (let i = 0; i < 30; i++) {
      const u = range(rng, b.minX, b.maxX)
      const v = range(rng, b.minY, b.maxY)
      if (!pointInPolygon(u, v, reserve.p)) continue
      const { x, z } = unitToWorld(u, v, metres)
      place(x, z, 'joints', 2)
      break
    }
  }
  for (let i = 0; i < geo.wetland.length && i < 6; i++) {
    const wetland = geo.wetland[i]
    if (wetland.length < 3) continue
    const [u, v] = wetland[Math.floor(rng() * wetland.length)]
    const { x, z } = unitToWorld(u, v, metres)
    place(x, z, 'joints', 2)
  }
  // Cabbages: seeded independently of the world scatter so re-tuning one
  // never reshuffles the other.
  const stand = landmarkWorldPositions(geo.bbox, metres).find(
    (m) => m.n === STAND_NAME
  )
  const cabbages = placeCabbages(geo, mulberry32(CABBAGE_SEED), {
    stand: stand ? { u: stand.u, v: stand.v } : undefined,
    metres,
  })
  for (const spot of cabbages) {
    const { x, z } = unitToWorld(spot.u, spot.v, metres)
    place(x, z, 'cabbage', 1)
  }
  return { group, pickups }
}

// The raid starts at a gas station: deterministically, the fuel point nearest
// the midpoint of the longest road named for Bull Valley, which keeps the
// spawn in the old survey's neighborhood. Falls back to the point nearest the
// frame center.
function chooseSpawnStation(
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
  group.add(buildRoads(geo, metres, heightAt, ground))
  group.add(buildWater(geo, metres, heightAt))
  const fuel = buildFuelStations(geo, metres, heightAt, ground, walls)
  const shelves = buildShelves(fuel.points)
  group.add(shelves.group)
  group.add(buildTrees(geo, metres, ground.at, mask, rng))
  // The roadside draws from its own seed, so retuning the poles never moves
  // the reeds, graves or pickups that draw after it.
  const roadside = placeRoadside(geo.roads, metres, { avoid: fuel.points })
  group.add(buildPoles(roadside.poles, ground.at, walls))
  const streetlights = buildStreetlights(roadside.lamps, ground, walls)
  group.add(streetlights.group)
  group.add(buildReeds(geo, metres, ground.at, rng))
  const graveyards = buildGraveyards(geo, metres, ground.at, rng)
  group.add(graveyards.group)
  group.add(fuel.group)
  const landmarks = buildLandmarks(geo, metres, ground.at)
  group.add(landmarks.group)
  group.add(buildBoundary(geo, metres, ground.at))
  const pickupSet = buildPickups(geo, metres, ground.at, fuel.points, rng)
  group.add(pickupSet.group)

  const spawnStation = chooseSpawnStation(geo, metres, fuel.points)
  const spawn: Spawn = spawnStation
    ? { x: spawnStation.x + 5, z: spawnStation.z + 5, yaw: 0 }
    : { x: 0, z: 0, yaw: 0 }

  // The berry bush, on the spawn station's lot by the store's corner
  // (CONFIG.daily.bush, station-local). It stands on the lot deck and
  // blocks like a post; the day's berry is the valley's to give.
  let bush: XZ | null = null
  let bushObject: THREE.Object3D | null = null
  if (spawnStation) {
    const [bx, , bz] = toWorld(spawnStation, [
      CONFIG.daily.bush.x,
      0,
      CONFIG.daily.bush.z,
    ])
    const mesh = buildBerryBush()
    mesh.position.set(bx, ground.at(bx, bz), bz)
    mesh.rotation.y = -spawnStation.yaw
    group.add(mesh)
    walls.addWall({ x: bx, z: bz }, { x: bx, z: bz }, CONFIG.daily.bushRadius)
    bush = { x: bx, z: bz }
    bushObject = mesh
  }
  const berries = bushObject?.getObjectByName('berries') ?? null

  return {
    group,
    pickups: pickupSet.pickups,
    graveAnchors: graveyards.anchors,
    fuelPoints: fuel.points,
    landmarks: landmarks.points,
    spawnStation,
    spawn,
    bush,
    bushObject,
    setBerries(visible) {
      if (berries) berries.visible = visible
    },
    ground,
    walls,
    facings: fuel.points.map(worldFacings),
    shelves,
    streetlights,
  }
}
