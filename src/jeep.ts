import * as THREE from 'three'
import { castShadows, lambert, mergeStatic } from './assetkit.ts'

// Tyler Etters' red 1995 Jeep Wrangler, a YJ, parked on the spawn Citgo's
// lot beside Moab Coldë (CONFIG.tyler places it): the square headlights in
// the seven-slot grille, flat fenders, a hardtop in the body's red, its
// one rear hatch lifted up on its hinges, so whoever sits in the back
// (figure.ts buildTyler) looks out over the lot.
// Scenery: it only blocks.

// --- The Jeep ------------------------------------------------------------

// Faces +Z, origin at ground level under the middle; left (the driver's
// side) is +X.
export const JEEP = {
  // Bumper to bumper, and across the body under the flares.
  length: 4.3,
  width: 1.6,
  wheel: 0.4,
  // The rear opening: where the body ends, the cargo floor's height, and
  // how deep the cargo runs in to the front seats' backs, room enough for
  // him to sit cross-legged with the laptop on the floor past his knees.
  rear: -2.1,
  floor: 0.78,
  cargo: 1.2,
  // The hardtop's roof, over the cargo floor.
  roof: 1.86,
}

// Tyler's as it stands; the traffic's (traffic.ts) in another paint with
// the hatch shut.
export function buildJeep({
  paint = '#a3161b',
  hatchOpen = true,
}: { paint?: string; hatchOpen?: boolean } = {}): THREE.Group {
  const { width, wheel, rear, floor, cargo, roof } = JEEP
  const front = rear + JEEP.length
  const group = new THREE.Group()
  group.name = 'jeep'
  const red = lambert({ color: paint })
  const black = lambert({ color: '#151518' })
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
    [width, belt - sill, cab - rear - cargo],
    red,
    0,
    (belt + sill) / 2,
    (cab + rear + cargo) / 2
  )
  for (const side of [1, -1]) {
    add(
      group,
      [0.06, belt - sill, cargo],
      red,
      side * (half - 0.03),
      (belt + sill) / 2,
      rear + cargo / 2
    )
  }
  add(
    group,
    [width - 0.12, floor - sill, cargo],
    red,
    0,
    (floor + sill) / 2,
    rear + cargo / 2
  )
  add(
    group,
    [width - 0.12, 0.02, cargo],
    carpet,
    0,
    floor + 0.01,
    rear + cargo / 2
  )
  // The front seats' backs, seen through the open back.
  for (const side of [1, -1]) {
    const back = rear + cargo + 0.15
    add(group, [0.5, 0.66, 0.14], black, side * 0.38, floor + 0.36, back)
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
    red,
    0,
    roof,
    (roofFront + rear) / 2
  )
  for (const side of [1, -1]) {
    const x = side * (half - 0.02)
    // The door's window, framed, then the hardtop's side: a red panel
    // with its long window, and the corner post at the back.
    add(group, [0.04, roof - belt, 0.06], red, x, (roof + belt) / 2, cab - 1.0)
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
      red,
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
    add(group, [0.1, roof - belt, 0.08], red, x, (roof + belt) / 2, rear + 0.04)
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

  // The one rear hatch, roof to sill, lifted up on its hinge at the
  // roof's back edge (or shut down over the back): red, with its window
  // in the upper half.
  const hatch = new THREE.Group()
  hatch.position.set(0, roof, rear)
  hatch.rotation.x = hatchOpen ? 1.95 : 0
  add(hatch, [width - 0.04, roof - sill, 0.05], red, 0, -(roof - sill) / 2, 0)
  add(
    hatch,
    [width - 0.28, roof - belt - 0.16, 0.02],
    glass,
    0,
    -(roof - belt) / 2,
    -0.03
  )
  group.add(hatch)

  mergeStatic(group)
  castShadows(group)
  return group
}

// --- The radar dish ------------------------------------------------------

// Tyler helps run the Citgo portals, and this is how he listens for them:
// a portable radar dish clamped to the hardtop on a stubby tripod, tipped
// up at the sky, with a feed horn held out over it on three struts. Its
// cable comes off the mast's foot (`socket`, in the dish's own space).
// Origin at the foot of the tripod.
export interface RadarDish {
  group: THREE.Group
  socket: THREE.Vector3
}

export function buildRadarDish(): RadarDish {
  const group = new THREE.Group()
  group.name = 'radar-dish'
  const grey = lambert({ color: '#c7c9c4', side: THREE.DoubleSide })
  const metal = lambert({ color: '#5d6166' })
  const black = lambert({ color: '#151518' })

  // The tripod: three splayed legs, a clamp plate under them.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.34), black)
  plate.position.y = 0.01
  group.add(plate)
  const mast = 0.42
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5),
      metal
    )
    leg.position.set(Math.cos(a) * 0.08, 0.13, Math.sin(a) * 0.08)
    leg.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)
    group.add(leg)
  }
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, mast, 6),
    metal
  )
  pole.position.y = mast / 2
  group.add(pole)

  // The dish on its yoke at the mast's head, a shallow paraboloid facing
  // up and out, the feed horn at its focus.
  const head = new THREE.Group()
  head.position.y = mast
  head.rotation.set(-0.75, 0.6, 0)
  group.add(head)
  const radius = 0.34
  const focal = 0.22
  const rim: THREE.Vector2[] = []
  for (let i = 0; i <= 6; i++) {
    const r = (i / 6) * radius
    rim.push(new THREE.Vector2(r, (r * r) / (4 * focal)))
  }
  const dish = new THREE.Mesh(new THREE.LatheGeometry(rim, 14), grey)
  dish.rotation.x = Math.PI / 2
  dish.position.z = 0.04
  head.add(dish)
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8),
    metal
  )
  hub.rotation.x = Math.PI / 2
  head.add(hub)
  const horn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.04, 0.08, 6),
    black
  )
  horn.rotation.x = Math.PI / 2
  horn.position.z = 0.04 + focal
  head.add(horn)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    const from = new THREE.Vector3(
      Math.cos(a) * radius * 0.92,
      Math.sin(a) * radius * 0.92,
      0.04 + (radius * radius) / (4 * focal)
    )
    const to = new THREE.Vector3(0, 0, 0.04 + focal)
    const length = from.distanceTo(to)
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, length, 4),
      metal
    )
    strut.position.copy(from).add(to).multiplyScalar(0.5)
    strut.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize()
    )
    head.add(strut)
  }

  mergeStatic(group)
  castShadows(group)
  return { group, socket: new THREE.Vector3(0.05, 0.04, 0) }
}

// A cable laid through `points` (a black rubber run, sagging where the
// points let it), as Tyler's runs from the dish to the laptop.
export function buildCable(points: readonly THREE.Vector3[]): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3([...points])
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(curve, points.length * 10, 0.009, 4),
    lambert({ color: '#121214' })
  )
  cable.name = 'dish-cable'
  return cable
}
