import * as THREE from 'three'
import { castShadows, lambert, mergeStatic, setMotion } from './assetkit.ts'
import { mulberry32, range } from './rng.ts'

// A tower crane left to rot on the rim of Castle Entropy's moat
// (moat.ts craneSpots): a lattice mast on a concrete footing, the slewing
// deck and its cab on top, a lattice jib arcing out and down over the
// moat with its far end broken off, a counter-jib behind with its
// counterweights, every so often a brace gone, and a hook on a cable
// swaying over the drop. Origin at the footing, the jib out along +x for
// `reach` metres. `seed` makes each crane its own.

export interface CraneRig {
  group: THREE.Group
  // The hook at the cable's end, for the slurms that drop off it.
  hook: THREE.Object3D
  update(t: number): void
}

export const CRANE = {
  // The mast's square section and its height range.
  mast: 1.8,
  minHeight: 30,
  maxHeight: 40,
}

export function buildCrane(seed: number, reach = 40): CraneRig {
  const group = new THREE.Group()
  group.name = 'moat-crane'
  const rng = mulberry32(seed)
  rng()
  const paint = lambert({ color: '#8a6a2a' })
  const rust = lambert({ color: '#5c3a22' })
  const dark = lambert({ color: '#2c2a28' })
  const footing = lambert({ color: '#6c6a66' })
  const glass = lambert({ color: '#1a2228' })

  const beam = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    size: number,
    material: THREE.Material
  ) => {
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
  // A brace, or now and then the stub where one rusted through.
  const brace = (a: THREE.Vector3, b: THREE.Vector3) => {
    const roll = rng()
    if (roll < 0.1) return
    if (roll < 0.18) {
      beam(a, a.clone().lerp(b, 0.3), 0.08, rust)
      return
    }
    beam(a, b, 0.08, roll < 0.5 ? rust : paint)
  }
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

  // The footing, sunk a little into the rim.
  const foot = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.6, 4.5), footing)
  foot.position.y = 0.2
  group.add(foot)

  // The mast: four legs, girts and a zigzag up every face.
  const height = range(rng, CRANE.minHeight, CRANE.maxHeight)
  const h = CRANE.mast / 2
  const corners: [number, number][] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ]
  for (const [x, z] of corners) beam(v(x, 1, z), v(x, height, z), 0.2, paint)
  const bay = 2.4
  for (let y = 1; y < height - 0.1; y += bay) {
    const top = Math.min(height, y + bay)
    for (let f = 0; f < 4; f++) {
      const [ax, az] = corners[f]
      const [bx, bz] = corners[(f + 1) % 4]
      beam(v(ax, top, az), v(bx, top, bz), 0.1, paint)
      brace(v(ax, y, az), v(bx, top, bz))
    }
  }

  // The slewing deck, the cab hung off its side, and the tower top.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 3.2), dark)
  deck.position.y = height + 0.3
  group.add(deck)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2, 2.2, 1.8), paint)
  cab.position.set(1.4, height - 0.6, 2.2)
  group.add(cab)
  const pane = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.05), glass)
  pane.position.set(1.4, height - 0.3, 3.12)
  group.add(pane)
  const peak = height + 7
  for (const [x, z] of corners) {
    beam(v(x * 0.8, height + 0.6, z * 0.8), v(0, peak, 0), 0.14, paint)
  }

  // The jib: a lattice of three chords, rising off the deck and drooping
  // out over the drop in an arc, its last stretch broken away.
  const lengthOut = reach * range(rng, 0.85, 1.05)
  const broken = range(rng, 0.78, 0.93)
  const steps = Math.max(6, Math.round(lengthOut / 2.5))
  const sag = range(rng, 0.08, 0.22)
  const jibAt = (s: number) =>
    v(
      2 + s * lengthOut,
      height + 1.2 + Math.sin(s * Math.PI * 0.9) * 3 - s * s * lengthOut * sag,
      0
    )
  const chord = (s: number, which: number): THREE.Vector3 => {
    const p = jibAt(s)
    if (which === 0) return p.clone().add(v(0, 1.4, 0))
    return p.clone().add(v(0, 0, which === 1 ? -0.8 : 0.8))
  }
  const last = Math.floor(steps * broken)
  for (let i = 0; i < last; i++) {
    const s0 = i / steps
    const s1 = (i + 1) / steps
    for (let c = 0; c < 3; c++) {
      beam(chord(s0, c), chord(s1, c), 0.14, i % 4 === 3 ? rust : paint)
    }
    brace(chord(s0, 1), chord(s1, 0))
    brace(chord(s0, 2), chord(s1, 0))
    brace(chord(s0, 1), chord(s1, 2))
  }
  // The broken end: one chord hanging on, bent down.
  const end = last / steps
  const hang = chord(end, 1)
  beam(hang, hang.clone().add(v(1.5, -3.5, 0.4)), 0.12, rust)
  // Pendant ties from the peak out along the jib.
  beam(v(0, peak, 0), chord(Math.min(end, 0.55), 0), 0.05, dark)
  beam(v(0, peak, 0), chord(Math.min(end, 0.3), 0), 0.05, dark)

  // The counter-jib behind, its counterweights, a slab or two fallen off.
  const back = range(rng, 9, 13)
  for (const z of [-0.7, 0.7]) {
    beam(v(-1, height + 1, z), v(-back, height + 1.2, z), 0.14, paint)
  }
  for (let x = -2; x > -back; x -= 2)
    brace(v(x, height + 1, -0.7), v(x - 2, height + 1.2, 0.7))
  beam(v(0, peak, 0), v(-back, height + 1.4, 0), 0.05, dark)
  const weights = 2 + Math.floor(rng() * 3)
  for (let i = 0; i < weights; i++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 2.2), footing)
    slab.position.set(-back + 1 + i * 1, height - 0.2, 0)
    slab.rotation.z = (rng() - 0.5) * 0.15
    group.add(slab)
  }

  castShadows(group)
  mergeStatic(group)

  // The hook on its cable, swaying from the trolley partway out.
  const trolleyAt = jibAt(range(rng, 0.35, Math.max(0.4, end - 0.1)))
  const swing = new THREE.Group()
  swing.position.copy(trolleyAt)
  const drop = range(rng, 12, 30)
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.05, drop, 0.05), dark)
  cable.position.y = -drop / 2
  swing.add(cable)
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.5), paint)
  block.position.y = -drop
  swing.add(block)
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.09, 4, 8, Math.PI * 1.4),
    rust
  )
  hook.position.y = -drop - 0.8
  swing.add(hook)
  castShadows(swing)
  group.add(swing)

  const phase = rng() * Math.PI * 2
  const update = (t: number) => {
    swing.rotation.z = Math.sin(t * 0.4 + phase) * 0.06
    swing.rotation.x = Math.sin(t * 0.27 + phase * 2) * 0.04
  }
  update(0)
  setMotion(group, update)
  return { group, hook, update }
}
