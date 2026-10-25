import * as THREE from 'three'
import {
  buildPickup,
  fenceMaterial,
  gravestonePart,
  reedPart,
  TREE_FORMS,
  TREE_SPECIES,
  treeParts,
} from './assets.ts'
import {
  CABBAGE_SEED,
  DISH_CABBAGE_SEED,
  PINE_CABBAGE_SEED,
  placeCabbages,
  placeCabbagesAround,
  placeDishCabbages,
} from './cabbages.ts'
import { CONFIG } from './config.ts'
import {
  pointInPolygon,
  pointSegmentDistance,
  polygonBounds,
  unitToWorld,
} from './coords.ts'
import { CIGARETTE_IDS, contentsOf } from './items.ts'
import { CABBAGE_PATCH, landmarkWorldPositions } from './landmarks.ts'
import { mulberry32, range } from './rng.ts'
import type { TreeSpecies } from './assets.ts'
import type { Geo, HeightAt, Metres, UnitPoint, XZ } from './interfaces.ts'
import type { PickupKind } from './items.ts'
import type { Rng } from './rng.ts'
import type { FuelPoint, Pickup } from './world.ts'

// What is scattered over the valley from the survey: the woods, the
// wetland reeds, the graveyards and the pickups. buildWorld (world.ts)
// calls these in order on one seeded rng, so each draws after the last in
// the same state, and the mask keeps the trees off the roads and water.

const PACK_SEED = 0xc16a7e

interface OccupancyMask {
  blocked(u: number, v: number): boolean
}

// A 512×512 occupancy mask over the unit square marking roads and water, so
// trees never grow through either.
export function buildMask(
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

// Worn mud (mudMaterial): strips draped on the terrain, every row of the
// strip at most MUD_STEP along from the last so it follows the ground, and
// gathered into one mesh. u runs across a strip from one edge to the
// other and v along it, a tile every MUD_TILE_LENGTH metres. Mud sits

// Two-octave value noise so the woods gather into stands instead of a uniform
// sprinkle; Bull Valley is oak groves between open fields.
function woodsNoise(u: number, v: number): number {
  const value = (x: number, y: number) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    return (
      cellHash(ix, iy) * (1 - sx) * (1 - sy) +
      cellHash(ix + 1, iy) * sx * (1 - sy) +
      cellHash(ix, iy + 1) * (1 - sx) * sy +
      cellHash(ix + 1, iy + 1) * sx * sy
    )
  }
  return value(u * 13, v * 13) * 0.65 + value(u * 31 + 7, v * 31 + 3) * 0.35
}

function cellHash(ix: number, iy: number): number {
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453
  return s - Math.floor(s)
}

// How common each kind of tree is: white oak above all, then hickory,
// the old oak-hickory woods of McHenry County, with ash, elm, pine and a
// few spruce among them.
const SPECIES_WEIGHTS: Record<TreeSpecies, number> = {
  whiteOak: 0.34,
  hickory: 0.18,
  ash: 0.13,
  elm: 0.12,
  pine: 0.15,
  spruce: 0.08,
}
// Stands are cells this many to the unit square's side (~250 m in the
// 15 km frame); most trees in a cell are its kind, the rest any kind.
const SPECIES_CELLS = 60
const STAND_SHARE = 0.7

function speciesAt(roll: number): TreeSpecies {
  let left = roll
  for (const species of TREE_SPECIES) {
    left -= SPECIES_WEIGHTS[species]
    if (left < 0) return species
  }
  return 'whiteOak'
}

// A scatter tree's kind, from where it stands alone: it draws nothing from
// the rng, so the reeds, graves and pickups after the woods stay put.
export function treeSpeciesAt(u: number, v: number): TreeSpecies {
  const ix = Math.floor(u * SPECIES_CELLS)
  const iy = Math.floor(v * SPECIES_CELLS)
  const own = cellHash(u * 7919.3 + 0.5, v * 6271.7 + 0.25)
  return own < STAND_SHARE
    ? speciesAt(cellHash(ix + 101, iy + 37))
    : speciesAt(cellHash(u * 4253.1, v * 9133.9))
}

// A tree placed by hand rather than scattered: where it stands and its
// shape, as buildTrees draws a scatter tree.
export interface PlantedTree extends XZ {
  species: TreeSpecies
  trunkH: number
  canopyH: number
  canopyR: number
  yaw: number
  tint: number
}

export function buildTrees(
  geo: Pick<Geo, 'reserves'>,
  metres: Metres,
  heightAt: HeightAt,
  mask: OccupancyMask,
  rng: Rng,
  keepOut: (x: number, z: number) => boolean,
  planted: readonly PlantedTree[] = []
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

  // Every candidate draws its shape, kept or not, so the rng reaches the
  // reeds, graves and pickups after it in the same state either way.
  const trees = candidates.flatMap(([u, v]) => {
    const { x, z } = unitToWorld(u, v, metres)
    const tree: PlantedTree = {
      x,
      z,
      species: treeSpeciesAt(u, v),
      trunkH: range(rng, 2.2, 4.2),
      canopyH: range(rng, 4, 8),
      canopyR: range(rng, 1.5, 3),
      yaw: rng() * Math.PI * 2,
      tint: rng(),
    }
    return keepOut(x, z) ? [] : [tree]
  })
  // The trees placed by hand (the lone pine) draw nothing from the rng.
  trees.push(...planted)
  // One trunk and one canopy mesh a kind, each sized to its own trees.
  const group = new THREE.Group()
  const dummy = new THREE.Object3D()
  const tint = new THREE.Color()
  for (const species of TREE_SPECIES) {
    const kind = trees.filter((tree) => tree.species === species)
    if (kind.length === 0) continue
    const form = TREE_FORMS[species]
    const parts = treeParts(species)
    const trunks = new THREE.InstancedMesh(
      parts.trunk.geometry,
      parts.trunk.material,
      kind.length
    )
    const canopies = new THREE.InstancedMesh(
      parts.canopy.geometry,
      parts.canopy.material,
      kind.length
    )
    const canopyLow = new THREE.Color(form.low)
    const canopyHigh = new THREE.Color(form.high)
    kind.forEach(({ x, z, trunkH, canopyH, canopyR, yaw, tint: t }, i) => {
      const y = heightAt(x, z)
      const h = trunkH * form.trunk
      const r = canopyR * form.radius
      dummy.position.set(x, y, z)
      dummy.rotation.set(0, yaw, 0)
      dummy.scale.set(1, h, 1)
      dummy.updateMatrix()
      trunks.setMatrixAt(i, dummy.matrix)
      dummy.position.set(x, y + h * form.seat, z)
      dummy.scale.set(r, canopyH * form.height, r)
      dummy.updateMatrix()
      canopies.setMatrixAt(i, dummy.matrix)
      canopies.setColorAt(i, tint.copy(canopyLow).lerp(canopyHigh, t))
    })
    trunks.instanceMatrix.needsUpdate = true
    canopies.instanceMatrix.needsUpdate = true
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true
    trunks.name = `${species}-trunks`
    canopies.name = `${species}-canopies`
    group.add(trunks, canopies)
  }
  group.name = 'trees'
  return group
}

// The poles are bucketed into square tiles, one InstancedMesh per part per
// tile, so frustum culling (which bounds each mesh by its instances) skips
// the tiles behind and beside you. One mesh across the whole valley would

export function buildReeds(
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

export function buildGraveyards(
  geo: Pick<Geo, 'graveyards'>,
  metres: Metres,
  heightAt: HeightAt,
  rng: Rng
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'graveyards'
  const stones: UnitPoint[] = []
  for (const yard of geo.graveyards) {
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
  return group
}

export function buildPickups(
  geo: Pick<Geo, 'bbox' | 'reserves' | 'wetland'>,
  metres: Metres,
  heightAt: HeightAt,
  fuelPoints: readonly FuelPoint[],
  dishSpots: readonly XZ[],
  pine: { at: XZ; grave: XZ } | null,
  rng: Rng,
  loot: readonly (XZ & {
    kind: PickupKind
    count: number
    within?: readonly XZ[]
  })[] = [],
  // Where nothing is left lying (the moat's grounds).
  keepOut: (x: number, z: number) => boolean = () => false
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
  ): Pickup | null => {
    if (keepOut(x, z)) return null
    const mesh = buildPickup(kind, seed)
    mesh.position.set(x, heightAt(x, z), z)
    mesh.rotation.y = yaw
    group.add(mesh)
    const pickup: Pickup = { kind, count, mesh, x, z, taken: false }
    pickups.push(pickup)
    return pickup
  }
  // A full pack waits at every fuel station inside the survey square.
  // Brand, yaw, and stick layout draw from their own seed so the world
  // scatter after this loop never shifts.
  const packRng = mulberry32(PACK_SEED)
  for (const station of fuelPoints) {
    const kind = CIGARETTE_IDS[Math.floor(packRng() * CIGARETTE_IDS.length)]
    place(
      station.x + range(rng, -4, 4),
      station.z + range(rng, -4, 4),
      kind,
      contentsOf(kind),
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
  const [patch] = landmarkWorldPositions(geo.bbox, metres, [CABBAGE_PATCH])
  const cabbages = placeCabbages(geo, mulberry32(CABBAGE_SEED), {
    patch: { u: patch.u, v: patch.v },
    metres,
  })
  for (const spot of cabbages) {
    const { x, z } = unitToWorld(spot.u, spot.v, metres)
    place(x, z, 'cabbage', 1)
  }
  // And a few in the shade under the dishes behind the spawn Citgo.
  for (const { x, z } of placeDishCabbages(
    dishSpots,
    mulberry32(DISH_CABBAGE_SEED)
  )) {
    place(x, z, 'cabbage', 1)
  }
  // And a patch round the lone pine among them, clear of the pedestals and
  // Spunky's grave.
  if (pine) {
    const { cabbages: patch, grave } = CONFIG.lonePine
    const avoid = [
      ...dishSpots.map((d) => ({ ...d, r: patch.clear })),
      { ...pine.grave, r: grave.clear },
    ]
    for (const { x, z } of placeCabbagesAround(
      pine.at,
      mulberry32(PINE_CABBAGE_SEED),
      patch,
      avoid
    )) {
      place(x, z, 'cabbage', 1)
    }
  }
  // Last, what Bull Valley Plaza leaves lying every day (stripmall.ts
  // STRIP_MALL.loot), each turned its own way, drawing on no seed.
  loot.forEach((spot, i) => {
    const pickup = place(
      spot.x,
      spot.z,
      spot.kind,
      spot.count,
      0x9100 + i,
      i * 2.3
    )
    // A spot kept out places nothing, so its ring goes on no pickup.
    if (pickup && spot.within) pickup.within = spot.within
  })
  return { group, pickups }
}

// The valley starts at a gas station: deterministically, the fuel point nearest
// the midpoint of the longest road named for Bull Valley, which keeps the
// spawn in the old survey's neighborhood. Falls back to the point nearest the
