import * as THREE from 'three'
import {
  artTexture,
  castShadows,
  lambert,
  memo,
  mergeStatic,
} from './assetkit.ts'
import { crumbAt, floatAt, poleAt } from './castleyard.ts'
import { CONFIG } from './config.ts'
import { concreteArt } from './moatart.ts'
import { buildPayphone } from './payphonemodel.ts'
import { mulberry32 } from './rng.ts'
import { sodiumPoolMaterial } from './roadsideparts.ts'
import { buildClutter, buildLightTower } from './yardprops.ts'
import type { Apron, Clutter, YardPole, YardSpot } from './castleyard.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { LightTowerRig } from './yardprops.ts'

// The works round Castle Entropy's rim as seen (castleyard.ts): the
// concrete poured round the moat, its formwork still along the far edge;
// the unfinished fence of bent poles, the spans broken loose floating
// over their breaks and shedding flakes, crumbling away and coming back
// (`update`, on the shared clock); the supplies, the light towers with
// their pools of cold light, and the payphone. Laid in the world on the
// ground the site hands it.

export interface YardRig {
  group: THREE.Group
  update(t: number): void
}

interface YardBuild {
  apron: Apron
  poles: readonly YardPole[]
  clutter: readonly Clutter[]
  lamps: readonly YardSpot[]
  payphone: YardSpot
  // The terrain under the concrete, and how far over it the concrete
  // lies; the ground everything stands on once it is poured.
  raw: HeightAt
  lift: number
  at: HeightAt
}

const concreteTexture = memo((base: string) => {
  const texture = artTexture(concreteArt(base))
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
})

// The concrete is sampled about this often along each side, and across
// it this many times.
const APRON_STEP = 2
const APRON_ACROSS = 4
// One texture panel this many metres a side.
const PANEL = 4
const HALIDE = new THREE.Color('#cfdcff')

export function buildYard(build: YardBuild): YardRig {
  const group = new THREE.Group()
  group.name = 'castle-yard'
  group.add(buildApron(build))
  const poles = buildPoles(build)
  group.add(poles.group)

  const towers: LightTowerRig[] = []
  build.lamps.forEach((spot, i) => {
    const tower = buildLightTower(0x1a90 + i)
    tower.group.position.set(spot.x, build.at(spot.x, spot.z), spot.z)
    tower.group.rotation.y = -spot.yaw
    group.add(tower.group)
    towers.push(tower)
  })
  group.add(buildPools(build.lamps, build.at))
  for (const pile of build.clutter) {
    const model = buildClutter(pile.kind, pile.seed)
    model.position.set(pile.x, build.at(pile.x, pile.z), pile.z)
    model.rotation.y = -pile.yaw
    group.add(model)
  }
  const phone = buildPayphone()
  const { payphone } = build
  phone.position.set(payphone.x, build.at(payphone.x, payphone.z), payphone.z)
  phone.rotation.y = -payphone.yaw
  group.add(phone)

  const update = (t: number) => {
    poles.update(t)
    for (const tower of towers) tower.update(t)
  }
  update(0)
  return { group, update }
}

// The concrete, draped on the terrain side by side round the rim, and
// the formwork boards still staked along its outer edge.
function buildApron({ apron, raw, lift }: YardBuild): THREE.Group {
  const group = new THREE.Group()
  group.name = 'yard-apron'
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  const n = apron.inner.length
  for (let k = 0; k < n; k++) {
    const i0 = apron.inner[k]
    const i1 = apron.inner[(k + 1) % n]
    const o0 = apron.outer[k]
    const o1 = apron.outer[(k + 1) % n]
    const len = Math.hypot(o1.x - o0.x, o1.z - o0.z)
    const steps = Math.max(1, Math.ceil(len / APRON_STEP))
    const base = positions.length / 3
    for (let i = 0; i <= steps; i++) {
      const u = i / steps
      const a = { x: i0.x + (i1.x - i0.x) * u, z: i0.z + (i1.z - i0.z) * u }
      const b = { x: o0.x + (o1.x - o0.x) * u, z: o0.z + (o1.z - o0.z) * u }
      for (let j = 0; j <= APRON_ACROSS; j++) {
        const v = j / APRON_ACROSS
        const x = a.x + (b.x - a.x) * v
        const z = a.z + (b.z - a.z) * v
        positions.push(x, raw(x, z) + lift, z)
        uvs.push(x / PANEL, z / PANEL)
      }
    }
    const row = APRON_ACROSS + 1
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < APRON_ACROSS; j++) {
        const p = base + i * row + j
        index.push(p, p + 1, p + row, p + 1, p + row + 1, p + row)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  // Whichever way the winding falls, the slab faces up.
  const slab = new THREE.Mesh(
    geometry,
    lambert({ map: concreteTexture('#8a867e'), side: THREE.DoubleSide })
  )
  slab.receiveShadow = true
  slab.name = 'yard-concrete'
  group.add(slab)

  // The formwork: a board on edge along the far side, a stake now and
  // then, a board gone here and there.
  const board = lambert({ color: '#5a4630' })
  const rng = mulberry32(0xf0a7)
  rng()
  for (let k = 0; k < n; k++) {
    const a = apron.outer[k]
    const b = apron.outer[(k + 1) % n]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const steps = Math.max(1, Math.ceil(len / 2.4))
    for (let i = 0; i < steps; i++) {
      if (rng() < 0.15) continue
      const u0 = i / steps
      const u1 = (i + 1) / steps
      const p = { x: a.x + (b.x - a.x) * u0, z: a.z + (b.z - a.z) * u0 }
      const q = { x: a.x + (b.x - a.x) * u1, z: a.z + (b.z - a.z) * u1 }
      const yp = raw(p.x, p.z)
      const yq = raw(q.x, q.z)
      const length = Math.hypot(q.x - p.x, q.z - p.z)
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.3, 0.05),
        board
      )
      plank.position.set((p.x + q.x) / 2, (yp + yq) / 2 + 0.12, (p.z + q.z) / 2)
      plank.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x)
      plank.rotation.z = Math.atan2(yq - yp, length)
      group.add(plank)
      const stake = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.5, 0.06),
        board
      )
      stake.position.set(p.x, yp + 0.2, p.z)
      group.add(stake)
    }
  }
  mergeStatic(group)
  return group
}

// The fence: the poles standing, merged, and the loose spans and their
// bits, one instanced mesh each, moved every frame.
function buildPoles({ poles, at }: YardBuild): {
  group: THREE.Group
  update(t: number): void
} {
  const group = new THREE.Group()
  group.name = 'yard-poles'
  // Shades of grey, from galvanised to weathered to near white, each pole
  // its own; the loose spans and the bits they shed in a darker grey.
  const greys = ['#9a9a97', '#7e7f7d', '#b4b4b0', '#6a6b6a', '#8c8b86'].map(
    (color) => lambert({ color })
  )
  const loose = lambert({ color: '#858583' })
  const flake = lambert({ color: '#5e5e5c' })
  const radius = 0.07
  const up = new THREE.Vector3(0, 1, 0)
  const feet = poles.map((p) => new THREE.Vector3(p.x, at(p.x, p.z), p.z))
  const rod = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    material: THREE.Material
  ) => {
    const length = a.distanceTo(b)
    if (length < 0.02) return
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 5),
      material
    )
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize())
    group.add(mesh)
  }
  const point = (i: number, s: number) => {
    const p = poleAt(poles[i], s)
    return new THREE.Vector3(p.x, p.y, p.z).add(feet[i])
  }
  poles.forEach((pole, i) => {
    const material = greys[pole.seed % greys.length]
    // Its runs, from the foot (sunk a little) to the knee and on to the
    // top, less the span that broke loose.
    const cuts = [-0.3, pole.knee, pole.length]
    const piece = pole.piece
    for (let r = 0; r < 2; r++) {
      const from = cuts[r]
      const to = cuts[r + 1]
      if (piece && piece.from < to && piece.to > from) {
        rod(point(i, from), point(i, piece.from), material)
        rod(point(i, piece.to), point(i, to), material)
      } else {
        rod(point(i, from), point(i, to), material)
      }
    }
  })
  castShadows(group)
  mergeStatic(group)

  const broken = poles
    .map((pole, i) => ({ pole, foot: feet[i] }))
    .filter(({ pole }) => pole.piece !== null)
  const spans = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(radius, radius, 1, 5),
    loose,
    Math.max(1, broken.length)
  )
  spans.name = 'yard-spans'
  spans.castShadow = true
  spans.frustumCulled = false
  group.add(spans)
  // Each loose span sheds those bits always falling and the burst as it
  // crumbles.
  const { crumbs, burst } = CONFIG.castle.yard.float
  const bitsEach = crumbs + burst
  const bits = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    flake,
    Math.max(1, broken.length * bitsEach)
  )
  bits.name = 'yard-bits'
  bits.frustumCulled = false
  group.add(bits)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const tip = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const axis = new THREE.Vector3()
  const euler = new THREE.Euler()
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
  const update = (t: number) => {
    broken.forEach(({ pole, foot }, i) => {
      const piece = pole.piece!
      const f = floatAt(pole, t)
      if (f.whole <= 0) {
        spans.setMatrixAt(i, hidden)
      } else {
        const a = poleAt(pole, piece.from)
        const b = poleAt(pole, piece.to)
        dir.set(b.x - a.x, b.y - a.y, b.z - a.z)
        const length = dir.length()
        dir.normalize()
        // It tips about the level line across its lean.
        axis.set(-pole.lean.z, 0, pole.lean.x)
        tip.setFromAxisAngle(axis, f.tilt)
        q.setFromUnitVectors(up, dir).premultiply(tip)
        pos.set(
          foot.x + (a.x + b.x) / 2,
          foot.y + (a.y + b.y) / 2 + f.dy,
          foot.z + (a.z + b.z) / 2
        )
        // A crumbling span goes from both ends at once, thinning.
        const thin = 0.5 + 0.5 * f.whole
        scale.set(thin, length * f.whole, thin)
        m.compose(pos, q, scale)
        spans.setMatrixAt(i, m)
      }
      for (let j = 0; j < bitsEach; j++) {
        const slot = i * bitsEach + j
        const c = crumbAt(pole, j, t)
        if (!c) {
          bits.setMatrixAt(slot, hidden)
          continue
        }
        pos.set(foot.x + c.x, foot.y + c.y, foot.z + c.z)
        // Once on the ground it lies there till it is gone.
        const floor = at(pos.x, pos.z)
        if (pos.y < floor) pos.y = floor + c.size * 0.3
        euler.set(c.spin, c.spin * 0.7, c.spin * 0.3)
        q.setFromEuler(euler)
        scale.setScalar(c.size * (1 - c.fade * 0.6))
        m.compose(pos, q, scale)
        bits.setMatrixAt(slot, m)
      }
    })
    spans.instanceMatrix.needsUpdate = true
    bits.instanceMatrix.needsUpdate = true
  }
  return { group, update }
}

// Each light tower's pool of cold light, draped on the ground out in
// front of it, bright in the middle and gone at the rim.
function buildPools(lamps: readonly YardSpot[], at: HeightAt): THREE.Mesh {
  const positions: number[] = []
  const colors: number[] = []
  const index: number[] = []
  const radius = CONFIG.castle.yard.lamps.pool
  const rings = 6
  const sectors = 20
  for (const lamp of lamps) {
    const c: XZ = {
      x: lamp.x + Math.cos(lamp.yaw) * radius * 0.55,
      z: lamp.z + Math.sin(lamp.yaw) * radius * 0.55,
    }
    const base = positions.length / 3
    const vertex = (x: number, z: number, k: number) => {
      positions.push(x, at(x, z) + 0.35, z)
      colors.push(HALIDE.r, HALIDE.g, HALIDE.b, 0.5 * k * k)
    }
    vertex(c.x, c.z, 1)
    for (let ring = 1; ring <= rings; ring++) {
      const r = (radius * ring) / rings
      for (let s = 0; s < sectors; s++) {
        const a = (Math.PI * 2 * s) / sectors
        vertex(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, 1 - ring / rings)
      }
    }
    const idx = (ring: number, s: number) =>
      ring === 0 ? base : base + 1 + (ring - 1) * sectors + (s % sectors)
    for (let s = 0; s < sectors; s++) {
      index.push(idx(0, 0), idx(1, s + 1), idx(1, s))
      for (let ring = 1; ring < rings; ring++) {
        index.push(idx(ring, s), idx(ring, s + 1), idx(ring + 1, s))
        index.push(idx(ring + 1, s), idx(ring, s + 1), idx(ring + 1, s + 1))
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  geometry.setIndex(index)
  const pools = new THREE.Mesh(geometry, sodiumPoolMaterial())
  pools.name = 'yard-pools'
  return pools
}
