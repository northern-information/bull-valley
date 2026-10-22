import * as THREE from 'three'
import {
  artTexture,
  castShadows,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  memo,
  mergeStatic,
  setMotion,
} from './assetkit.ts'
import { CLUTTER_SIZE } from './castleyard.ts'
import { concreteArt } from './moatart.ts'
import { mulberry32, range } from './rng.ts'
import type { ClutterKind } from './castleyard.ts'

// The building supplies left lying round Castle Entropy's rim
// (castleyard.ts yardClutter) and the light towers over them: stacked
// I-beams on timber, crates, heaps of broken concrete with rebar through
// them, a cable spool, culvert pipes, a pallet of cement bags; each built
// inside its kind's footprint (CLUTTER_SIZE), its length along +x, its
// origin on the ground at its middle, `seed` making each its own. The
// light tower stands on its trailer with its lamps out along +x.

const concreteTexture = memo((base: string) => {
  const texture = artTexture(concreteArt(base))
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
})

const STEEL = '#5a4a3e'
const RUST = '#6b3a22'
const TIMBER = '#6a5236'
const CRATE = '#8a6c44'
const CRATE_DARK = '#5e4628'
const SPOOL = '#7a5a34'
const CABLE = '#1e1e1e'
const BAG = '#b9b09a'
const BAG_DARK = '#8f8670'

function box(
  group: THREE.Object3D,
  material: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  ry = 0
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.rotation.y = ry
  group.add(mesh)
  return mesh
}

// An I-beam along x: two flanges and the web, its foot at y.
function iBeam(
  group: THREE.Object3D,
  material: THREE.Material,
  length: number,
  x: number,
  y: number,
  z: number
) {
  const flange = 0.32
  const depth = 0.4
  const t = 0.05
  box(group, material, length, t, flange, x, y + t / 2, z)
  box(group, material, length, t, flange, x, y + depth - t / 2, z)
  box(group, material, length, depth - 2 * t, t, x, y + depth / 2, z)
}

function beams(group: THREE.Group, rng: () => number) {
  const { length, half } = CLUTTER_SIZE.beams
  const steel = lambert({ color: STEEL })
  const rust = lambert({ color: RUST })
  const timber = lambert({ color: TIMBER })
  const layers = 2 + Math.floor(rng() * 2)
  let y = 0
  for (let layer = 0; layer < layers; layer++) {
    // Dunnage across, then the beams side by side.
    for (const x of [-length * 0.32, length * 0.32]) {
      box(group, timber, 0.16, 0.12, half * 2 - 0.1, x, y + 0.06, 0)
    }
    y += 0.12
    const count = 3 - (layer === layers - 1 ? Math.floor(rng() * 2) : 0)
    for (let i = 0; i < count; i++) {
      const z = (i - (count - 1) / 2) * 0.38
      const long = length * range(rng, 0.82, 0.98)
      iBeam(group, rng() < 0.5 ? rust : steel, long, (rng() - 0.5) * 0.4, y, z)
    }
    y += 0.4
  }
  // One slid off, lying askew on the ground beside the stack.
  if (rng() < 0.6) {
    const fallen = new THREE.Group()
    iBeam(fallen, rust, length * 0.7, 0, 0, 0)
    fallen.position.set(0, 0, half - 0.2)
    fallen.rotation.y = range(rng, -0.25, 0.25)
    fallen.rotation.x = Math.PI / 2
    fallen.position.y = 0.16
    group.add(fallen)
  }
}

function crates(group: THREE.Group, rng: () => number) {
  const { length, half } = CLUTTER_SIZE.crates
  const wood = lambert({ color: CRATE })
  const dark = lambert({ color: CRATE_DARK })
  const crate = (s: number, x: number, y: number, z: number, ry: number) => {
    const c = new THREE.Group()
    box(c, wood, s, s, s, 0, s / 2, 0)
    // Battens round the edges, a brace across each face.
    for (const e of [-1, 1]) {
      box(c, dark, s + 0.04, 0.08, 0.08, 0, s / 2 + (e * s) / 2, (e * s) / 2)
      box(c, dark, 0.08, 0.08, s + 0.04, (e * s) / 2, s / 2 + (e * s) / 2, 0)
    }
    const brace = box(c, dark, 0.06, s * 1.3, 0.06, 0, s / 2, s / 2 + 0.02)
    brace.rotation.z = Math.PI / 4
    c.position.set(x, y, z)
    c.rotation.y = ry
    group.add(c)
    return s
  }
  const big = range(rng, 1.1, 1.4)
  crate(big, -length / 2 + big / 2 + 0.1, 0, 0, range(rng, -0.1, 0.1))
  const mid = range(rng, 0.8, 1)
  crate(mid, length / 2 - mid / 2 - 0.1, 0, half - mid / 2 - 0.1, rng())
  if (rng() < 0.7) {
    crate(range(rng, 0.6, 0.8), -length / 2 + big / 2, big, 0, rng())
  }
  if (rng() < 0.5) crate(0.6, length / 2 - 0.5, 0, -half + 0.4, rng())
}

function rubble(group: THREE.Group, rng: () => number) {
  const { length, half } = CLUTTER_SIZE.rubble
  const concrete = lambert({ map: concreteTexture('#7e7a72') })
  const grey = lambert({ color: '#6f6b64' })
  const rust = lambert({ color: RUST })
  const chunks = 9 + Math.floor(rng() * 6)
  for (let i = 0; i < chunks; i++) {
    const u = rng()
    const v = rng()
    // A heap: the big pieces low in the middle, small ones round them.
    const r = Math.hypot(u - 0.5, v - 0.5) * 2
    const size = range(rng, 0.35, 0.9) * (1 - r * 0.5)
    const chunk = new THREE.Mesh(
      rng() < 0.5
        ? new THREE.DodecahedronGeometry(size * 0.6, 0)
        : new THREE.BoxGeometry(size, size * 0.6, size * 1.3),
      rng() < 0.6 ? concrete : grey
    )
    chunk.position.set(
      (u - 0.5) * (length - 0.6),
      size * 0.25 + (1 - r) * 0.35,
      (v - 0.5) * (half * 2 - 0.4)
    )
    chunk.rotation.set(rng() * 3, rng() * 3, rng() * 3)
    group.add(chunk)
  }
  // Rebar out of the heap, bent.
  const bars = 3 + Math.floor(rng() * 4)
  for (let i = 0; i < bars; i++) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, range(rng, 0.8, 1.8), 4),
      rust
    )
    bar.position.set((rng() - 0.5) * length * 0.6, 0.6, (rng() - 0.5) * half)
    bar.rotation.set((rng() - 0.5) * 1.4, 0, (rng() - 0.5) * 1.4)
    group.add(bar)
  }
}

function spool(group: THREE.Group, rng: () => number) {
  const { half } = CLUTTER_SIZE.spool
  const wood = lambert({ color: SPOOL })
  const cable = lambert({ color: CABLE })
  const radius = half - 0.05
  const width = 0.9
  const reel = new THREE.Group()
  for (const side of [-1, 1]) {
    const flange = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.08, 14),
      wood
    )
    flange.position.y = (side * width) / 2
    reel.add(flange)
  }
  const wound = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, width - 0.08, 14),
    cable
  )
  reel.add(wound)
  // On its edge, its axle along x, rolled a little.
  reel.rotation.z = Math.PI / 2
  reel.rotation.x = rng() * Math.PI
  reel.position.y = radius
  group.add(reel)
  // A loose end of cable trailing off along the ground.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.4), cable)
  tail.position.set(0.2, 0.03, half * 0.4)
  tail.rotation.y = range(rng, -0.6, 0.6)
  group.add(tail)
}

function pipes(group: THREE.Group, rng: () => number) {
  const { length, half } = CLUTTER_SIZE.pipes
  const concrete = lambert({
    map: concreteTexture('#8c887f'),
    side: THREE.DoubleSide,
  })
  const count = 2 + Math.floor(rng() * 2)
  const radius = (half * 2) / (count + (count === 3 ? 0 : 0.6)) / 2
  for (let i = 0; i < count; i++) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(
        radius,
        radius,
        length * range(rng, 0.85, 1),
        12,
        1,
        true
      ),
      concrete
    )
    pipe.rotation.z = Math.PI / 2
    // Two side by side, the third on top between them.
    const z = count === 3 && i === 2 ? 0 : (i === 0 ? -1 : 1) * radius
    const y = count === 3 && i === 2 ? radius * 2.7 : radius
    pipe.position.set((rng() - 0.5) * 0.3, y, z)
    group.add(pipe)
  }
}

function bags(group: THREE.Group, rng: () => number) {
  const { length, half } = CLUTTER_SIZE.bags
  const timber = lambert({ color: TIMBER })
  const bag = lambert({ color: BAG })
  const dark = lambert({ color: BAG_DARK })
  // The pallet: deck boards on three runners.
  for (const z of [-half + 0.08, 0, half - 0.08]) {
    box(group, timber, length, 0.1, 0.12, 0, 0.05, z)
  }
  for (let x = -length / 2 + 0.08; x < length / 2; x += 0.2) {
    box(group, timber, 0.14, 0.03, half * 2, x, 0.115, 0)
  }
  const rows = 3 + Math.floor(rng() * 3)
  let y = 0.13
  for (let r = 0; r < rows; r++) {
    // Each course laid across the one under it.
    const across = r % 2 === 1
    for (let i = 0; i < 2; i++) {
      const off = (i - 0.5) * (across ? length / 2 : half)
      const b = box(
        group,
        rng() < 0.2 ? dark : bag,
        across ? length / 2 - 0.04 : length - 0.04,
        0.14,
        across ? half * 2 - 0.04 : half - 0.04,
        across ? off : 0,
        y + 0.07,
        across ? 0 : off
      )
      b.rotation.y = (rng() - 0.5) * 0.08
    }
    y += 0.14
  }
}

const BUILDERS: Record<
  ClutterKind,
  (group: THREE.Group, rng: () => number) => void
> = { beams, crates, rubble, spool, pipes, bags }

export function buildClutter(kind: ClutterKind, seed: number): THREE.Group {
  const group = new THREE.Group()
  group.name = `yard-${kind}`
  const rng = mulberry32(seed)
  rng()
  BUILDERS[kind](group, rng)
  castShadows(group)
  mergeStatic(group)
  return group
}

// A light tower on its trailer: the mast up from the hitch, a bar of four
// metal-halide lamps tipped down toward +x, each with its halo. One in a
// while flickers (`update`, on the shared clock).
export interface LightTowerRig {
  group: THREE.Group
  // Where the lamps' light lands, from the tower's foot, along +x.
  reach: number
  update(t: number): void
}

export const LIGHT_TOWER = { mast: 8.2, reach: 6 }
const HALIDE = '#dfe8ff'

export function buildLightTower(seed: number): LightTowerRig {
  const group = new THREE.Group()
  group.name = 'light-tower'
  const rng = mulberry32(seed)
  rng()
  const paint = lambert({ color: '#b8902a' })
  const dark = lambert({ color: '#2a2826' })
  const tyre = lambert({ color: '#151515' })
  // The trailer: a box on two wheels, its tongue, the outriggers down.
  box(group, paint, 2.2, 0.9, 1.3, 0, 0.85, 0)
  box(group, dark, 1.2, 0.08, 0.1, -1.6, 0.5, 0)
  for (const z of [-0.75, 0.75]) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10),
      tyre
    )
    wheel.rotation.x = Math.PI / 2
    wheel.position.set(0.1, 0.34, z)
    group.add(wheel)
  }
  for (const [x, z] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    box(group, dark, 0.08, 0.08, 0.9, x * 0.9, 0.45, z * 0.95)
    box(group, dark, 0.06, 0.45, 0.06, x * 0.9, 0.22, z * 1.35)
    box(group, dark, 0.22, 0.04, 0.22, x * 0.9, 0.02, z * 1.35)
  }
  const mast = LIGHT_TOWER.mast
  box(group, dark, 0.16, mast - 1.2, 0.16, 0.6, 1.3 + (mast - 1.2) / 2, 0)
  box(group, dark, 0.1, 0.1, 2.2, 0.6, mast + 0.1, 0)
  castShadows(group)
  mergeStatic(group)

  // The lamps: a housing each, its lens a bright face tipped down.
  const lit = new THREE.MeshBasicMaterial({ color: HALIDE })
  const off = new THREE.MeshBasicMaterial({ color: '#3a3d44' })
  const halo = makeGlowTexture('rgba(220, 230, 255, 0.55)')
  const lenses: THREE.Mesh[] = []
  const halos: THREE.Sprite[] = []
  const tip = range(rng, 0.45, 0.6)
  ;[-0.8, -0.27, 0.27, 0.8].forEach((z) => {
    const head = new THREE.Group()
    head.position.set(0.75, mast + 0.35, z)
    head.rotation.z = -tip
    box(head, dark, 0.22, 0.42, 0.42, 0, 0, 0)
    const lens = box(head, lit, 0.02, 0.36, 0.36, 0.12, 0, 0)
    lenses.push(lens)
    const glow = makeGlowSprite(halo, 2.4)
    glow.position.set(0.3, 0, 0)
    head.add(glow)
    halos.push(glow)
    group.add(head)
  })
  // One lamp in four towers sputters.
  const sputters = rng() < 0.6 ? Math.floor(rng() * lenses.length) : -1
  const phase = rng() * 100
  const update = (t: number) => {
    if (sputters < 0) return
    const s = Math.sin((t + phase) * 23) + Math.sin((t + phase) * 7.3)
    const on = Math.sin((t + phase) * 0.6) > -0.4 || s > 0.6
    lenses[sputters].material = on ? lit : off
    halos[sputters].visible = on
  }
  update(0)
  setMotion(group, update)
  return { group, reach: LIGHT_TOWER.reach, update }
}
