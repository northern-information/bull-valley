import * as THREE from 'three'
import {
  boundaryMaterial,
  buildLandmarkBeacon,
  buildPickup,
  fenceMaterial,
  FUEL_LAYOUT,
  fuelStationParts,
  gravestonePart,
  makeGlowSprite,
  POLE_ARM_DROP,
  poleParts,
  reedPart,
  roadMaterial,
  TREE_CANOPY_HIGH,
  TREE_CANOPY_LOW,
  treeParts,
  waterMaterial,
} from './assets.ts'
import { CABBAGE_SEED, placeCabbages } from './cabbages.ts'
import {
  pointInPolygon,
  pointSegmentDistance,
  polygonBounds,
  unitToWorld,
} from './coords.ts'
import { CIGARETTE_IDS } from './items.ts'
import {
  KEEP,
  landmarkWorldPositions,
  CABBAGE_STAND as STAND_NAME,
} from './landmarks.ts'
import { mulberry32, range } from './rng.ts'
import type {
  Geo,
  HeightAt,
  Metres,
  Road,
  UnitPoint,
  XZ,
} from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { Rng } from './rng.ts'

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

export interface FuelPoint extends XZ {
  name: string
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
}

interface RoadStyle {
  width: number
  color: string
}

// A geometry and material pair from assets.ts, ready to instance.
interface MeshPart {
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
}

interface OccupancyMask {
  blocked(u: number, v: number): boolean
}

// Unlit (MeshBasicMaterial) tones — these render exactly as written, then fog.
const ROAD_STYLE: Partial<Record<string, RoadStyle>> = {
  motorway: { width: 9, color: '#343a41' },
  trunk: { width: 9, color: '#343a41' },
  primary: { width: 8, color: '#32383f' },
  secondary: { width: 7, color: '#30353c' },
  tertiary: { width: 6, color: '#2d3238' },
  residential: { width: 5, color: '#2a2f35' },
  unclassified: { width: 5, color: '#2a2f35' },
  service: { width: 3.5, color: '#332e22' },
  track: { width: 3, color: '#363023' },
}
const ROAD_DEFAULT: RoadStyle = { width: 4.5, color: '#2a2f35' }

// Accumulates flat ribbons (roads, streams) into one non-indexed geometry.
function makeRibbonAccumulator() {
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
    build(name: string): THREE.Mesh {
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
      const mesh = new THREE.Mesh(geometry, roadMaterial())
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

function buildRoads(
  geo: Pick<Geo, 'roads'>,
  metres: Metres,
  heightAt: HeightAt
): THREE.Mesh {
  const ribbons = makeRibbonAccumulator()
  for (const road of geo.roads) {
    const style = ROAD_STYLE[road.c] || ROAD_DEFAULT
    ribbons.add(
      toWorldPoints(road.p, metres, heightAt),
      style.width,
      style.color,
      0.3
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
  const streams = makeRibbonAccumulator()
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

// Utility poles pace the named roads — rural Illinois telegraphy.
function buildPoles(
  geo: Pick<Geo, 'roads'>,
  metres: Metres,
  heightAt: HeightAt,
  rng: Rng
): THREE.Group {
  const POLE_ROADS = new Set<string>([
    'primary',
    'secondary',
    'tertiary',
    'residential',
    'unclassified',
  ])
  const SPACING = 130
  const spots: XZ[] = []
  for (const road of geo.roads) {
    if (!POLE_ROADS.has(road.c) || !road.n) continue
    let carry = rng() * SPACING
    for (let i = 0; i < road.p.length - 1 && spots.length < 4000; i++) {
      const a = unitToWorld(road.p[i][0], road.p[i][1], metres)
      const b = unitToWorld(road.p[i + 1][0], road.p[i + 1][1], metres)
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      if (len === 0) continue
      while (carry < len) {
        const t = carry / len
        // Offset to the right of travel so poles sit off the shoulder.
        spots.push({
          x: a.x + dx * t - (dz / len) * 6.5,
          z: a.z + dz * t + (dx / len) * 6.5,
        })
        carry += SPACING
      }
      carry -= len
    }
  }

  const parts = poleParts()
  const poles = new THREE.InstancedMesh(
    parts.pole.geometry,
    parts.pole.material,
    spots.length
  )
  const arms = new THREE.InstancedMesh(
    parts.arm.geometry,
    parts.arm.material,
    spots.length
  )
  const dummy = new THREE.Object3D()
  for (let i = 0; i < spots.length; i++) {
    const { x, z } = spots[i]
    const y = heightAt(x, z)
    const h = range(rng, 8, 9.5)
    const yaw = rng() * Math.PI * 2
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, yaw, range(rng, -0.03, 0.03))
    dummy.scale.set(1, h, 1)
    dummy.updateMatrix()
    poles.setMatrixAt(i, dummy.matrix)
    dummy.position.set(x, y + h - POLE_ARM_DROP, z)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    arms.setMatrixAt(i, dummy.matrix)
  }
  poles.instanceMatrix.needsUpdate = true
  arms.instanceMatrix.needsUpdate = true
  const group = new THREE.Group()
  group.name = 'poles'
  group.add(poles)
  group.add(arms)
  return group
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

// Low-poly Citgo stations at every fuel point inside the frame: flat-roofed
// building, canopy over a pump island, tall lit road sign. The data keeps the
// real OSM names for the HUD; the visual is uniformly Citgo for now.
function buildFuelStations(
  geo: Pick<Geo, 'fuel'>,
  metres: Metres,
  heightAt: HeightAt,
  rng: Rng
): { group: THREE.Group; points: FuelPoint[] } {
  const group = new THREE.Group()
  group.name = 'fuel'
  const stations = geo.fuel.filter(
    (f) => f.p[0] > 0.015 && f.p[0] < 0.985 && f.p[1] > 0.015 && f.p[1] < 0.985
  )
  const count = stations.length

  const parts = fuelStationParts()
  const L = FUEL_LAYOUT
  const instanced = (part: MeshPart, n: number) =>
    new THREE.InstancedMesh(part.geometry, part.material, n)
  const buildings = instanced(parts.building, count)
  const canopies = instanced(parts.canopy, count)
  const canopyPoles = instanced(parts.canopyPole, count * 2)
  const pumps = instanced(parts.pump, count * 2)
  const signPoles = instanced(parts.signPole, count)
  const signs = instanced(parts.sign, count)

  const dummy = new THREE.Object3D()
  const points: FuelPoint[] = []
  for (let i = 0; i < count; i++) {
    const { x, z } = unitToWorld(stations[i].p[0], stations[i].p[1], metres)
    const y = heightAt(x, z)
    const yaw = rng() * Math.PI * 2
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    points.push({ x, z, name: stations[i].n })

    // Building set back behind the pumps.
    dummy.position.set(
      x - cos * L.buildingSetback,
      y,
      z - sin * L.buildingSetback
    )
    dummy.rotation.set(0, -yaw, 0)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    buildings.setMatrixAt(i, dummy.matrix)

    // Canopy and pump island at the fuel point itself.
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
      pumps.setMatrixAt(i * 2 + p, dummy.matrix)
    }

    // Tall road sign out front.
    const sx = x + cos * L.signDistance
    const sz = z + sin * L.signDistance
    const sy = heightAt(sx, sz)
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
    buildings,
    canopies,
    canopyPoles,
    pumps,
    signPoles,
    signs,
  ]) {
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
  return { group, points }
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

  group.add(buildRoads(geo, metres, heightAt))
  group.add(buildWater(geo, metres, heightAt))
  group.add(buildTrees(geo, metres, heightAt, mask, rng))
  group.add(buildPoles(geo, metres, heightAt, rng))
  group.add(buildReeds(geo, metres, heightAt, rng))
  const graveyards = buildGraveyards(geo, metres, heightAt, rng)
  group.add(graveyards.group)
  const fuel = buildFuelStations(geo, metres, heightAt, rng)
  group.add(fuel.group)
  const landmarks = buildLandmarks(geo, metres, heightAt)
  group.add(landmarks.group)
  group.add(buildBoundary(geo, metres, heightAt))
  const pickupSet = buildPickups(geo, metres, heightAt, fuel.points, rng)
  group.add(pickupSet.group)

  const spawnStation = chooseSpawnStation(geo, metres, fuel.points)
  const spawn: Spawn = spawnStation
    ? { x: spawnStation.x + 5, z: spawnStation.z + 5, yaw: 0 }
    : { x: 0, z: 0, yaw: 0 }

  return {
    group,
    pickups: pickupSet.pickups,
    graveAnchors: graveyards.anchors,
    fuelPoints: fuel.points,
    landmarks: landmarks.points,
    spawnStation,
    spawn,
  }
}
