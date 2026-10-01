// The shared character body, in the PS1 style of Silent Hill and Metal Gear
// Solid: rigid parts on joint pivots, each part a tapered low-poly loft
// (rings of 6 or 8 sides) with smooth normals, so Lambert lighting shades it
// like Gouraud-shaded hardware. Every character is this body in a different
// outfit (outfits.js), posed and animated from poses.js. Materials go through
// the PS1 snap, the same way the truck is built.
//
// Body space: origin at the feet, facing +Z, left side +X.

import * as THREE from 'three'
import { lambert, makeGlowSprite, makeGlowTexture } from './assets.js'
import { ADDONS, outfitById } from './outfits.js'
import { JOINTS } from './poses.js'

// One material per color and one geometry per shape, shared by every figure.
const materials = new Map()
function material(color) {
  if (!materials.has(color)) materials.set(color, lambert({ color }))
  return materials.get(color)
}

const geometries = new Map()
function cached(key, build) {
  if (!geometries.has(key)) geometries.set(key, build())
  return geometries.get(key)
}

// A closed loft through rings of [y, rx, rz, cz]: an elliptical cross
// section of half-width rx and half-depth rz, shifted cz forward, at height
// y. Sides are flat facets; normals are shared, so the shading is smooth.
export function loft(rings, sides = 6) {
  return cached(`${sides}|${JSON.stringify(rings)}`, () => {
    const sorted = [...rings].sort((a, b) => a[0] - b[0])
    const positions = []
    const index = []
    for (const [y, rx, rz, cz = 0] of sorted) {
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2
        positions.push(Math.cos(a) * rx, y, Math.sin(a) * rz + cz)
      }
    }
    const at = (i, k) => i * sides + (k % sides)
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

function box(w, h, d) {
  return cached(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d))
}

// A boot: a box whose toe end is lower and narrower.
function boot() {
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
function stretch(rings, s) {
  return rings.map(([y, rx, rz, cz = 0]) => [y * s, rx, rz, cz])
}

function part(parent, geometry, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material(color))
  mesh.position.set(x, y, z)
  parent.add(mesh)
  return mesh
}

function pivot(parent, joints, name, x, y, z) {
  const node = new THREE.Group()
  node.name = name
  node.position.set(x, y, z)
  parent.add(node)
  joints[name] = node
  return node
}

// Shapes in each joint's space. Limbs hang down (negative y) from their
// pivot; the torso and head rise from theirs.
const PELVIS = [
  [0.07, 0.15, 0.1],
  [-0.03, 0.175, 0.115],
  [-0.11, 0.14, 0.1],
]
const TORSO = [
  [0, 0.145, 0.095],
  [0.14, 0.16, 0.105, 0.005],
  [0.3, 0.195, 0.12, 0.015],
  [0.43, 0.205, 0.105, 0],
  [0.5, 0.09, 0.07, -0.005],
]
const NECK = [
  [-0.02, 0.05, 0.05],
  [0.09, 0.045, 0.05, 0.005],
]
const HEAD = [
  [0.07, 0.05, 0.05, 0.03],
  [0.1, 0.075, 0.085, 0.02],
  [0.17, 0.088, 0.1, 0.005],
  [0.23, 0.092, 0.106, 0],
  [0.28, 0.078, 0.092, -0.005],
  [0.305, 0.035, 0.045, -0.01],
]
const HAIR = [
  [0.19, 0.097, 0.11, -0.012],
  [0.27, 0.094, 0.108, -0.006],
  [0.315, 0.05, 0.06, -0.01],
]
const UPPER_ARM = [
  [0.02, 0.05, 0.056],
  [-0.08, 0.05, 0.055],
  [-0.32, 0.038, 0.042],
]
const FOREARM = [
  [0.01, 0.04, 0.042],
  [-0.08, 0.045, 0.047],
  [-0.28, 0.029, 0.032],
]
// Flipper hand: one mitten, flat across the palm.
const HAND = [
  [0, 0.022, 0.035],
  [-0.07, 0.02, 0.045],
  [-0.13, 0.012, 0.03],
]
const THIGH = [
  [0.02, 0.085, 0.09],
  [-0.16, 0.08, 0.085],
  [-0.44, 0.05, 0.055],
]
const SHIN = [
  [0.01, 0.05, 0.055],
  [-0.11, 0.055, 0.062, -0.012],
  [-0.38, 0.034, 0.038],
]

// { group, joints, hipY }. head: false hides the head and everything on the
// neck, for the first-person player body.
export function buildFigure(outfitId, { head = true } = {}) {
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
  const joints = {}

  const pelvis = pivot(group, joints, 'pelvis', 0, hipY, 0)
  part(pelvis, loft(PELVIS, 8), c.pants)

  const spine = pivot(pelvis, joints, 'spine', 0, 0.07, 0)
  part(spine, loft(TORSO, 8), c.shirt)

  const neck = pivot(spine, joints, 'neck', 0, 0.48, 0)
  part(neck, loft(NECK), c.skin)
  part(neck, loft(HEAD, 8), c.skin)
  part(neck, loft(HAIR), c.hair)
  // A nose and a brow line: enough for a face to read at PS1 resolution.
  part(neck, box(0.026, 0.045, 0.03), c.skin, 0, 0.17, 0.1)
  part(neck, box(0.13, 0.014, 0.02), c.hair, 0, 0.215, 0.098)
  neck.visible = head

  for (const [side, sign] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const shoulder = pivot(
      spine,
      joints,
      `shoulder${side}`,
      0.18 * sign,
      0.42,
      0
    )
    part(shoulder, loft(stretch(UPPER_ARM, arm)), c.shirt)
    const elbow = pivot(shoulder, joints, `elbow${side}`, 0, -upperArm, 0)
    part(elbow, loft(stretch(FOREARM, arm)), c.shirt)
    part(elbow, loft(HAND), c.skin, 0, -foreArm, 0)
    part(elbow, box(0.025, 0.05, 0.025), c.skin, 0, -foreArm - 0.035, 0.04)

    const hip = pivot(pelvis, joints, `hip${side}`, 0.09 * sign, -0.05, 0)
    part(hip, loft(stretch(THIGH, leg)), c.pants)
    const knee = pivot(hip, joints, `knee${side}`, 0, -thigh, 0)
    part(knee, loft(stretch(SHIN, leg)), c.pants)
    part(knee, boot(), c.boots, 0, -shin - 0.03, 0.045)
  }

  for (const id of outfit.addons || []) {
    const addon = ADDONS[id]
    const geometry = addon.rings
      ? loft(addon.rings, addon.sides)
      : box(...addon.box)
    for (const at of addon.offsets || [addon.offset || [0, 0, 0]]) {
      part(joints[addon.joint], geometry, c[addon.slot], ...at)
    }
  }

  return { group, joints, hipY }
}

// Copy a samplePose() result onto a figure's pivots.
export function applyPose(figure, pose) {
  for (const joint of JOINTS) {
    figure.joints[joint].rotation.set(...pose.joints[joint])
  }
  figure.joints.pelvis.position.y = figure.hipY + pose.lift
}

// A lit cigarette in the corner of the mouth: paper, an ember that glows
// harder on each drag, and smoke wisps that rise and fade. Returns
// { update(t) }; call it every frame with a running time in seconds.
let emberGlow = null
let smokeTexture = null
export function attachCigarette(figure) {
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
  const wisps = []
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
    update(t) {
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
