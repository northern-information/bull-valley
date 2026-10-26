import * as THREE from 'three'
import { lambert, makeGlowSprite, makeGlowTexture } from './assetkit.ts'
import type { PickupOptions } from './assetkit.ts'

// The mechs (mechs.ts) as the pack shows them, a stub until they are their
// own feature: each a little figure of its own, about half a metre tall,
// built of the old bones dug out of the weeping angel's grave and lit from
// inside. The Grigori Watcher is tall and thin with eyes down its spine,
// the Nephil Ossuary a squat walker with a ribcage for a body, the Anakim
// Colossus a hulk on stumps, the Seraph six wings round a little body, and
// the Ophanim a wheel within a wheel, rimmed with eyes, in gold. Origin on
// the ground under it, facing +x.

const BONE = '#d8cfb8'
const JOINT = '#3a3530'

interface Kit {
  bone: THREE.Material
  joint: THREE.Material
  light: THREE.Material
}

function kitOf(light: string): Kit {
  return {
    bone: lambert({ color: BONE }),
    joint: lambert({ color: JOINT }),
    light: lambert({ color: light, emissive: light, emissiveIntensity: 0.9 }),
  }
}

// A bone from `a` to `b`, `r` thick, with a knuckle at each end.
function bone(
  group: THREE.Group,
  kit: Kit,
  a: [number, number, number],
  b: [number, number, number],
  r: number
): void {
  const from = new THREE.Vector3(...a)
  const to = new THREE.Vector3(...b)
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, from.distanceTo(to), 5),
    kit.bone
  )
  shaft.position.copy(from).add(to).multiplyScalar(0.5)
  shaft.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    to.clone().sub(from).normalize()
  )
  group.add(shaft)
  for (const end of [from, to]) {
    const knuckle = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.5, 5, 4),
      kit.joint
    )
    knuckle.position.copy(end)
    group.add(knuckle)
  }
}

function ball(
  group: THREE.Group,
  material: THREE.Material,
  r: number,
  at: [number, number, number]
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), material)
  mesh.position.set(...at)
  group.add(mesh)
  return mesh
}

// Two legs, hip to foot, either side of the middle.
function legs(group: THREE.Group, kit: Kit, hip: number, spread: number): void {
  for (const side of [-1, 1]) {
    bone(
      group,
      kit,
      [0, hip, side * spread],
      [0.04, hip / 2, side * spread * 1.2],
      0.018
    )
    bone(
      group,
      kit,
      [0.04, hip / 2, side * spread * 1.2],
      [0, 0.02, side * spread * 1.1],
      0.016
    )
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.02, 0.04),
      kit.joint
    )
    foot.position.set(0.02, 0.01, side * spread * 1.1)
    group.add(foot)
  }
}

// A ribcage: hoops of rib stacked round a spine, `r` across, from `low` to
// `high`.
function ribs(
  group: THREE.Group,
  kit: Kit,
  low: number,
  high: number,
  r: number
): void {
  bone(group, kit, [-r * 0.8, low, 0], [-r * 0.8, high, 0], 0.016)
  const count = 5
  for (let i = 0; i < count; i++) {
    const y = low + ((high - low) * (i + 0.5)) / count
    const width = r * (0.75 + 0.35 * Math.sin(((i + 0.5) / count) * Math.PI))
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(width, 0.008, 4, 12, Math.PI * 1.7),
      kit.bone
    )
    rib.rotation.x = Math.PI / 2
    rib.rotation.z = Math.PI * 0.15
    rib.position.set(-r * 0.1, y, 0)
    group.add(rib)
  }
}

// A wing of bone: a long finger out from `root`, at `lift` off level and
// `sweep` back, fanned with thinner ones under it.
function wing(
  group: THREE.Group,
  kit: Kit,
  root: [number, number, number],
  side: number,
  lift: number,
  sweep: number,
  span: number
): void {
  const tip: [number, number, number] = [
    root[0] - Math.sin(sweep) * span,
    root[1] + Math.sin(lift) * span,
    root[2] + side * Math.cos(lift) * Math.cos(sweep) * span,
  ]
  bone(group, kit, root, tip, 0.012)
  for (let k = 1; k <= 3; k++) {
    const end: [number, number, number] = [
      tip[0] + 0.02 * k,
      tip[1] - 0.07 * k,
      tip[2] - side * 0.03 * k,
    ]
    bone(group, kit, tip, end, 0.007)
  }
}

function buildGrigori(kit: Kit): THREE.Group {
  const group = new THREE.Group()
  legs(group, kit, 0.28, 0.05)
  bone(group, kit, [0, 0.28, 0], [0, 0.56, 0], 0.02)
  for (let i = 0; i < 4; i++)
    ball(group, kit.light, 0.014, [0.022, 0.33 + i * 0.06, 0])
  bone(group, kit, [0, 0.5, -0.1], [0, 0.5, 0.1], 0.014)
  for (const side of [-1, 1]) {
    bone(group, kit, [0, 0.5, side * 0.1], [0.06, 0.3, side * 0.13], 0.012)
  }
  ball(group, kit.bone, 0.05, [0, 0.6, 0])
  ball(group, kit.light, 0.016, [0.045, 0.61, 0])
  return group
}

function buildNephil(kit: Kit): THREE.Group {
  const group = new THREE.Group()
  legs(group, kit, 0.2, 0.08)
  ribs(group, kit, 0.2, 0.42, 0.11)
  ball(group, kit.light, 0.04, [0, 0.31, 0])
  for (const side of [-1, 1]) {
    bone(group, kit, [0, 0.4, side * 0.12], [0.08, 0.26, side * 0.18], 0.016)
    bone(
      group,
      kit,
      [0.08, 0.26, side * 0.18],
      [0.14, 0.16, side * 0.17],
      0.014
    )
  }
  ball(group, kit.bone, 0.06, [0.02, 0.48, 0])
  for (const side of [-1, 1])
    ball(group, kit.light, 0.012, [0.07, 0.49, side * 0.022])
  return group
}

function buildAnakim(kit: Kit): THREE.Group {
  const group = new THREE.Group()
  for (const side of [-1, 1]) {
    bone(group, kit, [0, 0.18, side * 0.09], [0, 0.03, side * 0.11], 0.035)
  }
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.28), kit.bone)
  body.position.y = 0.3
  group.add(body)
  ribs(group, kit, 0.2, 0.4, 0.15)
  ball(group, kit.light, 0.035, [0.1, 0.32, 0])
  for (const side of [-1, 1]) {
    ball(group, kit.joint, 0.05, [0, 0.4, side * 0.17])
    bone(group, kit, [0, 0.4, side * 0.17], [0.05, 0.18, side * 0.22], 0.03)
    ball(group, kit.bone, 0.045, [0.06, 0.15, side * 0.22])
  }
  ball(group, kit.bone, 0.045, [0.04, 0.45, 0])
  ball(group, kit.light, 0.012, [0.08, 0.46, 0])
  return group
}

function buildSeraph(kit: Kit): THREE.Group {
  const group = new THREE.Group()
  legs(group, kit, 0.2, 0.04)
  ribs(group, kit, 0.2, 0.34, 0.06)
  ball(group, kit.bone, 0.045, [0, 0.4, 0])
  ball(group, kit.light, 0.03, [0.03, 0.4, 0])
  for (const side of [-1, 1]) {
    wing(group, kit, [-0.03, 0.38, side * 0.04], side, 1.1, 0.2, 0.22)
    wing(group, kit, [-0.03, 0.32, side * 0.05], side, 0.15, 0.35, 0.26)
    wing(group, kit, [-0.03, 0.24, side * 0.04], side, -0.7, 0.2, 0.2)
  }
  return group
}

function buildOphanim(kit: Kit, gold: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  const middle = 0.3
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 5, 18), gold)
  outer.position.y = middle
  group.add(outer)
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.018, 5, 16),
    gold
  )
  inner.position.y = middle
  inner.rotation.y = Math.PI / 2
  group.add(inner)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    ball(group, kit.bone, 0.022, [
      0,
      middle + Math.sin(a) * 0.22,
      Math.cos(a) * 0.22,
    ])
    ball(group, kit.light, 0.01, [
      0.02,
      middle + Math.sin(a) * 0.22,
      Math.cos(a) * 0.22,
    ])
  }
  ball(group, kit.light, 0.05, [0, middle, 0])
  for (const side of [-1, 1]) {
    bone(
      group,
      kit,
      [0, middle - 0.2, side * 0.06],
      [0, 0.02, side * 0.12],
      0.015
    )
  }
  return group
}

// The figure of mech `kind` (an items.ts mech id), or a plain lump of bone
// for any other.
export function buildMech(
  kind: string,
  { glow = true }: PickupOptions = {}
): THREE.Group {
  let group: THREE.Group
  let light = '#9fd6ff'
  switch (kind) {
    case 'mech-grigori':
      light = '#b9a3ff'
      group = buildGrigori(kitOf(light))
      break
    case 'mech-nephil':
      light = '#ff6a4a'
      group = buildNephil(kitOf(light))
      break
    case 'mech-anakim':
      light = '#ffb347'
      group = buildAnakim(kitOf(light))
      break
    case 'mech-seraph':
      light = '#fff2b0'
      group = buildSeraph(kitOf(light))
      break
    case 'mech-ophanim':
      light = '#ffe680'
      group = buildOphanim(
        kitOf(light),
        lambert({ color: '#c9a043', emissive: '#3a2a08' })
      )
      break
    default:
      group = new THREE.Group()
      ball(group, kitOf(light).bone, 0.1, [0, 0.1, 0])
  }
  group.name = kind
  if (glow) {
    const halo = makeGlowSprite(
      makeGlowTexture('rgba(220, 210, 255, 0.5)'),
      0.8
    )
    halo.position.y = 0.32
    group.add(halo)
  }
  return group
}
