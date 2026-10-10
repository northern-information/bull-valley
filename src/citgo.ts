import * as THREE from 'three'
import { paintAd } from './adart.ts'
import {
  artTexture,
  lambert,
  makeGlowTexture,
  mergeStatic,
} from './assetkit.ts'
import { canvas, context2d, SANS, text } from './canvas.ts'
import { buildPickup } from './pickups.ts'
import { applyPS1 } from './ps1.ts'
import { STORE_LAYOUT } from './store.ts'
import type { Part } from './assetkit.ts'
import type { Vec3 } from './interfaces.ts'
import type { StoreFinish, StoreSign } from './store.ts'

// The Citgo station every fuel point wears: the road sign, the station
// layout, the store shell and its finishes, the wall signs, the shelf
// display and the locker doors, the pumps, the trash cans and the canopy.

// --- Citgo station -------------------------------------------------------

// The tall road sign: white panel, orange trimark, blue wordmark. Every
// station wears it for now, whatever geo.json says its name is.
function makeCitgoSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 96
  const ctx = context2d(canvas)
  ctx.fillStyle = '#e9e6dc'
  ctx.fillRect(0, 0, 128, 96)
  ctx.fillStyle = '#f26522'
  ctx.beginPath()
  ctx.moveTo(64, 8)
  ctx.lineTo(90, 40)
  ctx.lineTo(38, 40)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#1f3a93'
  ctx.font = 'bold 28px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('CITGO', 64, 64)
  return new THREE.CanvasTexture(canvas)
}

// Station-local layout: the pump island at the origin, local +X toward the
// road, the store behind it along -X (its shell and shelves are laid out in
// STORE_LAYOUT, store.ts). `along` offsets run on the local Z
// axis (the pump island's long side, parallel to the road). world.ts turns
// every station to face its nearest road and sets the island
// `roadEdgeDistance` back from the road's edge, so the sign stands just
// inside the lot's road frontage. The lot is the asphalt from the store
// front to the frontage. The sign sits on its own ground sample in the
// world, so `sign` gives a ground offset plus height.
export const FUEL_LAYOUT = {
  canopyPoleOffset: 2.6,
  pumpOffset: 2.6 * 0.55,
  roadEdgeDistance: 12,
  // The sign stands at the lot's road-side corner, off the pump island's
  // axis, so it never blocks the view from the island to the road.
  signDistance: 10,
  signAlong: 8,
  signHeight: 7,
  glowScale: 9,
  // Along local X from the store front to the road centreline (the sample
  // stops at the road edge); halfWidth spans local Z, room to park either
  // side of the pumps.
  lot: { back: STORE_LAYOUT.front, halfWidth: 20 },
  lotColor: '#262a30',
  // Trash cans, station-local: one at each end of the pump island past the
  // canopy poles, one beside the store door on the lot.
  trashCans: [
    [0, 0, 3.3],
    [0, 0, -3.3],
    [STORE_LAYOUT.front + 0.5, 0, -1.6],
  ] as readonly Vec3[],
}

// The store's colors, by finish. The walls and floor carry a little
// emissive, the fluorescent tubes nobody turns off; the tubes themselves
// are basic, so they read as lit from any angle at night.
const STORE_FINISH: Record<StoreFinish, () => THREE.Material> = {
  floor: () =>
    lambert({
      color: '#77736a',
      emissive: new THREE.Color('#3a3832'),
      emissiveIntensity: 0.5,
    }),
  wall: () =>
    lambert({
      color: '#8d8a80',
      emissive: new THREE.Color('#2e2c27'),
      emissiveIntensity: 0.5,
    }),
  // The ceiling is the roof's underside; without emissive it is a black void
  // the tubes float in.
  roof: () =>
    lambert({
      color: '#7a776e',
      emissive: new THREE.Color('#2e2c27'),
      emissiveIntensity: 0.5,
    }),
  shelf: () => lambert({ color: '#3e434a' }),
  counter: () => lambert({ color: '#5a3426' }),
  // The lockers' carcass, enamelled steel gone dull.
  locker: () =>
    lambert({
      color: '#4f5d55',
      emissive: new THREE.Color('#1c221f'),
      emissiveIntensity: 0.5,
    }),
  // The bathroom: pale tile, white porcelain, a mirror that gives back
  // nothing but a grey sheen, and the door in a cheap brown laminate.
  tile: () =>
    lambert({
      color: '#a9b0a6',
      emissive: new THREE.Color('#33362f'),
      emissiveIntensity: 0.5,
    }),
  porcelain: () =>
    lambert({
      color: '#e4e2da',
      emissive: new THREE.Color('#3c3b36'),
      emissiveIntensity: 0.5,
    }),
  mirror: () => applyPS1(new THREE.MeshBasicMaterial({ color: '#8f9ea3' })),
  door: () =>
    lambert({
      color: '#6b4e36',
      emissive: new THREE.Color('#231a12'),
      emissiveIntensity: 0.5,
    }),
  light: () => applyPS1(new THREE.MeshBasicMaterial({ color: '#eaf1ee' })),
  // Storefront glass: a cool tint you see the lot through. No depth write,
  // so the shelves and the pumps show through from either side.
  glass: () =>
    applyPS1(
      new THREE.MeshBasicMaterial({
        color: '#a9c4d6',
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    ),
}

// A photograph under public/ as a texture, in sRGB like the file. The
// loader hands the texture back at once and fills it in when the file
// arrives, so the part is built without waiting.
function photoTexture(url: string): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// A sign's art as a texture: painted by adart.ts, or loaded from a file.
function signTexture(sign: StoreSign): THREE.Texture {
  if (typeof sign.art === 'string') return artTexture(paintAd(sign.art))
  return photoTexture(sign.art.photo)
}

// A sign's short name for the Akashic: 'sign-smokes' is `ad-smokes`.
export function signId(sign: StoreSign): string {
  return sign.name.replace(/^sign-/, '')
}

// One wall sign as a thin box, its art on the +Z face and a dark frame on
// the rest, in asset space: centred on the origin, facing +Z. The art
// glows through its own emissiveMap, so it reads under the store's dim
// light. BoxGeometry face order is +x, -x, +y, -y, +z, -z.
export function adSignPart(sign: StoreSign): Part {
  const [w, h] = sign.size
  const geometry = new THREE.BoxGeometry(w, h, STORE_LAYOUT.signDepth)
  const texture = signTexture(sign)
  const face = lambert({
    map: texture,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: 0.55,
  })
  const edge = lambert({ color: '#23262b' })
  return {
    name: `store-${sign.name}`,
    geometry,
    material: [edge, edge, edge, edge, face, edge],
  }
}

// The store shell, fixtures, lights and signs from STORE_LAYOUT, one part
// per box or sign, each geometry already in station-local space: place it
// at the pump island with the station's yaw. One material per finish,
// shared across boxes.
export function storeParts(): Part[] {
  const materials = new Map<StoreFinish, THREE.Material>()
  const boxes = STORE_LAYOUT.boxes.map((b) => {
    let material = materials.get(b.finish)
    if (!material) {
      material = STORE_FINISH[b.finish]()
      materials.set(b.finish, material)
    }
    const geometry = new THREE.BoxGeometry(...b.size)
    geometry.translate(...b.center)
    return { name: `store-${b.name}`, geometry, material }
  })
  const signs = STORE_LAYOUT.signs.map((sign) => {
    const part = adSignPart(sign)
    part.geometry.rotateY(sign.yaw)
    part.geometry.translate(...sign.center)
    return part
  })
  return [...boxes, ...signs]
}

// One shelf unit: what the pack shows, without the halo.
function buildShelfItem(kind: string): THREE.Object3D {
  return buildPickup(kind, 0x5ac, { glow: false })
}

// A unit on the shelves: which facing (an index into
// STORE_LAYOUT.facings) and which of its slots.
export interface ShelfSlot {
  facing: number
  unit: number
  object: THREE.Object3D
}

// Every shelf unit of one store, in station-local space, each standing at
// its slot facing the aisle. One model per kind, cloned per unit, so the
// clones share its geometry and materials. world.ts moves this one display
// to whichever store the player is nearest and hides sold units.
export function buildShelfDisplay(): {
  group: THREE.Group
  slots: ShelfSlot[]
} {
  const group = new THREE.Group()
  group.name = 'shelf-display'
  const slots: ShelfSlot[] = []
  STORE_LAYOUT.facings.forEach((facing, f) => {
    const model = buildShelfItem(facing.kind)
    facing.slots.forEach((at, unit) => {
      const object = unit === 0 ? model : model.clone()
      object.position.set(...at)
      object.rotation.y = facing.yaw
      group.add(object)
      slots.push({ facing: f, unit, object })
    })
  })
  return { group, slots }
}

// The locker doors over the face of the bank (STORE_LAYOUT.lockers), in
// station-local space: one door a locker, a hair proud of the carcass, with
// its vents, its handle and its number plate. world.ts carries them with
// the shelf display to the nearest store, so the glow can ring them when E
// would open the stash.
export function buildLockerDoors(): THREE.Group {
  const { count, width, height, face, z, floor } = STORE_LAYOUT.lockers
  const group = new THREE.Group()
  group.name = 'locker-doors'
  const door = lambert({
    color: '#5f6f66',
    emissive: new THREE.Color('#202824'),
    emissiveIntensity: 0.5,
  })
  const dark = lambert({ color: '#1d2220' })
  const brass = lambert({ color: '#a98c4c' })
  const plate = lambert({ color: '#d8d2bf' })
  const inset = 0.02
  const doorW = width - inset * 2
  const doorH = height - 0.12
  const doorGeometry = new THREE.BoxGeometry(0.02, doorH, doorW)
  const ventGeometry = new THREE.BoxGeometry(0.012, 0.018, doorW * 0.6)
  const handleGeometry = new THREE.BoxGeometry(0.03, 0.12, 0.025)
  const plateGeometry = new THREE.BoxGeometry(0.008, 0.035, 0.07)
  const z0 = z - (count * width) / 2
  // Every part straight under the group, so the bank merges to one draw
  // a material.
  const part = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number
  ) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
  }
  for (let i = 0; i < count; i++) {
    const x = face + 0.01
    const y = floor + 0.06 + doorH / 2
    const zi = z0 + width * (i + 0.5)
    part(doorGeometry, door, x, y, zi)
    for (let v = 0; v < 4; v++) {
      part(ventGeometry, dark, x + 0.012, y + doorH / 2 - 0.12 - v * 0.04, zi)
    }
    part(handleGeometry, brass, x + 0.022, y + 0.02, zi + doorW / 2 - 0.06)
    part(plateGeometry, plate, x + 0.012, y + doorH / 2 - 0.05, zi)
  }
  mergeStatic(group)
  return group
}

// --- Gas pump ------------------------------------------------------------

// A two-sided dispenser circa 2008 on a concrete curb: a pale cabinet with
// a painted face on each side (the brand band, the display, the grade
// buttons, the lower door), a dark cap, and a hose and nozzle hung on each
// side. Origin at ground level under the middle; the faces look along ±X
// (toward the road and the store), the sides along the island.
const PUMP = {
  width: 0.9,
  depth: 0.5,
  height: 1.3,
  curb: { width: 1.4, height: 0.16, depth: 0.9 },
  cap: 0.1,
  hose: { radius: 0.022, length: 0.7, x: 0.28 },
  nozzle: { width: 0.1, height: 0.22, depth: 0.06 },
}

// The cabinet face, 90×130 for the 0.9 × 1.3 m side: orange band and
// wordmark up top, a dark readout showing nothing, three big grade
// buttons, the lower door.
function makePumpFaceTexture(): THREE.CanvasTexture {
  const art = canvas([90, 130], '#d9d5cb')
  const { ctx, w } = art
  ctx.fillStyle = '#f26522'
  ctx.fillRect(0, 0, w, 20)
  text(ctx, 'CITGO', w / 2, 10, w - 10, 13, SANS, '#f4f1ea')
  // The readout, dark glass, off.
  ctx.fillStyle = '#12171b'
  ctx.fillRect(8, 28, w - 16, 22)
  // Grade buttons.
  const grades = ['87', '89', '93']
  grades.forEach((grade, i) => {
    const x = 7 + i * 26
    ctx.fillStyle = '#1f3a93'
    ctx.fillRect(x, 58, 24, 36)
    text(ctx, grade, x + 12, 76, 22, 16, SANS, '#f4f1ea')
  })
  // The lower door, a shade darker, with its lock.
  ctx.fillStyle = '#9d9a91'
  ctx.fillRect(4, 104, w - 8, 22)
  ctx.fillStyle = '#3a3d42'
  ctx.fillRect(w / 2 - 2, 113, 4, 4)
  return artTexture(art)
}

// The pump's parts in pump-local space. One material per part, shared by
// every pump in the valley through instancing.
export function pumpParts(): Part[] {
  const { width, depth, height, curb, cap, hose, nozzle } = PUMP
  const curbGeometry = new THREE.BoxGeometry(
    curb.width,
    curb.height,
    curb.depth
  )
  curbGeometry.translate(0, curb.height / 2, 0)
  const cabinet = new THREE.BoxGeometry(width, height, depth)
  cabinet.translate(0, curb.height + height / 2, 0)
  const capGeometry = new THREE.BoxGeometry(width + 0.1, cap, depth + 0.1)
  capGeometry.translate(0, curb.height + height + cap / 2, 0)
  // BoxGeometry face order is +x, -x, +y, -y, +z, -z: the art goes on the
  // two X faces, with a little emissive so it reads under the canopy.
  const faceTexture = makePumpFaceTexture()
  const face = lambert({
    map: faceTexture,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: faceTexture,
    emissiveIntensity: 0.4,
  })
  const shell = lambert({
    color: '#d9d5cb',
    emissive: new THREE.Color('#5a564c'),
    emissiveIntensity: 0.35,
  })
  const dark = lambert({ color: '#2b2f36' })
  const parts: Part[] = [
    {
      name: 'pump-curb',
      geometry: curbGeometry,
      material: lambert({
        color: '#8f8c84',
        emissive: new THREE.Color('#3a3832'),
        emissiveIntensity: 0.3,
      }),
    },
    {
      name: 'pump-cabinet',
      geometry: cabinet,
      material: [face, face, shell, shell, shell, shell],
    },
    { name: 'pump-cap', geometry: capGeometry, material: dark },
  ]
  // A hose and the nozzle it ends in for each face, hung on the cabinet's
  // narrow end (+Z, the island's one end) toward that face, so neither
  // crosses the art.
  for (const [side, sx] of [
    ['road', 1],
    ['store', -1],
  ] as const) {
    const x = sx * hose.x
    const z = depth / 2 + hose.radius + 0.01
    const hoseGeometry = new THREE.CylinderGeometry(
      hose.radius,
      hose.radius,
      hose.length,
      5
    )
    const hoseTop = curb.height + height - 0.05
    hoseGeometry.translate(x, hoseTop - hose.length / 2, z)
    const nozzleGeometry = new THREE.BoxGeometry(
      nozzle.width,
      nozzle.height,
      nozzle.depth
    )
    nozzleGeometry.translate(
      x,
      hoseTop - hose.length - nozzle.height / 2 + 0.04,
      depth / 2 + nozzle.depth / 2
    )
    parts.push(
      { name: `pump-hose-${side}`, geometry: hoseGeometry, material: dark },
      { name: `pump-nozzle-${side}`, geometry: nozzleGeometry, material: dark }
    )
  }
  return parts
}

// --- Trash can -----------------------------------------------------------

// The green drum with a black lid every forecourt has. Origin at ground
// level under the middle.
export function trashCanParts(): Part[] {
  const body = new THREE.CylinderGeometry(0.26, 0.24, 0.8, 8)
  body.translate(0, 0.4, 0)
  const lid = new THREE.CylinderGeometry(0.29, 0.29, 0.1, 8)
  lid.translate(0, 0.85, 0)
  return [
    {
      name: 'trash-body',
      geometry: body,
      material: lambert({ color: '#2f4a3a' }),
    },
    {
      name: 'trash-lid',
      geometry: lid,
      material: lambert({ color: '#1c1e22' }),
    },
  ]
}

// The canopy's dimensions, shared by the slab, the tubes under it, and the
// light world.ts hangs there.
export const CANOPY = { width: 9, thickness: 0.45, depth: 6.5, height: 4.6 }

export function fuelStationParts() {
  const canopy = new THREE.BoxGeometry(
    CANOPY.width,
    CANOPY.thickness,
    CANOPY.depth
  )
  canopy.translate(0, CANOPY.height, 0)
  const canopyPole = new THREE.CylinderGeometry(0.12, 0.12, 4.6, 5)
  canopyPole.translate(0, 2.3, 0)
  // One fluorescent tube under the canopy over each pump, flush with the
  // slab's underside, long side along the canopy's.
  const canopyLight = new THREE.BoxGeometry(3.6, 0.06, 0.4)
  canopyLight.translate(0, CANOPY.height - CANOPY.thickness / 2 - 0.03, 0)
  const signPole = new THREE.CylinderGeometry(0.14, 0.14, 7, 5)
  signPole.translate(0, 3.5, 0)
  return {
    store: storeParts(),
    canopy: {
      name: 'canopy',
      geometry: canopy,
      material: lambert({
        color: '#b9b5ab',
        emissive: new THREE.Color('#5a564c'),
        emissiveIntensity: 0.35,
      }),
    },
    canopyPole: {
      name: 'canopy-pole',
      geometry: canopyPole,
      material: lambert({ color: '#454b54' }),
    },
    canopyLight: {
      name: 'canopy-light',
      geometry: canopyLight,
      material: applyPS1(new THREE.MeshBasicMaterial({ color: '#eaf1ee' })),
    },
    // Placed at the pump's spot on the island, with the station's yaw.
    pump: pumpParts(),
    // Placed at each FUEL_LAYOUT.trashCans spot.
    trashCan: trashCanParts(),
    signPole: {
      name: 'sign-pole',
      geometry: signPole,
      material: lambert({ color: '#454b54' }),
    },
    // A box deep enough to hide the pole top inside it. BoxGeometry face
    // order is +x, -x, +y, -y, +z, -z: the two broad faces carry the art,
    // basic so they render as-drawn at night; the edges match the pole.
    sign: {
      name: 'sign',
      geometry: new THREE.BoxGeometry(2.6, 1.95, 0.36),
      material: (() => {
        const face = applyPS1(
          new THREE.MeshBasicMaterial({ map: makeCitgoSignTexture() })
        )
        const edge = lambert({ color: '#454b54' })
        return [edge, edge, edge, edge, face, face]
      })(),
    },
    glow: makeGlowTexture('rgba(242, 101, 34, 0.4)'),
  }
}
