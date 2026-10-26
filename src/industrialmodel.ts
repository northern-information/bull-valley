import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  artTexture,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
} from './assetkit.ts'
import {
  buildingBoxes,
  buildingSigns,
  FENCE,
  forklift,
  INDUSTRIAL,
  propBoxes,
  propSigns,
} from './industrial.ts'
import {
  isWorksCutOut,
  paintChainLink,
  paintWorksArt,
} from './industrialart.ts'
import { applyPS1 } from './ps1.ts'
import type {
  WorksArtId,
  WorksBox,
  WorksFinish,
  WorksProp,
  WorksSign,
} from './industrial.ts'
import type { Vec3 } from './interfaces.ts'

// --- The industrial park -------------------------------------------------

// The park behind Bull Valley Plaza, from INDUSTRIAL (industrial.ts): every
// building's boxes and every prop's merged into one mesh per finish across
// the whole park, so a dozen buildings cost a few dozen draw calls, and
// the painted panels over them. Inside is dark but for the odd high bay
// still flickering and a fire in a drum; the sodium lamps outside are the
// streetlights' (streetlights.ts). industrialsite.ts places the group at
// the park's corner.
const WORKS_FINISH: Record<WorksFinish, () => THREE.Material> = {
  slab: () => lambert({ color: '#7a776f' }),
  floor: () => lambert({ color: '#5f5c55' }),
  siding: () => lambert({ color: '#8c8a80' }),
  block: () => lambert({ color: '#9a9284' }),
  roof: () => lambert({ color: '#3e3c38' }),
  trim: () => lambert({ color: '#5a3a2a' }),
  joist: () => lambert({ color: '#4a4c4e' }),
  door: () => lambert({ color: '#4f5a5e' }),
  rollup: () => lambert({ color: '#a8a496' }),
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
  upright: () => lambert({ color: '#2c4c86' }),
  beam: () => lambert({ color: '#c8641e' }),
  cardboard: () => lambert({ color: '#9c7c52' }),
  wrap: () => lambert({ color: '#c8ccc4' }),
  pallet: () => lambert({ color: '#8a6e44' }),
  machine: () => lambert({ color: '#5a7a66' }),
  hazard: () => lambert({ color: '#d4a81e' }),
  rubber: () => lambert({ color: '#1c1c1c' }),
  insulated: () => lambert({ color: '#d8d6ce' }),
  tank: () => lambert({ color: '#a8acae' }),
  paper: () => lambert({ color: '#e2ddd0' }),
  debris: () => lambert({ color: '#2e2a26' }),
  drum: () => lambert({ color: '#2a4a7a' }),
  office: () => lambert({ color: '#b8b0a0' }),
  ceiling: () => lambert({ color: '#c0bcb0' }),
  desk: () => lambert({ color: '#7a6a52' }),
  mattress: () => lambert({ color: '#a9a07c' }),
  blanket: () => lambert({ color: '#5c3f3f' }),
  flame: () => applyPS1(new THREE.MeshBasicMaterial({ color: '#ffb347' })),
  tube: () => applyPS1(new THREE.MeshBasicMaterial({ color: '#f2e6c4' })),
  'dead-tube': () => lambert({ color: '#8c8f88' }),
  puddle: () =>
    lambert({
      color: '#101418',
      emissive: new THREE.Color('#1a2026'),
      emissiveIntensity: 0.5,
    }),
  trailer: () => lambert({ color: '#c4c2ba' }),
  'car-red': () => lambert({ color: '#7a2420' }),
  'car-blue': () => lambert({ color: '#26405e' }),
  'car-white': () => lambert({ color: '#c8c6be' }),
  'car-burnt': () => lambert({ color: '#2a2420' }),
  rust: () => lambert({ color: '#6a3e24' }),
}

// A box as geometry, turned if it was tipped, then moved into the park by
// `place` (its own turn about Y, then where it stands).
function boxGeometry(
  b: WorksBox,
  place: THREE.Matrix4 | null
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(...b.size)
  if (b.turn) {
    geometry.applyMatrix4(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...b.turn))
    )
  }
  geometry.translate(...b.center)
  if (place) geometry.applyMatrix4(place)
  return geometry.toNonIndexed()
}

// A painted panel, its art on the front, the cut-outs see-through round
// their paint. Panels of one art share its material (`painted`): the bay
// numbers and the notices repeat down the park.
function signMesh(
  sign: WorksSign,
  offset: Vec3,
  painted: Map<WorksArtId, THREE.Material>
): THREE.Mesh {
  const material = painted.get(sign.art) ?? signMaterial(sign.art)
  painted.set(sign.art, material)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...sign.size), material)
  mesh.name = `works-${sign.name}`
  mesh.position.set(
    sign.center[0] + offset[0],
    sign.center[1] + offset[1],
    sign.center[2] + offset[2]
  )
  mesh.rotation.set(...sign.turn)
  return mesh
}

function signMaterial(art: WorksArtId): THREE.Material {
  const texture = artTexture(paintWorksArt(art))
  const cut = isWorksCutOut(art)
  return lambert({
    map: texture,
    transparent: cut,
    alphaTest: cut ? 0.1 : 0,
    depthWrite: !cut,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: cut ? 0.05 : 0.25,
  })
}

export interface IndustrialRig {
  group: THREE.Group
  // The lit high bays flicker and the fires in the drums.
  update(t: number): void
}

// The high bays still lit: on, with stutters of dark, each its own beat.
function bayFlicker(t: number): number {
  const beat = t % 6.7
  if (beat > 2.2 && beat < 2.9) return Math.sin(beat * 70) > 0.4 ? 1 : 0.08
  if (beat > 5.1 && beat < 5.2) return 0.2
  return 0.85 + 0.15 * Math.sin(t * 40)
}

// Where each building stands and each prop, in the park's own frame (y
// the height of its floor or the ground under it, from the park's base);
// a building at null is left out.
export interface IndustrialPlacing {
  buildings: readonly (Vec3 | null)[]
  props: readonly { prop: WorksProp; at: Vec3 }[]
  // The fence's runs and its peeled flaps, each end at the height of the
  // ground under it.
  fences?: readonly { a: Vec3; b: Vec3 }[]
  flaps?: readonly { a: Vec3; b: Vec3 }[]
}

// The chain-link: a tile this many metres square, repeated down a run.
const LINK_TILE = 1.0

// A run's mesh as one quad from a to b, FENCE.height tall over the
// ground at each end, its UVs counting tiles so the wire repeats.
function linkQuad(a: Vec3, b: Vec3, height: number): THREE.BufferGeometry {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2])
  const u = len / LINK_TILE
  const v = height / LINK_TILE
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        ...a,
        ...b,
        b[0],
        b[1] + height,
        b[2],
        ...a,
        b[0],
        b[1] + height,
        b[2],
        a[0],
        a[1] + height,
        a[2],
      ],
      3
    )
  )
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2)
  )
  geometry.computeVertexNormals()
  return geometry
}

// A run's posts (at each end and never more than FENCE.post apart), its
// top rail and its barbed wire, as boxes: each turned along the run, a
// post now and then bent.
function fenceBoxes(a: Vec3, b: Vec3, k: number): WorksBox[] {
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const len = Math.hypot(dx, dz)
  const turn = Math.atan2(-dz, dx)
  const { height, barbs, post } = FENCE
  const boxes: WorksBox[] = []
  const n = Math.max(1, Math.ceil(len / post))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const y = a[1] + (b[1] - a[1]) * t
    const bent = (k * 7 + i) % 11 === 0
    boxes.push({
      name: `fence-${k}-post-${i}`,
      center: [a[0] + dx * t, y + (height + 0.4) / 2, a[2] + dz * t],
      size: [0.07, height + 0.4, 0.07],
      finish: 'rust',
      blocks: false,
      turn: bent ? [0.18, turn, 0.1] : [0, turn, 0],
    })
  }
  const mid = (o: number): Vec3 => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2 + o,
    (a[2] + b[2]) / 2,
  ]
  boxes.push({
    name: `fence-${k}-rail`,
    center: mid(height),
    size: [len, 0.05, 0.05],
    finish: 'rust',
    blocks: false,
    turn: [0, turn, 0],
  })
  barbs.forEach((over, j) => {
    boxes.push({
      name: `fence-${k}-barb-${j}`,
      center: mid(height + over),
      size: [len, 0.015, 0.015],
      finish: 'rust',
      blocks: false,
      turn: [0, turn, 0],
    })
  })
  return boxes
}

// The park, every building and prop as placed.
export function buildIndustrial(placing: IndustrialPlacing): IndustrialRig {
  const group = new THREE.Group()
  group.name = 'industrial-park'
  const byFinish = new Map<WorksFinish, THREE.BufferGeometry[]>()
  const add = (b: WorksBox, place: THREE.Matrix4) => {
    const list = byFinish.get(b.finish) ?? []
    list.push(boxGeometry(b, place))
    byFinish.set(b.finish, list)
  }
  const glows: THREE.Sprite[] = []
  const haze = makeGlowTexture('rgba(255, 200, 120, 0.5)')
  const fire = makeGlowTexture('rgba(255, 140, 40, 0.6)')
  const painted = new Map<WorksArtId, THREE.Material>()
  INDUSTRIAL.buildings.forEach((b, i) => {
    const at = placing.buildings[i]
    if (!at) return
    const place = new THREE.Matrix4().makeTranslation(...at)
    for (const box of buildingBoxes(b)) {
      add(box, place)
      // A haze round every light still burning.
      if (box.finish === 'tube' || box.finish === 'flame') {
        const glow = makeGlowSprite(
          box.finish === 'tube' ? haze : fire,
          box.finish === 'tube' ? 5 : 2.4
        )
        glow.position.set(
          box.center[0] + at[0],
          box.center[1] + at[1],
          box.center[2] + at[2]
        )
        glows.push(glow)
        group.add(glow)
      }
    }
    for (const sign of buildingSigns(b)) {
      group.add(signMesh(sign, at, painted))
    }
  })
  for (const { prop, at } of placing.props) {
    const place = new THREE.Matrix4()
      .makeTranslation(...at)
      .multiply(new THREE.Matrix4().makeRotationY(prop.yaw))
    for (const box of propBoxes(prop)) add(box, place)
    const signs = propSigns(prop)
    if (signs.length === 0) continue
    // Its panels turned with it.
    const frame = new THREE.Group()
    frame.position.set(...at)
    frame.rotation.y = prop.yaw
    for (const sign of signs) frame.add(signMesh(sign, [0, 0, 0], painted))
    group.add(frame)
  }
  // The fence: its posts, rails and wire with the rest, its mesh one
  // see-through mesh down every run and every peeled flap.
  const links: THREE.BufferGeometry[] = []
  ;(placing.fences ?? []).forEach(({ a, b }, k) => {
    for (const box of fenceBoxes(a, b, k)) add(box, new THREE.Matrix4())
    links.push(linkQuad(a, b, FENCE.height))
  })
  for (const { a, b } of placing.flaps ?? []) {
    links.push(linkQuad(a, b, FENCE.height * 0.8))
  }
  if (links.length > 0) {
    const texture = artTexture(paintChainLink())
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    const mesh = new THREE.Mesh(
      mergeGeometries(links),
      lambert({ map: texture, alphaTest: 0.4, side: THREE.DoubleSide })
    )
    mesh.name = 'works-chain-link'
    mesh.receiveShadow = true
    group.add(mesh)
  }
  let tube: THREE.MeshBasicMaterial | null = null
  let flame: THREE.MeshBasicMaterial | null = null
  for (const [finish, geometries] of byFinish) {
    const material = WORKS_FINISH[finish]()
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material)
    mesh.name = `works-${finish}`
    // The slab, the floor, the paint and the glass throw nothing.
    mesh.castShadow = !['slab', 'floor', 'glass', 'puddle'].includes(finish)
    mesh.receiveShadow = true
    group.add(mesh)
    if (finish === 'tube') tube = material as THREE.MeshBasicMaterial
    if (finish === 'flame') flame = material as THREE.MeshBasicMaterial
  }
  const lit = new THREE.Color('#f2e6c4')
  const warm = new THREE.Color('#ffb347')
  return {
    group,
    update(t) {
      const k = bayFlicker(t)
      if (tube) tube.color.copy(lit).multiplyScalar(k)
      const f = 0.8 + 0.2 * Math.sin(t * 13) * Math.sin(t * 7.3)
      if (flame) flame.color.copy(warm).multiplyScalar(f)
      for (const glow of glows) glow.material.opacity = Math.min(1, k * f)
    },
  }
}

// One building alone on its floor, for Akashic.
export function buildWarehouse(i: number): IndustrialRig {
  return buildIndustrial({
    buildings: INDUSTRIAL.buildings.map((_, k) => (k === i ? [0, 0, 0] : null)),
    props: [],
  })
}

// A dead forklift alone, loaded, for Akashic.
export function buildForklift(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'forklift'
  const byFinish = new Map<WorksFinish, THREE.BufferGeometry[]>()
  for (const b of forklift('forklift', {
    x: 0,
    z: 0,
    along: 'z',
    ahead: 1,
    burnt: false,
    loaded: true,
    flat: 'rear-left',
  })) {
    const list = byFinish.get(b.finish) ?? []
    list.push(boxGeometry(b, null))
    byFinish.set(b.finish, list)
  }
  for (const [finish, geometries] of byFinish) {
    const mesh = new THREE.Mesh(
      mergeGeometries(geometries),
      WORKS_FINISH[finish]()
    )
    mesh.castShadow = true
    group.add(mesh)
  }
  return group
}

// A stretch of the truck courts' fence, torn open in its middle and its
// mesh peeled back, for Akashic.
export function buildFenceStretch(): THREE.Group {
  return buildIndustrial({
    buildings: [],
    props: [],
    fences: [
      { a: [-6, 0, 0], b: [-0.9, 0, 0] },
      { a: [0.9, 0, 0], b: [6, 0, 0] },
    ],
    flaps: [{ a: [0.9, 0, 0], b: [1.7, 0, 0.9] }],
  }).group
}

// One prop alone, for Akashic.
export function buildWorksProp(prop: WorksProp): THREE.Group {
  return buildIndustrial({
    buildings: [],
    props: [{ prop: { ...prop, x: 0, z: 0, yaw: 0 }, at: [0, 0, 0] }],
  }).group
}
