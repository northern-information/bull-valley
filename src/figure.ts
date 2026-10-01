// The shared character body, in the PS1 style of Silent Hill and Metal Gear
// Solid: rigid parts on joint pivots, each part a tapered low-poly loft
// (rings of 6 or 8 sides) with smooth normals, so Lambert lighting shades it
// like Gouraud-shaded hardware. Every character is this body in a different
// outfit (outfits.ts), posed and animated from poses.ts. Materials go through
// the PS1 snap, the same way the truck is built.
//
// Body space: origin at the feet, facing +Z, left side +X.

import * as THREE from 'three'
import { lambert, makeGlowSprite, makeGlowTexture } from './assets.ts'
import { ADDONS, outfitById } from './outfits.ts'
import { JOINTS } from './poses.ts'
import type { LoftRing, OutfitId, Vec3 } from './outfits.ts'
import type { JointName, PoseSample } from './poses.ts'

// A built body: its root group, one pivot per joint, and the hip height
// that poses lift from.
export interface Figure {
  group: THREE.Group
  joints: Record<JointName, THREE.Group>
  hipY: number
}

export interface FigureOptions {
  // false hides the head and everything on the neck.
  head?: boolean
}

// The lit cigarette; call update(t) every frame with a running time.
export interface CigaretteRig {
  update(t: number): void
}

// A loft ring, with the forward shift optional.
type RingInput = [number, number, number, number?]

// One material per color and one geometry per shape, shared by every figure.
const materials = new Map<string, THREE.MeshLambertMaterial>()
function material(color: string): THREE.MeshLambertMaterial {
  let found = materials.get(color)
  if (!found) {
    found = lambert({ color })
    materials.set(color, found)
  }
  return found
}

const geometries = new Map<string, THREE.BufferGeometry>()
function cached(
  key: string,
  build: () => THREE.BufferGeometry
): THREE.BufferGeometry {
  let found = geometries.get(key)
  if (!found) {
    found = build()
    geometries.set(key, found)
  }
  return found
}

// A closed loft through rings of [y, rx, rz, cz]: an elliptical cross
// section of half-width rx and half-depth rz, shifted cz forward, at height
// y. Sides are flat facets; normals are shared, so the shading is smooth.
export function loft(
  rings: readonly RingInput[],
  sides = 6
): THREE.BufferGeometry {
  return cached(`${sides}|${JSON.stringify(rings)}`, () => {
    const sorted = [...rings].sort((a, b) => a[0] - b[0])
    const positions: number[] = []
    const index: number[] = []
    for (const [y, rx, rz, cz = 0] of sorted) {
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2
        positions.push(Math.cos(a) * rx, y, Math.sin(a) * rz + cz)
      }
    }
    const at = (i: number, k: number) => i * sides + (k % sides)
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let k = 0; k < sides; k++) {
        index.push(at(i, k), at(i + 1, k), at(i + 1, k + 1))
        index.push(at(i, k), at(i + 1, k + 1), at(i, k + 1))
      }
    }
    // Caps: a centre vertex at each end.
    const last = sorted.length - 1
    const bottom = positions.length / 3
    positions.push(0, sorted[0][0], sorted[0][3] || 0)
    const top = bottom + 1
    positions.push(0, sorted[last][0], sorted[last][3] || 0)
    for (let k = 0; k < sides; k++) {
      index.push(bottom, at(0, k), at(0, k + 1))
      index.push(top, at(last, k + 1), at(last, k))
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    )
    geometry.setIndex(index)
    geometry.computeVertexNormals()
    return geometry
  })
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return cached(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d))
}

// A boot: a box whose toe end is lower and narrower.
function boot(): THREE.BufferGeometry {
  return cached('boot', () => {
    const geometry = new THREE.BoxGeometry(0.11, 0.1, 0.25)
    const pos = geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > 0) {
        pos.setX(i, pos.getX(i) * 0.8)
        if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) - 0.04)
      }
    }
    geometry.computeVertexNormals()
    return geometry
  })
}

// Ring y values scale with a limb's length; widths stay.
function stretch(rings: readonly RingInput[], s: number): LoftRing[] {
  return rings.map(([y, rx, rz, cz = 0]): LoftRing => [y * s, rx, rz, cz])
}

function part(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  color: string,
  x = 0,
  y = 0,
  z = 0
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material(color))
  mesh.position.set(x, y, z)
  parent.add(mesh)
  return mesh
}

function pivot(
  parent: THREE.Object3D,
  joints: Partial<Record<JointName, THREE.Group>>,
  name: JointName,
  x: number,
  y: number,
  z: number
): THREE.Group {
  const node = new THREE.Group()
  node.name = name
  node.position.set(x, y, z)
  parent.add(node)
  joints[name] = node
  return node
}

// Shapes in each joint's space. Limbs hang down (negative y) from their
// pivot; the torso and head rise from theirs.
const PELVIS: RingInput[] = [
  [0.07, 0.15, 0.1],
  [-0.03, 0.175, 0.115],
  [-0.11, 0.14, 0.1],
]
const TORSO: RingInput[] = [
  [0, 0.145, 0.095],
  [0.14, 0.16, 0.105, 0.005],
  [0.3, 0.195, 0.12, 0.015],
  [0.43, 0.205, 0.105, 0],
  [0.5, 0.09, 0.07, -0.005],
]
const NECK: RingInput[] = [
  [-0.02, 0.05, 0.05],
  [0.09, 0.045, 0.05, 0.005],
]
const HEAD: RingInput[] = [
  [0.07, 0.05, 0.05, 0.03],
  [0.1, 0.075, 0.085, 0.02],
  [0.17, 0.088, 0.1, 0.005],
  [0.23, 0.092, 0.106, 0],
  [0.28, 0.078, 0.092, -0.005],
  [0.305, 0.035, 0.045, -0.01],
]
const HAIR: RingInput[] = [
  [0.19, 0.097, 0.11, -0.012],
  [0.27, 0.094, 0.108, -0.006],
  [0.315, 0.05, 0.06, -0.01],
]
const UPPER_ARM: RingInput[] = [
  [0.02, 0.05, 0.056],
  [-0.08, 0.05, 0.055],
  [-0.32, 0.038, 0.042],
]
const FOREARM: RingInput[] = [
  [0.01, 0.04, 0.042],
  [-0.08, 0.045, 0.047],
  [-0.28, 0.029, 0.032],
]
// Flipper hand: one mitten, flat across the palm.
const HAND: RingInput[] = [
  [0, 0.022, 0.035],
  [-0.07, 0.02, 0.045],
  [-0.13, 0.012, 0.03],
]
const THIGH: RingInput[] = [
  [0.02, 0.085, 0.09],
  [-0.16, 0.08, 0.085],
  [-0.44, 0.05, 0.055],
]
const SHIN: RingInput[] = [
  [0.01, 0.05, 0.055],
  [-0.11, 0.055, 0.062, -0.012],
  [-0.38, 0.034, 0.038],
]

// head: false hides the head and everything on the neck, for the
// first-person player body.
export function buildFigure(
  outfitId: OutfitId,
  { head = true }: FigureOptions = {}
): Figure {
  const outfit = outfitById(outfitId)
  const c = outfit.colors
  const arm = outfit.proportions?.arm ?? 1
  const leg = outfit.proportions?.leg ?? 1
  const upperArm = 0.32 * arm
  const foreArm = 0.28 * arm
  const thigh = 0.44 * leg
  const shin = 0.38 * leg
  const hipY = 0.08 + shin + thigh + 0.05

  const group = new THREE.Group()
  group.name = `figure-${outfitId}`
  const built: Partial<Record<JointName, THREE.Group>> = {}

  const pelvis = pivot(group, built, 'pelvis', 0, hipY, 0)
  part(pelvis, loft(PELVIS, 8), c.pants)

  const spine = pivot(pelvis, built, 'spine', 0, 0.07, 0)
  part(spine, loft(TORSO, 8), c.shirt)

  const neck = pivot(spine, built, 'neck', 0, 0.48, 0)
  part(neck, loft(NECK), c.skin)
  part(neck, loft(HEAD, 8), c.skin)
  part(neck, loft(HAIR), c.hair)
  // A nose and a brow line: enough for a face to read at PS1 resolution.
  part(neck, box(0.026, 0.045, 0.03), c.skin, 0, 0.17, 0.1)
  part(neck, box(0.13, 0.014, 0.02), c.hair, 0, 0.215, 0.098)
  neck.visible = head

  const sides: ['L' | 'R', number][] = [
    ['L', 1],
    ['R', -1],
  ]
  for (const [side, sign] of sides) {
    const shoulder = pivot(
      spine,
      built,
      `shoulder${side}`,
      0.18 * sign,
      0.42,
      0
    )
    part(shoulder, loft(stretch(UPPER_ARM, arm)), c.shirt)
    const elbow = pivot(shoulder, built, `elbow${side}`, 0, -upperArm, 0)
    part(elbow, loft(stretch(FOREARM, arm)), c.shirt)
    part(elbow, loft(HAND), c.skin, 0, -foreArm, 0)
    part(elbow, box(0.025, 0.05, 0.025), c.skin, 0, -foreArm - 0.035, 0.04)

    const hip = pivot(pelvis, built, `hip${side}`, 0.09 * sign, -0.05, 0)
    part(hip, loft(stretch(THIGH, leg)), c.pants)
    const knee = pivot(hip, built, `knee${side}`, 0, -thigh, 0)
    part(knee, loft(stretch(SHIN, leg)), c.pants)
    part(knee, boot(), c.boots, 0, -shin - 0.03, 0.045)
  }

  // Every joint in JOINTS now has its pivot.
  const joints = built as Record<JointName, THREE.Group>

  for (const id of outfit.addons || []) {
    const addon = ADDONS[id]
    const geometry =
      'rings' in addon ? loft(addon.rings, addon.sides) : box(...addon.box)
    const spots: Vec3[] = addon.offsets || [addon.offset || [0, 0, 0]]
    for (const at of spots) {
      // An add-on slot the outfit leaves out has no color, as before.
      part(joints[addon.joint], geometry, c[addon.slot] as string, ...at)
    }
  }

  return { group, joints, hipY }
}

// Copy a samplePose() result onto a figure's pivots.
export function applyPose(figure: Figure, pose: PoseSample): void {
  for (const joint of JOINTS) {
    figure.joints[joint].rotation.set(...pose.joints[joint])
  }
  figure.joints.pelvis.position.y = figure.hipY + pose.lift
}

// A lit cigarette in the corner of the mouth: paper, an ember that glows
// harder on each drag, and smoke wisps that rise and fade. Returns
// { update(t) }; call it every frame with a running time in seconds.
let emberGlow: THREE.Texture | null = null
let smokeTexture: THREE.Texture | null = null
export function attachCigarette(figure: Figure): CigaretteRig {
  const neck = figure.joints.neck
  const holder = new THREE.Group()
  holder.position.set(-0.03, 0.115, 0.1)
  holder.rotation.set(0.35, -0.3, 0)
  neck.add(holder)
  part(holder, box(0.008, 0.008, 0.075), '#ece8de', 0, 0, 0.035)

  const emberMat = new THREE.MeshBasicMaterial({ color: '#ff7a2a' })
  const ember = new THREE.Mesh(box(0.01, 0.01, 0.012), emberMat)
  ember.position.z = 0.076
  holder.add(ember)
  emberGlow ??= makeGlowTexture('rgba(255, 140, 60, 0.8)')
  const glow = makeGlowSprite(emberGlow, 0.1)
  glow.position.z = 0.078
  holder.add(glow)

  smokeTexture ??= makeGlowTexture('rgba(190, 196, 206, 0.5)')
  const wisps: THREE.Sprite[] = []
  for (let i = 0; i < 3; i++) {
    const wisp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: smokeTexture,
        transparent: true,
        depthWrite: false,
      })
    )
    neck.add(wisp)
    wisps.push(wisp)
  }
  const tip = new THREE.Vector3(-0.052, 0.1, 0.168)

  return {
    update(t: number) {
      // A drag every six seconds, held for one.
      const drag =
        Math.max(0, Math.sin(((t % 6) / 6) * Math.PI * 12)) *
        (t % 6 < 1 ? 1 : 0)
      glow.scale.setScalar(0.08 + drag * 0.08)
      emberMat.color.set(drag > 0.3 ? '#ffb15a' : '#ff7a2a')
      for (let i = 0; i < wisps.length; i++) {
        const life = (t * 0.5 + i / wisps.length) % 1
        const wisp = wisps[i]
        wisp.position.set(
          tip.x + Math.sin(t * 1.3 + i) * 0.03 * life,
          tip.y + life * 0.45,
          tip.z - life * 0.05
        )
        wisp.scale.setScalar(0.05 + life * 0.18)
        wisp.material.opacity = 0.45 * (1 - life)
      }
    },
  }
}
