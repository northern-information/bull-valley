import * as THREE from 'three'
import {
  artTexture,
  castShadows,
  lambert,
  layered,
  memo,
  mergeStatic,
} from './assetkit.ts'
import { JUNCTION, pipeFittings } from './moat.ts'
import { concreteArt, vineArt } from './moatart.ts'
import { mulberry32, range } from './rng.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { FireEscape, MoatPipe } from './moat.ts'

// Castle Entropy's moat as seen (moat.ts): the concrete walls cut down from
// the rim to the floor on both edges, a coping along the top of each that
// hides the cut in the terrain, the floor and the trickle of water down its
// middle, pipes (moat.ts lays them, round the fire escapes), valves and
// ribs on the walls, vines hanging down them, and
// the fire escapes in rusted iron. Everything is laid in the world (the
// moat is the terrain's, so its walls follow the rim's every rise); the
// trickle's water creeps in `update`.

export interface MoatRig {
  group: THREE.Group
  update(t: number): void
}

interface MoatBuild {
  // The two edges in the world (moat.ts moatEdges).
  island: readonly XZ[]
  outer: readonly XZ[]
  // The terrain uncut, for the top of the walls.
  raw: HeightAt
  floor: number
  stairs: readonly FireEscape[]
  // The pipes along the walls (moat.ts moatPipes).
  pipes: readonly MoatPipe[]
  trickle: readonly XZ[]
  // The island's middle, which way is in.
  middle: XZ
}

// The walls are sampled about this often along each edge, in metres.
const EVERY = 3
// Texture metres: one concrete panel this wide and tall.
const PANEL = 6

const concreteTexture = memo((id: string) => {
  const texture = artTexture(concreteArt(id))
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
})
const vineTexture = memo(() => artTexture(vineArt()))

// A box from a to b, `w` across and `h` up, its long axis a to b.
function strut(
  group: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  size: number,
  material: THREE.Material
): void {
  const length = a.distanceTo(b)
  if (length < 1e-3) return
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, length, size),
    material
  )
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize()
  )
  group.add(mesh)
}

export function buildMoat(build: MoatBuild): MoatRig {
  const group = new THREE.Group()
  group.name = 'castle-moat'
  const { raw, floor, middle } = build
  const concrete = lambert({ map: concreteTexture('#77746f') })
  // The walls and the floor are lit from whichever side they are seen.
  const face = lambert({
    map: concreteTexture('#77746f'),
    side: THREE.DoubleSide,
  })
  const coping = lambert({ map: concreteTexture('#8a877f') })
  const floorConcrete = lambert({
    map: concreteTexture('#4b4a46'),
    side: THREE.DoubleSide,
  })
  const pipe = lambert({ color: '#5a4636' })
  const pipeGrey = lambert({ color: '#55595c' })
  const valve = lambert({ color: '#7a2a1c' })
  const box = lambert({ color: '#4f5450' })
  const iron = lambert({ color: '#3b2a22' })
  const ironLight = lambert({ color: '#5a3d2c' })
  const vine = lambert({
    map: vineTexture('vine'),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  })
  const rng = mulberry32(0xe471a)

  // The stretches of the outer wall a fire escape hangs on, kept clear of
  // pipes and vines.
  const busy = build.stairs.map((stair) => ({
    a: stair.ends[0],
    b: stair.ends[1],
  }))
  const nearStair = (p: XZ, pad: number) =>
    busy.some(({ a, b }) => {
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len2 = dx * dx + dz * dz || 1
      const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2
      const cx = a.x + dx * Math.max(0, Math.min(1, t))
      const cz = a.z + dz * Math.max(0, Math.min(1, t))
      return Math.hypot(p.x - cx, p.z - cz) < pad
    })

  // One edge's wall, from `a` to `b`, its face toward the channel.
  const wall = (a: XZ, b: XZ, faceIn: boolean) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const steps = Math.max(1, Math.ceil(len / EVERY))
    const ux = (b.x - a.x) / len
    const uz = (b.z - a.z) / len
    // The face's normal, toward the channel: in toward the middle from the
    // outer edge, out away from it from the island's.
    let nx = -uz
    let nz = ux
    const mx = (a.x + b.x) / 2 - middle.x
    const mz = (a.z + b.z) / 2 - middle.z
    const toward = nx * mx + nz * mz < 0
    if (toward !== faceIn) {
      nx = -nx
      nz = -nz
    }
    const positions: number[] = []
    const uvs: number[] = []
    const tops: THREE.Vector3[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = a.x + (b.x - a.x) * t
      const z = a.z + (b.z - a.z) * t
      const top = raw(x, z)
      tops.push(new THREE.Vector3(x, top, z))
      positions.push(x, top + 0.05, z, x, floor - 0.2, z)
      const u = (len * t) / PANEL
      uvs.push(u, (top - floor) / PANEL, u, 0)
    }
    const index: number[] = []
    for (let i = 0; i < steps; i++) {
      const p = i * 2
      index.push(p, p + 1, p + 2, p + 1, p + 3, p + 2)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    )
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(index)
    geometry.computeVertexNormals()
    group.add(new THREE.Mesh(geometry, face))

    // The coping: a slab along the top, over the cut in the terrain.
    for (let i = 0; i < steps; i++) {
      const p = tops[i]
      const q = tops[i + 1]
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(p.distanceTo(q) + 0.3, 0.35, 0.9),
        coping
      )
      slab.position.set(
        (p.x + q.x) / 2 - nx * 0.3,
        (p.y + q.y) / 2 + 0.05,
        (p.z + q.z) / 2 - nz * 0.3
      )
      slab.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x)
      slab.rotation.z = Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z))
      group.add(slab)
    }

    // Ribs down the face, every so often.
    for (let d = PANEL; d < len - 2; d += PANEL * 1.5) {
      const x = a.x + ux * d
      const z = a.z + uz * d
      if (nearStair({ x, z }, 3)) continue
      const top = raw(x, z)
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, top - floor, 0.7),
        concrete
      )
      rib.position.set(x + nx * 0.3, (top + floor) / 2, z + nz * 0.3)
      rib.rotation.y = -Math.atan2(uz, ux)
      group.add(rib)
    }

    // Vines, hanging from the coping.
    for (let d = range(rng, 0, 3); d < len; d += range(rng, 1.5, 6)) {
      const x = a.x + ux * d
      const z = a.z + uz * d
      if (nearStair({ x, z }, 2.5)) continue
      const top = raw(x, z)
      const long = range(rng, 3, Math.min(22, top - floor - 1))
      const wide = range(rng, 0.8, 2.2)
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(wide, long), vine)
      strip.position.set(x + nx * 0.12, top - long / 2, z + nz * 0.12)
      strip.rotation.y = -Math.atan2(nz, nx) + Math.PI / 2
      group.add(strip)
    }
  }

  const n = build.outer.length
  for (let k = 0; k < n; k++) {
    wall(build.outer[k], build.outer[(k + 1) % n], true)
    wall(build.island[k], build.island[(k + 1) % n], false)
  }

  // The floor: a quad between each side of the island and its outer side.
  const floorGeo = new THREE.BufferGeometry()
  const fp: number[] = []
  const fu: number[] = []
  for (let k = 0; k < n; k++) {
    const quad = [
      build.island[k],
      build.outer[k],
      build.outer[(k + 1) % n],
      build.island[(k + 1) % n],
    ]
    for (const i of [0, 1, 2, 0, 2, 3]) {
      fp.push(quad[i].x, floor, quad[i].z)
      fu.push(quad[i].x / PANEL, quad[i].z / PANEL)
    }
  }
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3))
  floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2))
  floorGeo.computeVertexNormals()
  const floorMesh = new THREE.Mesh(floorGeo, floorConcrete)
  floorMesh.receiveShadow = true
  group.add(floorMesh)

  // Rubble on the floor, fallen off the walls.
  for (let i = 0; i < 60; i++) {
    const k = Math.floor(rng() * n)
    const t = rng()
    const s = range(rng, 0.15, 0.85)
    const i0 = build.island[k]
    const i1 = build.island[(k + 1) % n]
    const o0 = build.outer[k]
    const o1 = build.outer[(k + 1) % n]
    const ix = i0.x + (i1.x - i0.x) * t
    const iz = i0.z + (i1.z - i0.z) * t
    const ox = o0.x + (o1.x - o0.x) * t
    const oz = o0.z + (o1.z - o0.z) * t
    const x = ix + (ox - ix) * s
    const z = iz + (oz - iz) * s
    if (nearStair({ x, z }, 4)) continue
    const size = range(rng, 0.3, 1.6)
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(size, size * range(rng, 0.4, 0.9), size * 1.2),
      floorConcrete
    )
    chunk.position.set(x, floor + size * 0.25, z)
    chunk.rotation.set(rng(), rng() * Math.PI, rng() * 0.5)
    group.add(chunk)
  }

  // The pipes.
  for (const run of build.pipes) {
    pipeRun(
      group,
      run,
      build.stairs,
      run.grey ? pipeGrey : pipe,
      valve,
      box,
      iron
    )
  }

  // The fire escapes.
  for (const stair of build.stairs) fireEscape(group, stair, iron, ironLight)

  castShadows(group)
  mergeStatic(group)

  // The trickle: a strip of black water down the channel's middle, its
  // sheen creeping along, drawn over the floor it runs on.
  const water = layered(
    lambert({
      color: '#0d1a26',
      emissive: new THREE.Color('#0a2238'),
      emissiveIntensity: 0.6,
      map: concreteTexture('#5a7890'),
      transparent: true,
      opacity: 0.85,
    })
  )
  const line = build.trickle
  const wp: number[] = []
  const wu: number[] = []
  let along = 0
  for (let k = 0; k <= line.length; k++) {
    const p = line[k % line.length]
    const q = line[(k + 1) % line.length]
    const r = line[(k + line.length - 1) % line.length]
    const dx = q.x - r.x
    const dz = q.z - r.z
    const len = Math.hypot(dx, dz) || 1
    const side = { x: -dz / len, z: dx / len }
    const half = 0.6 + 0.25 * Math.sin(k * 2.3)
    if (k > 0) {
      const prev = line[(k - 1) % line.length]
      along += Math.hypot(p.x - prev.x, p.z - prev.z)
    }
    wp.push(
      p.x + side.x * half,
      floor + 0.04,
      p.z + side.z * half,
      p.x - side.x * half,
      floor + 0.04,
      p.z - side.z * half
    )
    wu.push(along / 4, 0, along / 4, 0.3)
  }
  const wi: number[] = []
  for (let k = 0; k < line.length; k++) {
    const p = k * 2
    wi.push(p, p + 1, p + 2, p + 1, p + 3, p + 2)
  }
  const waterGeo = new THREE.BufferGeometry()
  waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3))
  waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2))
  waterGeo.setIndex(wi)
  waterGeo.computeVertexNormals()
  water.side = THREE.DoubleSide
  group.add(new THREE.Mesh(waterGeo, water))
  // The map is shared with the walls, so the trickle creeps on a clone.
  const sheen = water.map ? water.map.clone() : null
  if (sheen) {
    sheen.wrapS = THREE.RepeatWrapping
    sheen.wrapT = THREE.RepeatWrapping
    sheen.needsUpdate = true
    water.map = sheen
  }

  const update = (t: number) => {
    if (sheen) sheen.offset.x = -t * 0.08
  }
  return { group, update }
}

// One pipe: a tube along each stretch with a knuckle at each bend, its
// brackets back to the wall and its junction box (moat.ts pipeFittings,
// clear of the fire escapes), and its valve wheel on its first stretch.
function pipeRun(
  group: THREE.Group,
  run: MoatPipe,
  stairs: readonly FireEscape[],
  material: THREE.Material,
  valve: THREE.Material,
  box: THREE.Material,
  iron: THREE.Material
): void {
  const { radius, normal } = run
  const v = (p: XZ & { y: number }) => new THREE.Vector3(p.x, p.y, p.z)
  const points = run.points.map(v)
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]
    const to = points[i + 1]
    const span = from.distanceTo(to)
    if (span < 1e-3) continue
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, span, 6),
      material
    )
    tube.position.copy(from).add(to).multiplyScalar(0.5)
    tube.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize()
    )
    group.add(tube)
    if (i > 0) {
      const knuckle = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.15, 6, 4),
        material
      )
      knuckle.position.copy(from)
      group.add(knuckle)
    }
  }
  const fittings = pipeFittings(run, stairs)
  for (const [at, wallAt] of fittings.brackets) {
    strut(group, v(at), v(wallAt), 0.12, iron)
  }
  const [from, to] = points
  if (run.valve !== null) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(radius + 0.3, 0.06, 4, 8),
      valve
    )
    wheel.position.copy(from.clone().lerp(to, run.valve))
    wheel.position.x += normal.x * (radius + 0.1)
    wheel.position.z += normal.z * (radius + 0.1)
    wheel.rotation.y = -Math.atan2(normal.z, normal.x) + Math.PI / 2
    group.add(wheel)
  }
  if (fittings.junction) {
    const junction = new THREE.Mesh(
      new THREE.BoxGeometry(JUNCTION.wide, JUNCTION.high, JUNCTION.deep),
      box
    )
    junction.position.copy(v(fittings.junction))
    junction.rotation.y = -Math.atan2(-normal.x, normal.z)
    group.add(junction)
  }
}

// One fire escape in rusted iron: each flight's stringers, treads and
// handrail, each landing's grating, its rails along the outer edge and
// across the far end (the foot's open), and the brackets that hold it to
// the wall.
function fireEscape(
  group: THREE.Group,
  stair: FireEscape,
  iron: THREE.Material,
  ironLight: THREE.Material
): void {
  const v = (p: XZ & { y: number }) => new THREE.Vector3(p.x, p.y, p.z)
  const inward = stair.inward
  for (const flight of stair.flights) {
    const a = v(flight.a)
    const b = v(flight.b)
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz) || 1
    const across = new THREE.Vector3(-dz / len, 0, dx / len).multiplyScalar(
      stair.width / 2
    )
    for (const s of [-1, 1]) {
      const off = across.clone().multiplyScalar(s)
      strut(group, a.clone().add(off), b.clone().add(off), 0.08, iron)
      // The handrail.
      const up = new THREE.Vector3(0, 0.95, 0)
      strut(
        group,
        a.clone().add(off).add(up),
        b.clone().add(off).add(up),
        0.05,
        ironLight
      )
    }
    const treads = Math.max(2, Math.ceil(Math.abs(b.y - a.y) / 0.2))
    for (let i = 0; i <= treads; i++) {
      const at = a.clone().lerp(b, i / treads)
      const tread = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.04, stair.width),
        ironLight
      )
      tread.position.copy(at)
      tread.rotation.y = -Math.atan2(dz, dx)
      group.add(tread)
    }
  }
  for (const landing of stair.landings) {
    const mid = (landing.x0 + landing.x1) / 2
    const cx = landing.x + landing.cos * mid
    const cz = landing.z + landing.sin * mid
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(
        landing.x1 - landing.x0,
        0.06,
        landing.halfWidth * 2
      ),
      ironLight
    )
    slab.position.set(cx, landing.y - 0.03, cz)
    slab.rotation.y = -Math.atan2(landing.sin, landing.cos)
    group.add(slab)
    // The outer edge's rail, and brackets down to the wall.
    const out = new THREE.Vector3(inward.x, 0, inward.z).multiplyScalar(
      landing.halfWidth
    )
    const along = new THREE.Vector3(landing.cos, 0, landing.sin).multiplyScalar(
      (landing.x1 - landing.x0) / 2
    )
    const c = new THREE.Vector3(cx, landing.y, cz)
    const outerA = c.clone().add(out).sub(along)
    const outerB = c.clone().add(out).add(along)
    const up = new THREE.Vector3(0, 1, 0)
    for (const p of [outerA, outerB]) {
      strut(group, p, p.clone().add(up), 0.05, iron)
      const wallAt = p
        .clone()
        .sub(out.clone().multiplyScalar(2))
        .add(new THREE.Vector3(0, -1.4, 0))
      strut(group, p, wallAt, 0.07, iron)
    }
    strut(group, outerA.clone().add(up), outerB.clone().add(up), 0.05, iron)
    // Across the far end, back to the wall, but at the foot.
    if (landing.open) continue
    const end = landing.far < 0 ? outerA : outerB
    const wallEnd = end.clone().sub(out.clone().multiplyScalar(2))
    strut(group, wallEnd, wallEnd.clone().add(up), 0.05, iron)
    strut(group, end.clone().add(up), wallEnd.clone().add(up), 0.05, iron)
    strut(
      group,
      end.clone().add(up.clone().multiplyScalar(0.5)),
      wallEnd.clone().add(up.clone().multiplyScalar(0.5)),
      0.04,
      iron
    )
  }
}
