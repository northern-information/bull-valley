// The shared character body: rigid low-poly parts on joint pivots, like a
// PS1 character, under 250 triangles. Every character is this body in a
// different outfit (outfits.js), posed and animated from poses.js. Parts are
// Lambert boxes through the PS1 snap, the same way the truck is built.
//
// Body space: origin at the feet, facing +Z, left side +X.

import * as THREE from 'three'
import { lambert } from './assets.js'
import { ADDONS, outfitById } from './outfits.js'
import { JOINTS } from './poses.js'

// One material per color and one geometry per size, shared by every figure.
const materials = new Map()
function material(color) {
  if (!materials.has(color)) materials.set(color, lambert({ color }))
  return materials.get(color)
}

const boxes = new Map()
function box(w, h, d) {
  const key = `${w}|${h}|${d}`
  if (!boxes.has(key)) boxes.set(key, new THREE.BoxGeometry(w, h, d))
  return boxes.get(key)
}

// A four-sided prism, wider at the shoulders than at the waist.
let torsoGeo = null
function torso() {
  if (!torsoGeo) {
    torsoGeo = new THREE.CylinderGeometry(0.3, 0.23, 0.52, 4)
    torsoGeo.rotateY(Math.PI / 4)
    torsoGeo.scale(1, 1, 0.57)
  }
  return torsoGeo
}

function part(parent, geometry, color, x, y, z) {
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
  part(pelvis, box(0.34, 0.18, 0.2), c.pants, 0, 0, 0)

  const spine = pivot(pelvis, joints, 'spine', 0, 0.09, 0)
  part(spine, torso(), c.shirt, 0, 0.26, 0)

  const neck = pivot(spine, joints, 'neck', 0, 0.54, 0)
  part(neck, box(0.22, 0.26, 0.24), c.skin, 0, 0.15, 0)
  part(neck, box(0.24, 0.08, 0.26), c.hair, 0, 0.27, -0.01)
  neck.visible = head

  for (const [side, sign] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const shoulder = pivot(
      spine,
      joints,
      `shoulder${side}`,
      0.24 * sign,
      0.47,
      0
    )
    part(shoulder, box(0.11, upperArm, 0.12), c.shirt, 0, -upperArm / 2, 0)
    const elbow = pivot(shoulder, joints, `elbow${side}`, 0, -upperArm, 0)
    part(elbow, box(0.1, foreArm, 0.1), c.shirt, 0, -foreArm / 2, 0)
    // Flipper hand: one mitten block, palm toward the body, thumb forward.
    part(elbow, box(0.05, 0.14, 0.09), c.skin, 0, -foreArm - 0.07, 0)
    part(elbow, box(0.03, 0.06, 0.03), c.skin, 0, -foreArm - 0.04, 0.055)

    const hip = pivot(pelvis, joints, `hip${side}`, 0.1 * sign, -0.05, 0)
    part(hip, box(0.15, thigh, 0.16), c.pants, 0, -thigh / 2, 0)
    const knee = pivot(hip, joints, `knee${side}`, 0, -thigh, 0)
    part(knee, box(0.13, shin, 0.13), c.pants, 0, -shin / 2, 0)
    part(knee, box(0.14, 0.1, 0.26), c.boots, 0, -shin - 0.03, 0.04)
  }

  for (const id of outfit.addons || []) {
    const addon = ADDONS[id]
    part(
      joints[addon.joint],
      box(...addon.size),
      c[addon.slot],
      ...addon.offset
    )
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
