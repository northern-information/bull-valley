import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  artTexture,
  castShadows,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  setMotion,
} from './assetkit.ts'
import {
  isCutOut,
  paintMallArt,
  paintPylonHeader,
  paintPylonPanel,
  PYLON_PANELS,
} from './mallart.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'
import { STRIP_MALL } from './stripmall.ts'
import type { CanvasArt } from './canvas.ts'
import type { MallBox, MallFinish, MallSign } from './stripmall.ts'

// --- Bull Valley Plaza ---------------------------------------------------

// The dead strip mall beside the spawn Citgo, from STRIP_MALL (stripmall.ts)
// in mall-local space: every box merged into one mesh per finish, so the
// whole building costs a couple of dozen draw calls, and the painted
// panels over it. Nothing is lit but one fluorescent tube in the
// laundromat, flickering, and the candles in the Golden Wok; the rest is
// for the flashlight. world.ts places the group at the plaza's origin.
const MALL_FINISH: Record<MallFinish, () => THREE.Material> = {
  block: () => lambert({ color: '#9a9284' }),
  brick: () => lambert({ color: '#6e4a3a' }),
  floor: () => lambert({ color: '#6d6a60' }),
  concrete: () => lambert({ color: '#7d7a72' }),
  ceiling: () => lambert({ color: '#4a4842' }),
  fascia: () => lambert({ color: '#a89c80' }),
  glass: () =>
    applyPS1(
      new THREE.MeshBasicMaterial({
        color: '#8fa6a8',
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    ),
  plywood: () => lambert({ color: '#8a7448' }),
  steel: () => lambert({ color: '#5d6266' }),
  fixture: () => lambert({ color: '#2f3338' }),
  enamel: () => lambert({ color: '#c9c6b8' }),
  laminate: () => lambert({ color: '#9b8a6a' }),
  tile: () => lambert({ color: '#b8b2a2' }),
  tape: () => lambert({ color: '#141414' }),
  plastic: () => lambert({ color: '#c46a24' }),
  vending: () => lambert({ color: '#7e1e1a' }),
  mirror: () =>
    lambert({
      color: '#6c7a80',
      emissive: new THREE.Color('#2a3236'),
      emissiveIntensity: 0.6,
    }),
  mattress: () => lambert({ color: '#a9a07c' }),
  blanket: () => lambert({ color: '#3f4d5c' }),
  candle: () =>
    lambert({ color: '#e8e0c8', emissive: new THREE.Color('#5a4a2a') }),
  flame: () => applyPS1(new THREE.MeshBasicMaterial({ color: '#ffb347' })),
  tube: () => applyPS1(new THREE.MeshBasicMaterial({ color: '#eaf1ee' })),
  'dead-tube': () => lambert({ color: '#8c8f88' }),
  cardboard: () => lambert({ color: '#9c7c52' }),
  xxx: () =>
    lambert({
      color: '#c2306e',
      emissive: new THREE.Color('#5a1030'),
      emissiveIntensity: 0.5,
    }),
  beads: () =>
    lambert({ color: '#b07a2a', emissive: new THREE.Color('#3a2408') }),
  redlight: () => applyPS1(new THREE.MeshBasicMaterial({ color: '#ff2a2a' })),
}

// A box from the layout as geometry in mall-local space, turned if it was
// tipped.
function mallBoxGeometry(b: MallBox): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(...b.size)
  if (b.turn) {
    geometry.applyMatrix4(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...b.turn))
    )
  }
  geometry.translate(...b.center)
  return geometry.toNonIndexed()
}

// A painted panel, its art on the front; the cut-outs (graffiti, chalk)
// see-through round their paint. A faint glow of its own keeps a sign
// readable by moonlight; the cut-outs take only what light falls on them.
function mallSignMesh(sign: MallSign): THREE.Mesh {
  const texture = artTexture(paintMallArt(sign.art))
  const cut = isCutOut(sign.art)
  const material = lambert({
    map: texture,
    transparent: cut,
    alphaTest: cut ? 0.1 : 0,
    depthWrite: !cut,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: cut ? 0.05 : 0.3,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...sign.size), material)
  mesh.name = `plaza-${sign.name}`
  mesh.position.set(...sign.center)
  mesh.rotation.set(...sign.turn)
  return mesh
}

export interface StripMallRig {
  group: THREE.Group
  // The back room's locked door, its leaf on its hinge: the glow rings it
  // while E would only rattle it.
  door: THREE.Object3D
  // The flicker and the candles, and the door swinging toward where
  // setDoorOpen last asked.
  update(t: number): void
  // Swing the locked door open (for this raider alone: they carry the key
  // or are already behind it) or shut.
  setDoorOpen(open: boolean): void
}

// How far the back room's door swings open, in radians, and how fast.
const MALL_DOOR = { open: 1.45, speed: 2.4 }

// The laundromat's tube: on, mostly, with stutters of dark, the pattern
// repeating every few seconds. Brightness from 0 to 1 at time t.
function tubeFlicker(t: number): number {
  const beat = t % 5.3
  if (beat > 4.1 && beat < 4.6) return Math.sin(beat * 90) > 0.2 ? 1 : 0.05
  if (beat > 1.2 && beat < 1.3) return 0.15
  return 0.9 + 0.1 * Math.sin(t * 50)
}

export function buildStripMall(): StripMallRig {
  const group = new THREE.Group()
  group.name = 'strip-mall'
  const byFinish = new Map<MallFinish, THREE.BufferGeometry[]>()
  for (const b of STRIP_MALL.boxes) {
    const list = byFinish.get(b.finish) ?? []
    list.push(mallBoxGeometry(b))
    byFinish.set(b.finish, list)
  }
  let tube: THREE.MeshBasicMaterial | null = null
  let flame: THREE.MeshBasicMaterial | null = null
  for (const [finish, geometries] of byFinish) {
    const geometry = mergeGeometries(geometries)
    const material = MALL_FINISH[finish]()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `plaza-${finish}`
    // The slab and the glass throw nothing; the rest of it shades itself.
    mesh.castShadow = finish !== 'concrete' && finish !== 'glass'
    mesh.receiveShadow = true
    group.add(mesh)
    if (finish === 'tube') tube = material as THREE.MeshBasicMaterial
    if (finish === 'flame') flame = material as THREE.MeshBasicMaterial
  }
  // The locked door: a steel leaf on a pivot at its hinge, swinging into
  // the shop, the EMPLOYEES ONLY plate riding on it.
  const { lock } = STRIP_MALL
  const door = new THREE.Group()
  door.name = 'plaza-locked-door'
  door.position.set(lock.hinge.x, 0, lock.hinge.z)
  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, lock.height, lock.width - 0.04),
    lambert({ color: '#5a4f44' })
  )
  leaf.position.set(0.03, lock.height / 2, lock.width / 2)
  leaf.castShadow = true
  leaf.receiveShadow = true
  door.add(leaf)
  const knob = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.06, 0.06),
    lambert({ color: '#b09040' })
  )
  knob.position.set(0.08, 1.0, lock.width - 0.12)
  door.add(knob)
  group.add(door)
  // The adult section's red bulb throws a red haze round itself.
  const bulb = STRIP_MALL.boxes.find((b) => b.name === 'adult-bulb')
  if (bulb) {
    const haze = makeGlowSprite(makeGlowTexture('rgba(255, 40, 40, 0.55)'), 3.2)
    haze.position.set(...bulb.center)
    group.add(haze)
  }
  for (const sign of STRIP_MALL.signs) {
    const mesh = mallSignMesh(sign)
    group.add(mesh)
    if (sign.art === 'employees') door.attach(mesh)
  }
  const lit = new THREE.Color('#eaf1ee')
  const warm = new THREE.Color('#ffb347')
  let wanted = 0
  let last: number | null = null
  const update = (t: number) => {
    tube?.color.copy(lit).multiplyScalar(tubeFlicker(t))
    flame?.color
      .copy(warm)
      .multiplyScalar(0.8 + 0.2 * Math.sin(t * 13) * Math.sin(t * 7.3))
    const dt = last === null ? 0 : Math.max(0, Math.min(0.1, t - last))
    last = t
    const step = MALL_DOOR.speed * dt
    const now = door.rotation.y
    door.rotation.y =
      now < wanted ? Math.min(wanted, now + step) : Math.max(wanted, now - step)
  }
  update(0)
  setMotion(group, update)
  return {
    group,
    door,
    update,
    setDoorOpen(open) {
      wanted = open ? MALL_DOOR.open : 0
    },
  }
}

// The pylon by the road: two steel legs, the plaza's name across the top,
// and a panel for every tenant under it. Its origin is on the ground
// between its legs; the panels face +X, toward the road, and -X.
export const PLAZA_SIGN = {
  legs: 1.4,
  leg: 0.22,
  width: 2.6,
  header: { y: 6.2, height: 1.0 },
  panel: { top: 5.6, height: 0.5, gap: 0.08 },
  depth: 0.35,
}

export function buildPlazaSign(): THREE.Group {
  const S = PLAZA_SIGN
  const group = new THREE.Group()
  group.name = 'plaza-sign'
  const steel = lambert({ color: '#4c5155' })
  const frame = lambert({ color: '#2b3a2f' })
  const top = S.header.y + S.header.height / 2
  for (const z of [-S.legs / 2, S.legs / 2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(S.leg, top, S.leg), steel)
    leg.position.set(0, top / 2, z)
    group.add(leg)
  }
  const face = (art: CanvasArt) => {
    const texture = artTexture(art)
    return lambert({
      map: texture,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: texture,
      emissiveIntensity: 0.3,
    })
  }
  // A cabinet with art on both broad faces (+X and -X); BoxGeometry face
  // order is +x, -x, +y, -y, +z, -z.
  const cabinet = (art: CanvasArt, y: number, height: number) => {
    const painted = face(art)
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(S.depth, height, S.width),
      [painted, painted, frame, frame, frame, frame]
    )
    mesh.position.y = y
    group.add(mesh)
    return mesh
  }
  cabinet(paintPylonHeader(), S.header.y, S.header.height)
  PYLON_PANELS.forEach((label, i) => {
    const y =
      S.panel.top - S.panel.height / 2 - i * (S.panel.height + S.panel.gap)
    const panel = cabinet(paintPylonPanel(label, 0x9a1 + i), y, S.panel.height)
    // The kicked-in one hangs crooked in its frame.
    if (label === null) panel.rotation.x = 0.08
  })
  castShadows(group)
  return group
}

// A steel dumpster, its lids thrown back, standing on the alley: the
// origin on the ground under its middle, its length along X.
export const DUMPSTER = { length: 1.9, width: 1.3, height: 1.25 }

export function buildDumpster(fallen = false): THREE.Group {
  const { length, width, height } = DUMPSTER
  const group = new THREE.Group()
  group.name = 'dumpster'
  const body = lambert({ color: '#2f4f3a' })
  const rust = lambert({ color: '#5a3a24' })
  const lid = lambert({ color: '#1c1c1c' })
  const bin = new THREE.Group()
  group.add(bin)
  const add = (
    size: [number, number, number],
    at: [number, number, number],
    material: THREE.Material,
    turn: [number, number, number] = [0, 0, 0]
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...at)
    mesh.rotation.set(...turn)
    bin.add(mesh)
  }
  const wall = 0.05
  add([length, 0.08, width], [0, 0.18, 0], body)
  add([length, height - 0.14, wall], [0, height / 2 + 0.07, width / 2], body)
  add([length, height - 0.14, wall], [0, height / 2 + 0.07, -width / 2], body)
  add([wall, height - 0.14, width], [length / 2, height / 2 + 0.07, 0], body)
  add([wall, height - 0.14, width], [-length / 2, height / 2 + 0.07, 0], body)
  add([length * 0.6, 0.35, wall + 0.01], [0.2, 0.45, width / 2], rust)
  // The skids, and the lids flung back over the far side.
  for (const x of [-length / 3, length / 3]) {
    add([0.12, 0.14, width + 0.1], [x, 0.07, 0], lid)
  }
  for (const x of [-length / 4, length / 4]) {
    add(
      [length / 2 - 0.04, 0.03, width * 0.9],
      [x, height + 0.25, -width / 2 - 0.2],
      lid,
      [-1.9, 0, 0]
    )
  }
  // Trash bags spilling out of it.
  const bag = lambert({ color: '#151515' })
  const rng = mulberry32(fallen ? 0xd0a : 0xd0b)
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), bag)
    mesh.position.set(
      range(rng, -0.6, 0.6),
      height - 0.15,
      range(rng, -0.3, 0.3)
    )
    mesh.rotation.set(range(rng, 0, 3), range(rng, 0, 3), 0)
    bin.add(mesh)
  }
  if (fallen) {
    // Over on its side, the open top to the alley, its bags out on the
    // ground.
    bin.rotation.x = Math.PI / 2
    bin.position.y = width / 2
    bin.position.z = -height / 2
  }
  castShadows(group)
  return group
}

// A shopping cart, low-poly wire as thin boxes: the origin on the ground
// under its middle, its handle toward -X.
export function buildShoppingCart(fallen = false): THREE.Group {
  const group = new THREE.Group()
  group.name = 'shopping-cart'
  const wire = lambert({ color: '#8d9296' })
  const rubber = lambert({ color: '#1a1a1a' })
  const cart = new THREE.Group()
  group.add(cart)
  const bar = (
    size: [number, number, number],
    at: [number, number, number],
    material: THREE.Material = wire
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...at)
    cart.add(mesh)
  }
  const [l, w] = [0.9, 0.55]
  // The basket: a floor, two sides, a front and a back, as frames.
  bar([l, 0.02, w], [0, 0.45, 0])
  for (const z of [-w / 2, w / 2]) {
    bar([l, 0.02, 0.02], [0, 0.95, z])
    for (let i = 0; i <= 4; i++) {
      bar([0.015, 0.5, 0.015], [-l / 2 + (i * l) / 4, 0.7, z])
    }
    // The legs, raked, down to the casters.
    bar([0.03, 0.42, 0.03], [-l / 2 + 0.05, 0.22, z])
    bar([0.03, 0.42, 0.03], [l / 2 - 0.08, 0.22, z * 0.8])
    bar([0.09, 0.09, 0.04], [-l / 2 + 0.05, 0.045, z], rubber)
    bar([0.09, 0.09, 0.04], [l / 2 - 0.08, 0.045, z * 0.8], rubber)
  }
  bar([0.02, 0.55, w], [l / 2, 0.68, 0])
  bar([0.02, 0.5, w], [-l / 2, 0.7, 0])
  // The handle.
  bar(
    [0.04, 0.04, w + 0.06],
    [-l / 2 - 0.12, 1.02, 0],
    lambert({ color: '#a8251f' })
  )
  if (fallen) {
    cart.rotation.x = Math.PI / 2 - 0.1
    cart.position.y = w / 2 + 0.02
  }
  castShadows(group)
  return group
}
