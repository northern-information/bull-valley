import * as THREE from 'three'
import { castShadows, lambert, mergeStatic } from './assetkit.ts'

// Tyler Etters' red 1995 Jeep Wrangler, a YJ, parked on the spawn Citgo's
// lot beside Moab Coldë (CONFIG.tyler places it): the square headlights in
// the seven-slot grille, flat fenders, a black hardtop, the rear glass
// lifted up on its hinges and the tailgate dropped flat, so whoever sits
// in the back (figure.ts buildTyler) looks out over the lot. Scenery: it
// only blocks.

// --- The Jeep ------------------------------------------------------------

// Faces +Z, origin at ground level under the middle; left (the driver's
// side) is +X.
export const JEEP = {
  // Bumper to tailgate, and across the body under the flares.
  length: 4.0,
  width: 1.6,
  wheel: 0.4,
  // The rear opening: where the body ends, and the cargo floor's height,
  // which the dropped tailgate lies level with.
  rear: -1.95,
  floor: 0.78,
  // The hardtop's roof, over the cargo floor.
  roof: 1.86,
  // How far the dropped tailgate reaches out behind.
  gate: 0.44,
}

export function buildJeep(): THREE.Group {
  const { width, wheel, rear, floor, roof, gate } = JEEP
  const front = rear + JEEP.length
  const group = new THREE.Group()
  group.name = 'jeep'
  const red = lambert({ color: '#a3161b' })
  const black = lambert({ color: '#151518' })
  const top = lambert({ color: '#1d1e22' })
  const carpet = lambert({ color: '#26262a' })
  const steel = lambert({ color: '#8a8d92' })
  const lensWhite = lambert({ color: '#d4d6cc', emissive: '#2a2a24' })
  const lensAmber = lambert({ color: '#b86a14', emissive: '#2e1804' })
  const lensRed = lambert({ color: '#5a0c0c', emissive: '#3a0606' })
  const glass = lambert({ color: '#0e141d', transparent: true, opacity: 0.5 })

  const add = (
    parent: THREE.Object3D,
    size: [number, number, number],
    material: THREE.Material,
    x: number,
    y: number,
    z: number
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(x, y, z)
    parent.add(mesh)
    return mesh
  }
  const half = width / 2
  const sill = 0.58
  const belt = 1.18
  const cab = front - 1.3

  // The wheels on steel rims, the front pair under the fenders and the
  // back pair under the cargo, each with a black flare lip.
  const tyre = new THREE.CylinderGeometry(wheel, wheel, 0.3, 8)
  tyre.rotateZ(Math.PI / 2)
  const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.31, 6)
  hub.rotateZ(Math.PI / 2)
  for (const wz of [front - 0.72, rear + 0.72]) {
    for (const side of [1, -1]) {
      const x = side * (half - 0.02)
      const t = new THREE.Mesh(tyre, black)
      t.position.set(x, wheel, wz)
      const h = new THREE.Mesh(hub, steel)
      h.position.set(x, wheel, wz)
      group.add(t, h)
      add(group, [0.1, 0.05, 1.0], black, side * (half + 0.06), 0.88, wz)
    }
  }

  // The tub from the firewall back: the doors and the rear quarters to the
  // belt line, the cargo floor inside, open at the back.
  add(
    group,
    [width, belt - sill, cab - rear - 0.9],
    red,
    0,
    (belt + sill) / 2,
    (cab + rear + 0.9) / 2
  )
  for (const side of [1, -1]) {
    add(
      group,
      [0.06, belt - sill, 0.9],
      red,
      side * (half - 0.03),
      (belt + sill) / 2,
      rear + 0.45
    )
  }
  add(
    group,
    [width - 0.12, floor - sill, 0.9],
    red,
    0,
    (floor + sill) / 2,
    rear + 0.45
  )
  add(group, [width - 0.12, 0.02, 0.9], carpet, 0, floor + 0.01, rear + 0.45)
  // The front seats' backs, seen through the open back.
  for (const side of [1, -1]) {
    add(group, [0.5, 0.66, 0.14], black, side * 0.38, floor + 0.36, rear + 1.05)
  }

  // The front end: the engine under a flat hood, the flat fenders out
  // over the front wheels, the grille's seven slots between square
  // headlights, the amber parking lamps under them.
  add(group, [1.2, 0.6, front - cab], red, 0, sill + 0.27, (front + cab) / 2)
  add(group, [1.24, 0.05, front - cab + 0.02], red, 0, 1.15, (front + cab) / 2)
  for (const side of [1, -1]) {
    add(
      group,
      [(width - 1.2) / 2 + 0.06, 0.05, front - cab],
      red,
      side * (0.6 + (width - 1.2) / 4),
      0.95,
      (front + cab) / 2
    )
    add(
      group,
      [0.04, 0.2, front - cab],
      red,
      side * (half + 0.02),
      0.86,
      (front + cab) / 2
    )
    // The hood's latches, either side.
    add(group, [0.04, 0.1, 0.06], black, side * 0.63, 1.1, front - 0.35)
  }
  add(group, [1.24, 0.56, 0.06], red, 0, 0.86, front + 0.02)
  for (let i = -3; i <= 3; i++) {
    add(group, [0.05, 0.3, 0.02], black, i * 0.075, 0.86, front + 0.06)
  }
  for (const side of [1, -1]) {
    add(group, [0.2, 0.16, 0.04], black, side * 0.46, 0.93, front + 0.06)
    add(group, [0.17, 0.13, 0.02], lensWhite, side * 0.46, 0.93, front + 0.08)
    add(group, [0.12, 0.05, 0.02], lensAmber, side * 0.46, 0.75, front + 0.07)
  }
  // Black bumpers, the back one wrapping its corners, and the step under
  // each door.
  add(group, [width + 0.1, 0.18, 0.2], black, 0, 0.46, front + 0.13)
  add(group, [width + 0.06, 0.18, 0.18], black, 0, 0.46, rear - 0.08)
  for (const side of [1, -1]) {
    add(
      group,
      [0.12, 0.18, 0.4],
      black,
      side * (half + 0.02),
      0.46,
      rear + 0.12
    )
    add(group, [0.1, 0.06, 1.2], black, side * (half + 0.02), 0.54, cab - 0.75)
  }

  // The windshield, upright on its frame, and the hardtop from its header
  // to the open back.
  const shield = new THREE.Group()
  shield.position.set(0, belt, cab)
  shield.rotation.x = -0.1
  add(shield, [width, 0.06, 0.08], red, 0, 0.64, 0)
  for (const side of [1, -1])
    add(shield, [0.07, 0.66, 0.08], red, side * (half - 0.04), 0.32, 0)
  add(shield, [width - 0.14, 0.6, 0.03], glass, 0, 0.32, 0)
  group.add(shield)
  const roofFront = cab - 0.06
  add(
    group,
    [width + 0.02, 0.07, roofFront - rear],
    top,
    0,
    roof,
    (roofFront + rear) / 2
  )
  for (const side of [1, -1]) {
    const x = side * (half - 0.02)
    // The door's window, framed, then the hardtop's side: a black panel
    // with its long window, and the corner post at the back.
    add(group, [0.04, roof - belt, 0.06], top, x, (roof + belt) / 2, cab - 1.0)
    add(
      group,
      [0.03, roof - belt - 0.1, 0.9],
      glass,
      x,
      (roof + belt) / 2,
      cab - 0.52
    )
    add(
      group,
      [0.05, roof - belt, cab - 1.0 - rear],
      top,
      x,
      (roof + belt) / 2,
      (cab - 1.0 + rear) / 2
    )
    add(
      group,
      [0.02, 0.36, 0.95],
      glass,
      x + side * 0.02,
      (roof + belt) / 2 + 0.04,
      (cab - 1.0 + rear) / 2 + 0.05
    )
    add(group, [0.1, roof - belt, 0.08], top, x, (roof + belt) / 2, rear + 0.04)
    // The mirror on its arm, on the door.
    add(
      group,
      [0.16, 0.12, 0.04],
      black,
      side * (half + 0.12),
      belt + 0.1,
      cab - 0.12
    )
    // The taillights on the back corners.
    add(
      group,
      [0.1, 0.2, 0.03],
      lensRed,
      side * (half - 0.08),
      0.95,
      rear - 0.01
    )
  }

  // The rear glass, lifted up on its hinge at the roof's back edge.
  const hatch = new THREE.Group()
  hatch.position.set(0, roof, rear)
  hatch.rotation.x = 2.25
  add(
    hatch,
    [width - 0.1, roof - belt - 0.06, 0.04],
    top,
    0,
    -(roof - belt) / 2,
    0
  )
  add(
    hatch,
    [width - 0.28, roof - belt - 0.2, 0.02],
    glass,
    0,
    -(roof - belt) / 2,
    -0.025
  )
  group.add(hatch)
  // The tailgate dropped flat on its hinge at the floor, level with it,
  // the spare tyre on its face hanging under it.
  const tailgate = new THREE.Group()
  tailgate.position.set(0, floor, rear)
  add(tailgate, [width - 0.04, 0.06, gate], red, 0, -0.03, -gate / 2)
  const spare = new THREE.CylinderGeometry(0.36, 0.36, 0.22, 8)
  const s = new THREE.Mesh(spare, black)
  s.position.set(0, -0.17, -gate / 2)
  const sHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.23, 6),
    steel
  )
  sHub.position.copy(s.position)
  tailgate.add(s, sHub)
  group.add(tailgate)

  mergeStatic(group)
  castShadows(group)
  return group
}
