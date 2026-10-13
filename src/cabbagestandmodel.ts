import * as THREE from 'three'
import { artTexture, lambert, mergeStatic } from './assetkit.ts'
import { mulberry32, range } from './rng.ts'
import { paintAwning, paintOpenBoard, paintStandSign } from './standart.ts'

// The Bull Valley Cabbage Stand as seen (stand.ts keeps the ledger): the
// stand itself, and the dressing each level adds over it.

// --- Cabbage stand -------------------------------------------------------

// The Bull Valley Cabbage Stand, set up on the spawn Citgo's lot: a
// weathered plank table under a lean-to roof, the painted board on the
// roof's lip, cabbages on the table and a crate of them on the ground.
// Scenery: the heads are not pickups. Faces +Z, long side along X; origin
// at ground level under the middle. CONFIG.stand places it and sizes its
// wall.
const CABBAGE_STAND = {
  width: 2.4,
  depth: 1.1,
  table: 0.85,
  // The roof's back and front edges, over the table's back and front.
  roofBack: 2.3,
  roofFront: 2.0,
}

export function buildCabbageStand(seed = 0xcab5): THREE.Group {
  const rng = mulberry32(seed)
  const { width, depth, table, roofBack, roofFront } = CABBAGE_STAND
  const group = new THREE.Group()
  group.name = 'cabbage-stand'
  const wood = lambert({ color: '#6b5236' })
  const plank = lambert({ color: '#8a6d48' })
  const box = (
    size: [number, number, number],
    at: [number, number, number],
    material: THREE.Material
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...at)
    group.add(mesh)
    return mesh
  }
  // Four posts: the back pair carry the roof's high edge, the front pair
  // its low one.
  const postX = width / 2 - 0.06
  const postZ = depth / 2 - 0.06
  for (const x of [-postX, postX]) {
    box([0.09, roofBack, 0.09], [x, roofBack / 2, -postZ], wood)
    box([0.09, roofFront, 0.09], [x, roofFront / 2, postZ], wood)
  }
  // The table: a plank top on a skirt, a shelf low down.
  box([width, 0.05, depth], [0, table, 0], plank)
  box([width - 0.1, 0.18, 0.03], [0, table - 0.12, postZ], wood)
  box([width - 0.1, 0.03, depth - 0.15], [0, 0.25, 0], plank)
  // The roof: boards sloping from back to front, overhanging both.
  const rise = roofBack - roofFront
  const run = depth + 0.3
  const roof = box(
    [width + 0.3, 0.04, Math.hypot(run, rise)],
    [0, (roofBack + roofFront) / 2 + 0.04, 0],
    lambert({ color: '#5a4a3a' })
  )
  roof.rotation.x = Math.atan2(rise, run)
  // Plain heads, the color of the field ones but unlit: nothing to take.
  const leaf = lambert({ color: '#4f7a3a' })
  const head = new THREE.SphereGeometry(0.16, 6, 5)
  const lay = (x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(head, leaf)
    mesh.position.set(x, y, z)
    mesh.rotation.set(range(rng, 0, Math.PI), range(rng, 0, Math.PI), 0)
    mesh.scale.y = 0.85
    group.add(mesh)
  }
  for (let i = 0; i < 7; i++) {
    lay(
      -width / 2 + 0.3 + (i / 6) * (width - 0.6) + range(rng, -0.05, 0.05),
      table + 0.15,
      range(rng, -0.25, 0.2)
    )
  }
  // The crate at the table's foot, heads heaped in it.
  const crateX = width / 2 - 0.35
  const crateZ = depth / 2 + 0.35
  box([0.5, 0.3, 0.4], [crateX, 0.15, crateZ], plank)
  for (let i = 0; i < 4; i++) {
    lay(
      crateX + range(rng, -0.12, 0.12),
      0.38 + range(rng, 0, 0.06),
      crateZ + range(rng, -0.08, 0.08)
    )
  }
  mergeStatic(group)
  // The painted board, hung under the roof's front lip.
  const texture = artTexture(paintStandSign())
  const face = lambert({
    map: texture,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: 0.4,
  })
  // BoxGeometry face order is +x, -x, +y, -y, +z, -z.
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.8, (width * 0.8) / 4, 0.03),
    [wood, wood, wood, wood, face, wood]
  )
  sign.position.set(0, roofFront - 0.25, postZ + 0.07)
  group.add(sign)
  return group
}

// What a raider's stand has bought with its levels (stand.ts), laid over
// buildCabbageStand in the same space: from level 2 a striped canopy out
// over the front, from 3 a grey cash box on the table, at 4 a
// hand-painted OPEN board out front. Level 1 adds nothing.
export function buildStandDressing(level: number): THREE.Group {
  const { width, depth, table, roofFront } = CABBAGE_STAND
  const group = new THREE.Group()
  group.name = 'cabbage-stand-dressing'
  const wood = lambert({ color: '#6b5236' })
  const front = depth / 2
  if (level >= 2) {
    // The cloth runs out off the roof's front lip, falling only a little,
    // so the painted board under the lip still shows beneath it.
    const cloth = artTexture(paintAwning())
    const stripes = lambert({ map: cloth, side: THREE.DoubleSide })
    const reach = 0.7
    const drop = 0.08
    const lip = roofFront + 0.02
    const awning = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 0.3, Math.hypot(reach, drop)),
      stripes
    )
    awning.rotation.x = -Math.PI / 2 + Math.atan2(drop, reach)
    awning.position.set(0, lip - drop / 2, front + 0.15 + reach / 2)
    group.add(awning)
    // Two poles hold its front edge up.
    for (const x of [-(width + 0.3) / 2 + 0.05, (width + 0.3) / 2 - 0.05]) {
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, lip - drop, 0.05),
        wood
      )
      pole.position.set(x, (lip - drop) / 2, front + 0.15 + reach)
      group.add(pole)
    }
  }
  if (level >= 3) {
    // A grey steel cash box at the table's end, its lid propped open on
    // the coin tray.
    const steel = lambert({ color: '#6d7780' })
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.24), steel)
    box.position.set(width / 2 - 0.3, table + 0.085, 0.1)
    group.add(box)
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.24), steel)
    lid.position.set(width / 2 - 0.3, table + 0.2, -0.04)
    lid.rotation.x = -1.1
    group.add(lid)
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.01, 0.2),
      lambert({ color: '#b9a24c' })
    )
    tray.position.set(width / 2 - 0.3, table + 0.15, 0.1)
    group.add(tray)
  }
  if (level >= 4) {
    // The sandwich board stands at the table's other end, out front,
    // turned a little toward the pumps.
    const face = artTexture(paintOpenBoard())
    const painted = lambert({
      map: face,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: face,
      emissiveIntensity: 0.35,
    })
    const board = new THREE.Group()
    const tall = 0.95
    const lean = 0.22
    for (const side of [1, -1]) {
      // BoxGeometry face order is +x, -x, +y, -y, +z, -z.
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.6, tall, 0.025), [
        wood,
        wood,
        wood,
        wood,
        painted,
        wood,
      ])
      panel.position.set(0, tall / 2 - 0.02, side * 0.12)
      panel.rotation.set(-side * lean, side < 0 ? Math.PI : 0, 0)
      board.add(panel)
    }
    board.position.set(-width / 2 - 0.2, 0, front + 0.75)
    board.rotation.y = 0.35
    group.add(board)
  }
  return group
}
