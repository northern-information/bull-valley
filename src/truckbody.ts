import * as THREE from 'three'
import { lambert, makeGlowSprite, makeGlowTexture } from './assetkit.ts'
import { applyPS1 } from './ps1.ts'

// --- Truck ---------------------------------------------------------------

// Matthew Marx's white Chevy, without Matthew Marx: truck.ts seats the
// driver (figure.ts), and figure.ts imports this file. Local space: the
// truck faces +Z, origin at ground level under the middle.
export function buildTruckBody(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'truck'
  const white = lambert({ color: '#c8ccd2' })
  const dark = lambert({ color: '#14161a' })
  const glass = lambert({ color: '#0e141d', transparent: true, opacity: 0.45 })

  const add = (
    geoDef: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number
  ) => {
    const mesh = new THREE.Mesh(geoDef, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
  }

  // Half-ton proportions, so a 1.8 m figure stands head and shoulders over
  // the bed rail (1.45 m) and just under the roof (1.95 m).
  // Hood, lower cab, bed floor.
  add(new THREE.BoxGeometry(1.9, 0.55, 1.5), white, 0, 0.975, 2.0)
  add(new THREE.BoxGeometry(1.9, 0.8, 1.7), white, 0, 0.95, 0.75)
  // Cab greenhouse: roof on four pillars, glass all round.
  add(new THREE.BoxGeometry(1.9, 0.1, 1.7), white, 0, 1.9, 0.75)
  for (const [px, pz] of [
    [0.9, -0.05],
    [-0.9, -0.05],
    [0.9, 1.55],
    [-0.9, 1.55],
  ]) {
    add(new THREE.BoxGeometry(0.1, 0.5, 0.1), white, px, 1.6, pz)
  }
  add(new THREE.BoxGeometry(1.7, 0.5, 0.04), glass, 0, 1.6, 1.58) // windshield
  add(new THREE.BoxGeometry(1.7, 0.5, 0.04), glass, 0, 1.6, -0.08) // rear
  add(new THREE.BoxGeometry(0.04, 0.5, 1.5), glass, 0.92, 1.6, 0.75)
  add(new THREE.BoxGeometry(0.04, 0.5, 1.5), glass, -0.92, 1.6, 0.75)
  add(new THREE.BoxGeometry(1.9, 0.3, 2.7), white, 0, 0.85, -1.45)
  // Bed walls and tailgate.
  add(new THREE.BoxGeometry(0.12, 0.45, 2.7), white, 0.9, 1.225, -1.45)
  add(new THREE.BoxGeometry(0.12, 0.45, 2.7), white, -0.9, 1.225, -1.45)
  add(new THREE.BoxGeometry(1.9, 0.45, 0.12), white, 0, 1.225, -2.75)
  // Wheels: cylinders rolling on the x axis.
  const wheelGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.3, 7)
  wheelGeo.rotateZ(Math.PI / 2)
  for (const [wx, wz] of [
    [0.85, 1.7],
    [-0.85, 1.7],
    [0.85, -1.7],
    [-0.85, -1.7],
  ]) {
    add(wheelGeo, dark, wx, 0.39, wz)
  }
  // Headlights and taillights: emissive lenses plus a glow each. The light
  // they throw is truck.ts's.
  const lens = (color: string, intensity: number) =>
    applyPS1(
      new THREE.MeshLambertMaterial({
        color: '#241a05',
        emissive: new THREE.Color(color),
        emissiveIntensity: intensity,
      })
    )
  const headMat = lens('#fbe7a3', 1.6)
  const tailMat = lens('#ff2a1a', 1.4)
  const headGlow = makeGlowTexture('rgba(251, 231, 163, 0.8)')
  const tailGlow = makeGlowTexture('rgba(255, 42, 26, 0.7)')
  for (const side of [1, -1]) {
    add(
      new THREE.BoxGeometry(0.3, 0.18, 0.08),
      headMat,
      side * 0.62,
      0.95,
      2.78
    )
    const head = makeGlowSprite(headGlow, 2.4)
    head.position.set(side * 0.62, 0.95, 2.85)
    // Upright lenses at the bed's rear corners, beside the tailgate.
    add(
      new THREE.BoxGeometry(0.12, 0.26, 0.04),
      tailMat,
      side * 0.86,
      1.15,
      -2.83
    )
    const tail = makeGlowSprite(tailGlow, 1.1)
    tail.position.set(side * 0.86, 1.15, -2.88)
    group.add(head, tail)
  }

  // The steering wheel, in front of the driver seat (left side, +X), where
  // the sit pose puts the hands.
  const steeringGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 8)
  const wheel = add(steeringGeo, dark, 0.45, 1.2, 1.06)
  wheel.rotation.x = Math.PI / 2 - 0.35
  return group
}
