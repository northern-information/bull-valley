import * as THREE from 'three'
import { mudMaterial, roadMaterial, waterMaterial } from './assets.ts'
import { unitToWorld } from './coords.ts'
import { MUD_TILE_LENGTH } from './mudart.ts'
import { roadWidth } from './roadside.ts'
import type { Ground } from './ground.ts'
import type { Geo, HeightAt, Metres, UnitPoint, XZ } from './interfaces.ts'
import type { WorldPoint } from './world.ts'

// The surfaces laid over the terrain: the roads and their muddy shoulders,
// the water, and the accumulators that gather ribbons, patches and mud
// strips into one mesh each. Every surface something stands on registers
// on the Ground as it is drawn, so what is drawn and what things stand on
// never drift apart (world.ts).

// The road tones: unlit, these render exactly as written, then fog; the
// lights add over them (roadMaterial in assets.ts). Widths are roadside.ts's, which the poles and lamps stand clear of.
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
export const ROAD_LIFT = 0.3
export const LOT_LIFT = 0.28

// A rectangular patch (a lot) for makeRibbonAccumulator's addPatch: `along`
// runs from x0 to x1 on the local axis (cos, sin) through (x, z),
// `halfWidth` spans the perpendicular, and the grid samples its own height
// every `step`.
export interface PatchSpec {
  x: number
  z: number
  cos: number
  sin: number
  x0: number
  x1: number
  halfWidth: number
  step: number
  heightAt: HeightAt
  color: THREE.ColorRepresentation
  lift: number
}

// Accumulates flat ribbons (roads, streams) and patches (lots) into one
// non-indexed geometry. Every surface it draws also registers on `ground`,
// so what is drawn and what things stand on can never drift apart. Pass
// null only for a surface nobody stands on, like a stream.
export function makeRibbonAccumulator(ground: Ground | null) {
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
      // Wound anticlockwise from above, so each face's front is up and a
      // lit material (roadMaterial) takes the light from above.
      for (let i = 0; i < points.length - 1; i++) {
        const quad = [left[i], left[i + 1], right[i], right[i + 1]]
        for (const v of [
          quad[0],
          quad[1],
          quad[2],
          quad[1],
          quad[3],
          quad[2],
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
    addPatch({
      x,
      z,
      cos,
      sin,
      x0,
      x1,
      halfWidth,
      step,
      heightAt,
      color,
      lift,
    }: PatchSpec) {
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

export const MUD_LIFT = 0.24
const MUD_STEP = 15
// A road's muddy shoulder: this wide off each edge, its inner edge tucked
// this far under the road so the fray never shows a gap.
const SHOULDER_WIDTH = 1.8
const SHOULDER_TUCK = 0.5

export function makeMudAccumulator(terrain: HeightAt) {
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  return {
    // A strip along `line`, its two edges at signed offsets `from` and
    // `to` off the line (positive to the line's right, looking along it).
    strip(line: readonly XZ[], from: number, to: number) {
      const points: XZ[] = []
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i]
        const b = line[i + 1]
        const n = Math.max(
          1,
          Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / MUD_STEP)
        )
        for (let k = 0; k < n; k++) {
          points.push({
            x: a.x + ((b.x - a.x) * k) / n,
            z: a.z + ((b.z - a.z) * k) / n,
          })
        }
      }
      points.push(line[line.length - 1])
      if (points.length < 2) return
      let along = 0
      for (let i = 0; i < points.length; i++) {
        const a = points[Math.max(0, i - 1)]
        const b = points[Math.min(points.length - 1, i + 1)]
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
        // The right-hand normal, looking along the line.
        const rx = -(b.z - a.z) / len
        const rz = (b.x - a.x) / len
        if (i > 0) {
          const p = points[i - 1]
          along += Math.hypot(points[i].x - p.x, points[i].z - p.z)
        }
        for (const [offset, u] of [
          [from, 0],
          [to, 1],
        ]) {
          const x = points[i].x + rx * offset
          const z = points[i].z + rz * offset
          positions.push(x, terrain(x, z) + MUD_LIFT, z)
          uvs.push(u, along / MUD_TILE_LENGTH)
        }
        if (i === 0) continue
        const v = positions.length / 3 - 4
        index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3)
      }
    },
    build(name: string): THREE.Mesh {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(positions), 3)
      )
      geometry.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(uvs), 2)
      )
      const normals = new Float32Array(positions.length)
      for (let i = 0; i < normals.length; i += 3) normals[i + 1] = 1
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
      geometry.setIndex(index)
      const mesh = new THREE.Mesh(geometry, mudMaterial())
      mesh.name = name
      return mesh
    },
  }
}

// A line moved `offset` to its right (looking along it), each point along

function offsetLine(line: readonly XZ[], offset: number): XZ[] {
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)]
    const b = line[Math.min(line.length - 1, i + 1)]
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
    return {
      x: p.x - ((b.z - a.z) / len) * offset,
      z: p.z + ((b.x - a.x) / len) * offset,
    }
  })
}

// A muddy shoulder off both edges of every road, registered on the ground

export function buildShoulders(
  geo: Pick<Geo, 'roads'>,
  metres: Metres,
  terrain: HeightAt,
  ground: Ground
): THREE.Mesh {
  const mud = makeMudAccumulator(terrain)
  for (const road of geo.roads) {
    if (road.p.length < 2) continue
    const line = road.p.map(([u, v]) => unitToWorld(u, v, metres))
    const half = roadWidth(road.c) / 2
    const middle = half + SHOULDER_WIDTH / 2
    mud.strip(line, half - SHOULDER_TUCK, half + SHOULDER_WIDTH)
    mud.strip(line, -half - SHOULDER_WIDTH, -half + SHOULDER_TUCK)
    for (const side of [-1, 1]) {
      ground.addTrail(offsetLine(line, side * middle), SHOULDER_WIDTH, MUD_LIFT)
    }
  }
  return mud.build('shoulders')
}

// Roads ride the terrain at their centreline heights; each one registers

export function buildRoads(
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

export function buildWater(
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
