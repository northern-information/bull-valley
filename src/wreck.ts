import * as THREE from 'three'
import {
  castShadows,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  mergeStatic,
  setMotion,
} from './assetkit.ts'
import { buildFlames, getFlameParts } from './fire.ts'
import { mulberry32, range } from './rng.ts'

// The wreck across Lake Avenue from the corn maze (CONFIG.wreck places
// it): a green BMW nosed into a tree, smouldering, its hazards blinking.

// --- The wreck -----------------------------------------------------------

// A green BMW sedan, a boxy late-80s three-series, nosed into a tree by
// the spawn Citgo and left there smouldering: the front end folded back
// round the trunk, the hood buckled up into a tent, the front bumper
// hanging off one end, the left front wheel knocked in. Smoke climbs off
// the engine bay with a few low flames under it, and the hazards still
// blink. A limb off the tree lies across the roof. Scenery: it only
// blocks. Faces +Z, the tree at its nose; origin at ground level under the
// car's middle. CONFIG.wreck places it and sizes its walls.
export const WRECK = {
  // The car as it was, then how far the tree pushed its nose in.
  length: 4.3,
  width: 1.65,
  crush: 0.45,
  wheel: 0.31,
  // The tree's middle, ahead of the car's middle, and its trunk's radius.
  treeAhead: 2.15,
  treeRadius: 0.32,
}

export interface Wreck {
  group: THREE.Group
  update(t: number): void
}

// The smoke off the engine bay: this many puffs at once, each this many
// seconds from the hood to gone, climbing this high, spreading this wide,
// leaning downwind this far by the top.
const WRECK_SMOKE = {
  puffs: 28,
  seconds: 7,
  rise: 7,
  spread: 1.6,
  lean: 2.2,
  size: 1.5,
}

export function buildWreck(seed = 0xb3e30): Wreck {
  const rng = mulberry32(seed)
  const { length, width, crush, wheel, treeAhead, treeRadius } = WRECK
  const group = new THREE.Group()
  group.name = 'wreck'
  const paint = lambert({ color: '#3b8a4a' })
  const paintDark = lambert({ color: '#2b6838' })
  const black = lambert({ color: '#141414' })
  const chrome = lambert({ color: '#9aa1a8' })
  const glass = lambert({ color: '#1b252e' })
  const box = (
    parent: THREE.Object3D,
    size: [number, number, number],
    at: [number, number, number],
    material: THREE.Material,
    turn: [number, number, number] = [0, 0, 0]
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...at)
    mesh.rotation.set(...turn)
    parent.add(mesh)
    return mesh
  }

  // The car, settled a little nose-down on the knocked-in wheel.
  const car = new THREE.Group()
  car.name = 'wreck-car'
  car.rotation.set(0.035, 0, -0.03)
  group.add(car)
  const back = -length / 2
  const nose = length / 2 - crush
  const sill = wheel * 0.9
  const waist = sill + 0.52
  const halfW = width / 2
  // The body from the tail to the crushed nose, then the hood, buckled up
  // into a ridge across the car where the tree stopped it.
  const bodyLength = nose - back
  box(
    car,
    [width, waist - sill, bodyLength],
    [0, (sill + waist) / 2, (nose + back) / 2],
    paint
  )
  const hoodBack = 0.75
  const hoodRun = (nose - hoodBack) / 2
  const ridge = 0.16
  const pitch = Math.atan2(ridge, hoodRun)
  const plate = Math.hypot(hoodRun, ridge) + 0.04
  box(
    car,
    [width - 0.04, 0.04, plate],
    [0, waist + ridge / 2, hoodBack + hoodRun / 2],
    paint,
    [-pitch, 0, 0.03]
  )
  box(
    car,
    [width - 0.04, 0.04, plate],
    [0, waist + ridge / 2, nose - hoodRun / 2],
    paintDark,
    [pitch, 0, -0.05]
  )
  // The greenhouse: tall glass and thin pillars under a flat roof, and
  // the trunk lid behind it.
  const cabinFront = 0.7
  const cabinBack = -1.25
  const roof = waist + 0.55
  box(
    car,
    [width - 0.12, roof - waist, cabinFront - cabinBack - 0.25],
    [0, (waist + roof) / 2, (cabinFront + cabinBack) / 2 - 0.05],
    glass
  )
  box(
    car,
    [width - 0.1, 0.05, cabinFront - cabinBack - 0.55],
    [0, roof, (cabinFront + cabinBack) / 2 - 0.1],
    paint
  )
  for (const x of [-1, 1]) {
    // The A-pillars raked back to the roof, the C-pillars down to the
    // trunk.
    box(
      car,
      [0.07, 0.62, 0.07],
      [x * (halfW - 0.08), (waist + roof) / 2, cabinFront - 0.12],
      paint,
      [-0.5, 0, 0]
    )
    box(
      car,
      [0.07, 0.6, 0.09],
      [x * (halfW - 0.08), (waist + roof) / 2, cabinBack + 0.1],
      paint,
      [0.45, 0, 0]
    )
  }
  box(car, [width - 0.04, 0.06, 0.95], [0, waist + 0.03, back + 0.48], paint)
  // The bumpers, black and square: the rear one true, the front one torn
  // loose at one end and hanging to the grass.
  box(car, [width + 0.06, 0.12, 0.1], [0, sill + 0.08, back - 0.03], black)
  box(
    car,
    [width * 0.9, 0.12, 0.1],
    [-0.12, sill - 0.05, nose + 0.06],
    black,
    [0, 0.22, -0.32]
  )
  // The kidney grille and the four round headlights, pushed in with the
  // nose: one lamp smashed dark, its lens on the ground.
  for (const x of [-0.09, 0.09]) {
    box(car, [0.13, 0.17, 0.03], [x, waist - 0.12, nose + 0.01], chrome)
  }
  const lamp = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 8)
  lamp.rotateX(Math.PI / 2)
  const lit = lambert({
    color: '#f2ead0',
    emissive: new THREE.Color('#5a5440'),
  })
  for (const [x, i] of [
    [-0.6, 0],
    [-0.42, 1],
    [0.42, 2],
    [0.6, 3],
  ] as const) {
    const mesh = new THREE.Mesh(lamp, i === 0 ? black : lit)
    mesh.position.set(x, waist - 0.12, nose + 0.01)
    car.add(mesh)
  }
  box(
    car,
    [width - 0.1, 0.13, 0.03],
    [0, waist - 0.12, back - 0.01],
    lambert({ color: '#5a1214' })
  )
  // Mirrors, door seams and a stripe of black rubbing strip down each side.
  for (const x of [-1, 1]) {
    box(
      car,
      [0.03, 0.05, bodyLength - 0.2],
      [x * (halfW + 0.01), sill + 0.22, (nose + back) / 2],
      black
    )
    box(
      car,
      [0.12, 0.08, 0.06],
      [x * (halfW + 0.05), waist + 0.12, cabinFront - 0.15],
      paint
    )
    for (const z of [cabinFront - 0.95, cabinBack + 0.45]) {
      box(
        car,
        [0.015, waist - sill - 0.08, 0.015],
        [x * (halfW + 0.005), (sill + waist) / 2, z],
        black
      )
    }
  }
  // The wheels: the left front knocked in and splayed, the rest as they
  // stopped.
  const tyre = new THREE.CylinderGeometry(wheel, wheel, 0.2, 10)
  tyre.rotateZ(Math.PI / 2)
  const hub = new THREE.CylinderGeometry(wheel * 0.55, wheel * 0.55, 0.21, 8)
  hub.rotateZ(Math.PI / 2)
  const axleFront = nose - 0.62
  const axleBack = back + 0.78
  for (const [x, z, toe, camber] of [
    [-1, axleFront, 0.45, 0.25],
    [1, axleFront, 0.12, 0],
    [-1, axleBack, 0, 0],
    [1, axleBack, 0, 0],
  ] as const) {
    const at = new THREE.Group()
    at.position.set(x * (halfW - 0.12), wheel - (camber ? 0.06 : 0), z)
    at.rotation.set(0, toe, camber * x)
    at.add(new THREE.Mesh(tyre, black), new THREE.Mesh(hub, chrome))
    car.add(at)
  }

  // The tree it hit: a thick trunk scarred pale where the bumper bit in,
  // leaning back a little, under a dark canopy like the valley's own.
  const tree = new THREE.Group()
  tree.name = 'wreck-tree'
  tree.position.set(0.15, 0, treeAhead)
  tree.rotation.set(0.06, 0, 0.04)
  group.add(tree)
  const trunkH = 4.2
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(treeRadius * 0.6, treeRadius, trunkH + 0.5, 7),
    lambert({ color: '#33271a' })
  )
  trunk.position.y = trunkH / 2 - 0.25
  tree.add(trunk)
  box(
    tree,
    [0.32, 0.3, 0.06],
    [-0.05, 0.55, -treeRadius + 0.02],
    lambert({ color: '#b39a72' })
  )
  const canopy = lambert({ color: '#26402a' })
  for (const [y, r, h] of [
    [2.6, 2.1, 3.4],
    [4.1, 1.5, 2.6],
  ] as const) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), canopy)
    cone.position.y = y + h / 2
    cone.rotation.y = range(rng, 0, Math.PI)
    tree.add(cone)
  }
  // The limb the crash shook loose, across the roof and down the glass.
  const limb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.09, 2.2, 5),
    lambert({ color: '#3a2d1e' })
  )
  limb.position.set(0.25, roof + 0.08, 0.15)
  limb.rotation.set(1.35, 0.6, 0)
  group.add(limb)

  // Glass and bits of grille in the grass round the nose.
  const shard = new THREE.BoxGeometry(0.07, 0.01, 0.05)
  const shards = [lambert({ color: '#c9d6dc' }), black, paintDark]
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(shard, shards[i % shards.length])
    const a = range(rng, -Math.PI * 0.9, Math.PI * 0.9)
    const d = range(rng, 0.4, 1.6)
    mesh.position.set(
      Math.sin(a) * d,
      0.01,
      nose + 0.2 + Math.abs(Math.cos(a)) * d * 0.6
    )
    mesh.rotation.y = range(rng, 0, Math.PI)
    mesh.scale.setScalar(range(rng, 0.7, 1.6))
    group.add(mesh)
  }
  mergeStatic(group)
  castShadows(group)

  // The hazards, still blinking: an amber lamp at each corner and a glow
  // over each.
  const amber = makeGlowTexture('rgba(255, 160, 40, 0.8)')
  const blinkers = [
    [-halfW + 0.05, nose - 0.05],
    [halfW - 0.05, nose - 0.05],
    [-halfW + 0.08, back - 0.02],
    [halfW - 0.08, back - 0.02],
  ].map(([x, z]) => {
    const sprite = makeGlowSprite(amber, 0.6)
    sprite.position.set(x, waist - 0.1, z)
    car.add(sprite)
    return sprite
  })

  // Smouldering under the hood: a few low flames in the gap the buckle
  // opened, and the smoke off them climbing over the tree and leaning
  // downwind.
  const fire = buildFlames(
    [
      { at: [-0.25, waist + 0.02, nose - 0.35], size: 0.16 },
      { at: [0.1, waist + 0.05, nose - 0.45], size: 0.22 },
      { at: [0.4, waist + 0.02, nose - 0.3], size: 0.13 },
    ],
    0xe30
  )
  car.add(fire.group)
  const { smoke } = getFlameParts()
  const puffs = Array.from({ length: WRECK_SMOKE.puffs }, (_, k) => ({
    offset: (k + rng()) / WRECK_SMOKE.puffs,
    turn: range(rng, 0, Math.PI * 2),
    shade: range(rng, 0.1, 0.22),
  }))
  const smokeGeo = new THREE.BufferGeometry()
  smokeGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(puffs.length * 3), 3)
  )
  smokeGeo.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(puffs.length * 4), 4)
  )
  const plume = new THREE.Points(
    smokeGeo,
    new THREE.PointsMaterial({
      map: smoke,
      size: WRECK_SMOKE.size,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    })
  )
  plume.name = 'wreck-smoke'
  // The puffs move every frame; their bounds would go stale.
  plume.frustumCulled = false
  group.add(plume)
  const smokeFrom = new THREE.Vector3(0.1, waist + 0.15, nose - 0.4)

  const update = (t: number) => {
    fire.update(t)
    // Hazards: on a little under half of each beat.
    const on = (t * 1.4) % 1 < 0.45
    for (const sprite of blinkers) sprite.visible = on
    const at = smokeGeo.getAttribute('position') as THREE.BufferAttribute
    const color = smokeGeo.getAttribute('color') as THREE.BufferAttribute
    const { seconds, rise, spread, lean } = WRECK_SMOKE
    puffs.forEach(({ offset, turn, shade }, i) => {
      const age = t / seconds + offset
      const life = age - Math.floor(age)
      const a = turn + Math.floor(age) * 2.4
      const out = spread * Math.sqrt(life)
      at.setXYZ(
        i,
        smokeFrom.x +
          Math.cos(a) * out +
          lean * life * life +
          Math.sin(t * 0.7 + turn) * 0.15,
        smokeFrom.y + rise * life,
        smokeFrom.z + Math.sin(a) * out * 0.6
      )
      // Thick off the hood, thinning as it climbs.
      const alpha = 0.75 * Math.min(1, life * 6) * (1 - life)
      color.setXYZW(i, shade, shade, shade * 1.05, alpha)
    })
    at.needsUpdate = true
    color.needsUpdate = true
  }
  update(0)
  setMotion(group, update)
  return { group, update }
}
