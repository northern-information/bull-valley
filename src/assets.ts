import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { paintAd } from './adart.ts'
import { paintDrink } from './canart.ts'
import { canvas, context2d, SANS, text } from './canvas.ts'
import { CONFIG } from './config.ts'
import { skull } from './decalart.ts'
import { CONTAINERS } from './drinks.ts'
import { DEFAULT_FINISH, finishById } from './finishes.ts'
import { isCigarette, isDrink, isMedicine, itemById, ITEMS } from './items.ts'
import { mazeSpans, SHINING_MAZE, spanPieces } from './maze.ts'
import {
  paintCornMazeSign,
  paintCornStalks,
  paintEnterSign,
  paintPortalSwirl,
  STALK_MASS_TOP,
} from './mazeart.ts'
import { paintMedicine } from './medart.ts'
import { paintMud } from './mudart.ts'
import { paintPack } from './packart.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'
import { paintStandSign } from './standart.ts'
import { STORE_LAYOUT } from './store.ts'
import type { DrinkArt } from './canart.ts'
import type { CanvasArt } from './canvas.ts'
import type {
  Container,
  ContainerKey,
  MedicineForm,
  Vec3,
} from './interfaces.ts'
import type { Span } from './maze.ts'
import type { MedicineArt } from './medart.ts'
import type { Rng } from './rng.ts'
import type { StoreFinish, StoreSign } from './store.ts'

// Every placed 3D asset in Bull Valley, defined once in asset-local space.
// world.ts instances these parts across the valley; the Akashic dev page
// (/akashic) assembles one of each for inspection. A part is
// { name, geometry, material, position?, rotation?, scale? }. Instanced
// assets export parts; one-off assets export a builder that returns an
// Object3D. Building parts consumes no rng, so placement seeds stay put.

export interface Part {
  name: string
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
}

// glow: false leaves out the halo, for close-up views like the inventory.
export interface PickupOptions {
  glow?: boolean
}

// One entry in the Akashic page's asset list.
export interface AkashicAsset {
  id: string
  label: string
  build: () => THREE.Object3D
}

// Object3D has no isMesh in its type; this narrows by the runtime flag.
export function isMesh(o: THREE.Object3D): o is THREE.Mesh {
  return 'isMesh' in o && o.isMesh === true
}

export function lambert(
  opts: THREE.MeshLambertMaterialParameters
): THREE.MeshLambertMaterial {
  return applyPS1(new THREE.MeshLambertMaterial(opts))
}

export function makeGlowTexture(
  color = 'rgba(251, 191, 36, 0.65)'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = context2d(canvas)
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}

export function makeGlowSprite(
  map: THREE.Texture,
  scale: number
): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
  )
  sprite.scale.setScalar(scale)
  return sprite
}

// The ring around whatever E would act on (glow.ts): the Citgo sign's
// red-orange.
export const CITGO_RED = '#ff4a1c'

// --- Trees ---------------------------------------------------------------

// Unit-height trunk and canopy, scaled per instance. TREE_SAMPLE is a
// mid-range instance for the Akashic page.
export const TREE_CANOPY_LOW = '#1c2f1e'
export const TREE_CANOPY_HIGH = '#31482a'
const TREE_SAMPLE = { trunkH: 3.2, canopyH: 6, canopyR: 2.25, tint: 0.5 }

export function treeParts() {
  const trunk = new THREE.CylinderGeometry(0.15, 0.3, 1, 5)
  trunk.translate(0, 0.5, 0)
  const canopy = new THREE.ConeGeometry(1, 1, 6)
  canopy.translate(0, 0.5, 0)
  return {
    trunk: {
      name: 'trunk',
      geometry: trunk,
      material: lambert({ color: '#33271a' }),
    },
    // White base: each instance carries its own tint via instanceColor.
    canopy: {
      name: 'canopy',
      geometry: canopy,
      material: lambert({ color: '#ffffff' }),
    },
  }
}

function sampleTree(): THREE.Group {
  const { trunk, canopy } = treeParts()
  const { trunkH, canopyH, canopyR, tint } = TREE_SAMPLE
  canopy.material.color
    .set(TREE_CANOPY_LOW)
    .lerp(new THREE.Color(TREE_CANOPY_HIGH), tint)
  return assembleParts([
    { ...trunk, scale: [1, trunkH, 1] },
    {
      ...canopy,
      position: [0, trunkH * 0.8, 0],
      scale: [canopyR, canopyH, canopyR],
    },
  ])
}

// --- Utility poles -------------------------------------------------------

// Unit-height pole; the crossarm is placed POLE_ARM_DROP under the top,
// spanning local X, with an insulator at each POLE_INSULATOR_X along it.
// Local +X faces the road (roadside.ts turns local +Z along it).
const POLE_SAMPLE = { height: 8.75 }
export const POLE_ARM_DROP = 0.9
export const POLE_INSULATOR_X = [-0.72, 0.72] as const
const POLE_ARM_HALF = 0.07
const POLE_INSULATOR_H = 0.14

// Where the wires hang on a pole of height h, in pole-local space: the top
// of each insulator, and the telephone cable lower down on the road side.
export function poleWireAnchors(h: number): Vec3[] {
  const top = h - POLE_ARM_DROP + POLE_ARM_HALF + POLE_INSULATOR_H
  return [...POLE_INSULATOR_X.map((x): Vec3 => [x, top, 0]), [0.17, h - 2.4, 0]]
}

export function poleParts() {
  const pole = new THREE.CylinderGeometry(0.12, 0.16, 1, 5)
  pole.translate(0, 0.5, 0)
  // Placed at the crossarm's centre, offset by POLE_INSULATOR_X.
  const insulator = new THREE.CylinderGeometry(0.035, 0.05, POLE_INSULATOR_H, 5)
  insulator.translate(0, POLE_ARM_HALF + POLE_INSULATOR_H / 2, 0)
  return {
    pole: {
      name: 'pole',
      geometry: pole,
      material: lambert({ color: '#3a2f22' }),
    },
    arm: {
      name: 'arm',
      geometry: new THREE.BoxGeometry(1.7, POLE_ARM_HALF * 2, 0.14),
      material: lambert({ color: '#33291d' }),
    },
    insulator: {
      name: 'insulator',
      geometry: insulator,
      material: lambert({ color: '#5d7a74' }),
    },
  }
}

// The wire strung between poles: unlit, near black against the night.
export function wireMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: '#07090c' })
}

// How far a wire sags at mid-span, per metre of span.
export const WIRE_SAG = 0.025

function samplePole(): THREE.Group {
  const { pole, arm, insulator } = poleParts()
  const h = POLE_SAMPLE.height
  const armY = h - POLE_ARM_DROP
  return assembleParts([
    { ...pole, scale: [1, h, 1] },
    { ...arm, position: [0, armY, 0] },
    ...POLE_INSULATOR_X.map((x): Part => ({
      ...insulator,
      position: [x, armY, 0],
    })),
  ])
}

// --- Streetlights --------------------------------------------------------

// High-pressure sodium: the warm orange that every county road junction
// in Illinois glowed in. The lens is unlit so it reads at any distance;
// world.ts adds the halo, the pool on the road, and the real lights.
export const SODIUM = '#ff9a3c'
const SODIUM_HALO = 'rgba(255, 150, 60, 0.75)'

// A cobra-head streetlight in lamp-local space: the pole at the origin,
// the mast arm reaching out along +X to the head. `lens` is the centre of
// the lens's face, where the light comes from.
export const STREETLIGHT = {
  height: 8.6,
  reach: 4.2,
  lens: [4.35, 8.86, 0] as Vec3,
}

export function streetlightParts(): Part[] {
  const S = STREETLIGHT
  const steel = lambert({ color: '#61666d' })
  const pole = new THREE.CylinderGeometry(0.09, 0.15, S.height, 5)
  pole.translate(0, S.height / 2, 0)
  // The mast arm climbs a little as it reaches out.
  const rise = 0.35
  const armLength = Math.hypot(S.reach, rise)
  const arm = new THREE.BoxGeometry(armLength, 0.1, 0.1)
  arm.rotateZ(Math.atan2(rise, S.reach))
  arm.translate(S.reach / 2, S.height - 0.25 + rise / 2, 0)
  const head = new THREE.BoxGeometry(0.95, 0.22, 0.42)
  head.translate(S.lens[0], S.lens[1] + 0.13, 0)
  const lens = new THREE.BoxGeometry(0.72, 0.05, 0.3)
  lens.translate(S.lens[0], S.lens[1], 0)
  return [
    { name: 'streetlight-pole', geometry: pole, material: steel },
    { name: 'streetlight-arm', geometry: arm, material: steel },
    { name: 'streetlight-head', geometry: head, material: steel },
    {
      name: 'streetlight-lens',
      geometry: lens,
      material: applyPS1(new THREE.MeshBasicMaterial({ color: SODIUM })),
    },
  ]
}

// The halos over every lamp, as one cloud of points `size` metres across.
// A lamp shines through haze that hides the pole under it, so the halos
// take no fog; they shrink with distance instead.
export function sodiumHaloMaterial(size: number): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    map: makeGlowTexture(SODIUM_HALO),
    size,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  })
}

// The pools of light on the ground, coloured per vertex (alpha falls off
// to the rim). Draped over a road's crown, a pool can show two layers at
// once: the ground falling away past a road edge comes back into view
// behind it, and the two would add. The stencil lets a pixel take one
// layer of light a frame (ps1.ts gives the renderer a stencil buffer,
// cleared every frame). It writes no depth, so it never hides a foot.
export function sodiumPoolMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  })
}

function sampleStreetlight(): THREE.Group {
  const group = assembleParts(streetlightParts())
  const halo = makeGlowSprite(makeGlowTexture(SODIUM_HALO), 3)
  halo.position.set(...STREETLIGHT.lens)
  halo.position.y -= 0.1
  group.add(halo)
  return group
}

// --- Reeds ---------------------------------------------------------------

export function reedPart() {
  const geometry = new THREE.CylinderGeometry(0.02, 0.05, 1, 3)
  geometry.translate(0, 0.5, 0)
  return {
    name: 'reed',
    geometry,
    material: lambert({ color: '#2b301b' }),
  }
}

// A small clump, so a 5 cm stalk reads at all.
function sampleReeds(): THREE.Group {
  const reed = reedPart()
  const rng = mulberry32(0x2eed)
  const parts: Part[] = []
  for (let i = 0; i < 12; i++) {
    parts.push({
      ...reed,
      position: [range(rng, -0.4, 0.4), 0, range(rng, -0.4, 0.4)],
      rotation: [range(rng, -0.12, 0.12), 0, range(rng, -0.12, 0.12)],
      scale: [1, range(rng, 1, 2), 1],
    })
  }
  return assembleParts(parts)
}

// --- Gravestones ---------------------------------------------------------

export function gravestonePart() {
  const geometry = new THREE.BoxGeometry(0.45, 0.85, 0.12)
  geometry.translate(0, 0.425, 0)
  return {
    name: 'gravestone',
    geometry,
    material: lambert({ color: '#454b54' }),
  }
}

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
function signId(sign: StoreSign): string {
  return sign.name.replace(/^sign-/, '')
}

// One wall sign as a thin box, its art on the +Z face and a dark frame on
// the rest, in asset space: centred on the origin, facing +Z. The art
// glows through its own emissiveMap, so it reads under the store's dim
// light. BoxGeometry face order is +x, -x, +y, -y, +z, -z.
function adSignPart(sign: StoreSign): Part {
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
function storeParts(): Part[] {
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
function pumpParts(): Part[] {
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
function trashCanParts(): Part[] {
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

// One station at yaw 0, laid out exactly as world.ts places them, with
// full shelves. The lot is a flat slab here; in the world it follows the
// ground like a road.
function sampleFuelStation(): THREE.Group {
  const p = fuelStationParts()
  const L = FUEL_LAYOUT
  const lotFront = L.roadEdgeDistance
  const lot = new THREE.PlaneGeometry(
    lotFront - L.lot.back,
    L.lot.halfWidth * 2
  )
  lot.rotateX(-Math.PI / 2)
  const parts: Part[] = [
    {
      name: 'lot',
      geometry: lot,
      material: applyPS1(
        new THREE.MeshBasicMaterial({
          color: L.lotColor,
          side: THREE.DoubleSide,
        })
      ),
      position: [(lotFront + L.lot.back) / 2, 0.02, 0],
    },
    ...p.store,
    p.canopy,
    { ...p.signPole, position: [L.signDistance, 0, L.signAlong] },
    { ...p.sign, position: [L.signDistance, L.signHeight, L.signAlong] },
  ]
  for (const off of [L.canopyPoleOffset, -L.canopyPoleOffset]) {
    parts.push({ ...p.canopyPole, position: [0, 0, off] })
  }
  for (const off of [L.pumpOffset, -L.pumpOffset]) {
    for (const part of p.pump) parts.push({ ...part, position: [0, 0, off] })
    parts.push({ ...p.canopyLight, position: [0, 0, off] })
  }
  for (const at of L.trashCans) {
    for (const part of p.trashCan) parts.push({ ...part, position: at })
  }
  const group = assembleParts(parts)
  const sprite = makeGlowSprite(p.glow, L.glowScale)
  sprite.position.set(L.signDistance, L.signHeight, L.signAlong)
  group.add(sprite)
  group.add(buildShelfDisplay().group)
  return group
}

// The store with its roof off and its shelves full, for looking down into
// it in the Akashic.
function sampleStoreInterior(): THREE.Group {
  const group = assembleParts(
    storeParts().filter((part) => part.name !== 'store-roof')
  )
  group.add(buildShelfDisplay().group)
  return group
}

// --- Corn maze -----------------------------------------------------------

// One piece of corn wall, a unit long (local X, centred), a unit thick
// (local Z, centred) and a unit tall from its base, scaled per instance: a
// dark opaque core, so nothing shows through, under a card of painted
// stalks on each face whose tassels stand past the core's top for a ragged
// skyline. The core stops under the painted mass so its flat top never
// shows. Each piece's stalks carry their own tint.
const CORN_CORE_TOP = 1 - STALK_MASS_TOP - 0.02
const CORN_TINT_LOW = '#c2b682'
const CORN_TINT_HIGH = '#ffffff'

function cornWallParts() {
  const core = new THREE.BoxGeometry(1, CORN_CORE_TOP, 1)
  core.translate(0, CORN_CORE_TOP / 2, 0)
  const front = new THREE.PlaneGeometry(1, 1)
  front.translate(0, 0.5, 0.51)
  const back = new THREE.PlaneGeometry(1, 1)
  back.rotateY(Math.PI)
  back.translate(0, 0.5, -0.51)
  const stalks = mergeGeometries([front, back])
  return {
    core: {
      name: 'corn-core',
      geometry: core,
      material: lambert({ color: '#2c2e16' }),
    },
    // White under the art: each instance carries its own tint.
    stalks: {
      name: 'corn-stalks',
      geometry: stalks,
      material: lambert({
        map: artTexture(paintCornStalks()),
        alphaTest: 0.5,
      }),
    },
  }
}

// A stretch of corn wall from a to b, both on the ground at its foot.
export interface CornPiece {
  a: Vec3
  b: Vec3
}

export interface CornWallSize {
  height: number
  thickness: number
  // How far the foot sinks under the ground, so a slope across the
  // wall's thickness never shows daylight under it.
  sink: number
}

// The pieces are bucketed into square tiles, one InstancedMesh per part
// per tile, so frustum culling skips the stretches of corn out of view.
const CORN_TILE = 100

// Corn wall pieces as instances: each piece pitched along its slope, its
// foot sunk under the ground, its tint drawn from its own seed.
export function buildCornWalls(
  pieces: readonly CornPiece[],
  { height, thickness, sink }: CornWallSize
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'corn-maze'
  const parts = cornWallParts()
  const tiles = new Map<string, CornPiece[]>()
  for (const piece of pieces) {
    const x = (piece.a[0] + piece.b[0]) / 2
    const z = (piece.a[2] + piece.b[2]) / 2
    const key = `${Math.floor(x / CORN_TILE)},${Math.floor(z / CORN_TILE)}`
    const list = tiles.get(key) ?? []
    list.push(piece)
    tiles.set(key, list)
  }
  const rng = mulberry32(0xc022)
  const low = new THREE.Color(CORN_TINT_LOW)
  const high = new THREE.Color(CORN_TINT_HIGH)
  const tint = new THREE.Color()
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()
  for (const tile of tiles.values()) {
    const cores = new THREE.InstancedMesh(
      parts.core.geometry,
      parts.core.material,
      tile.length
    )
    const stalks = new THREE.InstancedMesh(
      parts.stalks.geometry,
      parts.stalks.material,
      tile.length
    )
    tile.forEach(({ a, b }, i) => {
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const dz = b[2] - a[2]
      const run = Math.hypot(dx, dz)
      // Turn local +X along the piece, then tip it up its slope.
      euler.set(0, Math.atan2(-dz, dx), Math.atan2(dy, run))
      m.compose(
        pos.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sink, (a[2] + b[2]) / 2),
        q.setFromEuler(euler),
        scale.set(Math.hypot(run, dy), height + sink, thickness)
      )
      cores.setMatrixAt(i, m)
      stalks.setMatrixAt(i, m)
      stalks.setColorAt(i, tint.copy(low).lerp(high, rng()))
    })
    cores.instanceMatrix.needsUpdate = true
    stalks.instanceMatrix.needsUpdate = true
    if (stalks.instanceColor) stalks.instanceColor.needsUpdate = true
    group.add(cores, stalks)
  }
  return group
}

// The maze's pieces on flat ground, in maze-local metres.
function flatCornPieces(spans: readonly Span[]): CornPiece[] {
  const { wallThickness, pieceLength } = CONFIG.maze
  return spans
    .flatMap((span) => spanPieces(span, wallThickness / 2, pieceLength))
    .map(({ a, b }) => ({ a: [a.x, 0, a.z], b: [b.x, 0, b.z] }))
}

function cornWallSize(): CornWallSize {
  const { wallHeight, wallThickness, wallSink } = CONFIG.maze
  return { height: wallHeight, thickness: wallThickness, sink: wallSink }
}

// A corner of corn for the Akashic page: two walls meeting square.
function sampleCornWall(): THREE.Group {
  const spans: Span[] = [
    { a: { x: 0, z: 0 }, b: { x: 8, z: 0 } },
    { a: { x: 0, z: 0 }, b: { x: 0, z: 6 } },
  ]
  return buildCornWalls(flatCornPieces(spans), cornWallSize())
}

// The whole maze on flat ground, to hold against the film's.
function sampleCornMaze(): THREE.Group {
  const spans = mazeSpans(SHINING_MAZE, CONFIG.maze.size)
  return buildCornWalls(flatCornPieces(spans), cornWallSize())
}

// The corn maze's signs: painted plywood boards on two posts, their art on
// the +Z face and glowing a little through its own emissiveMap so it reads
// by headlight. Origin at ground level under the middle; the posts sink
// into the ground. The big CORN MAZE! board stands on the verge, the small
// ENTER! board by the gate.
export interface MazeSignSize {
  width: number
  height: number
  bottom: number
  // Each post's distance from the middle.
  postX: number
}

export const CORN_SIGN: MazeSignSize = {
  width: 3,
  height: 2,
  bottom: 0.7,
  postX: 1.25,
}

export const ENTER_SIGN: MazeSignSize = {
  width: 2,
  height: 1.25,
  bottom: 0.6,
  postX: 0.8,
}

const SIGN_POST = 0.1
const SIGN_SINK = 0.5

export function buildCornMazeSign(): THREE.Group {
  return buildMazeSign('corn-maze-sign', paintCornMazeSign(), CORN_SIGN)
}

export function buildEnterSign(): THREE.Group {
  return buildMazeSign('enter-sign', paintEnterSign(), ENTER_SIGN)
}

function buildMazeSign(
  name: string,
  art: CanvasArt,
  { width, height, bottom, postX }: MazeSignSize
): THREE.Group {
  const group = new THREE.Group()
  group.name = name
  const wood = lambert({ color: '#5a4630' })
  const postH = bottom + height + SIGN_SINK
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(SIGN_POST, postH, SIGN_POST),
      wood
    )
    mesh.position.set(
      side * postX,
      postH / 2 - SIGN_SINK,
      -SIGN_POST / 2 - 0.02
    )
    group.add(mesh)
  }
  const texture = artTexture(art)
  const face = lambert({
    map: texture,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: 0.45,
  })
  const back = lambert({ color: '#8a7552' })
  // BoxGeometry face order is +x, -x, +y, -y, +z, -z.
  const board = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.04), [
    back,
    back,
    back,
    back,
    face,
    back,
  ])
  board.position.y = bottom + height / 2
  group.add(board)
  mergeStatic(group)
  return group
}

// The portal at the maze's heart: a standing ring of pale green light
// round a slow spiral, a halo over it all, the ring breathing. It faces
// +Z and -Z alike; origin at ground level under the middle. Walk into it
// and it puts you back at the gate (loop.ts, maze.ts inPortal).
const PORTAL = {
  radius: 1.2,
  tube: 0.1,
  centre: 1.45,
  color: '#7cf7d4',
  glowScale: 6,
  spin: 0.9,
}

export interface PortalRig {
  group: THREE.Group
  update(t: number): void
}

export function buildPortal(): PortalRig {
  const group = new THREE.Group()
  group.name = 'portal'
  const { radius, tube, centre, color, glowScale, spin } = PORTAL
  const ringMaterial = applyPS1(new THREE.MeshBasicMaterial({ color }))
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 6, 24),
    ringMaterial
  )
  ring.position.y = centre
  group.add(ring)
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(radius - tube / 2, 24),
    applyPS1(
      new THREE.MeshBasicMaterial({
        map: artTexture(paintPortalSwirl()),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
      })
    )
  )
  swirl.position.y = centre
  group.add(swirl)
  const halo = makeGlowSprite(
    makeGlowTexture('rgba(124, 247, 212, 0.55)'),
    glowScale
  )
  halo.position.y = centre
  group.add(halo)
  const base = new THREE.Color(color)
  return {
    group,
    update(t) {
      swirl.rotation.z = -t * spin
      const breath = 0.75 + 0.25 * Math.sin(t * 2.1)
      ringMaterial.color.copy(base).multiplyScalar(breath)
      halo.material.opacity = 0.6 + 0.4 * breath
    },
  }
}

// --- Landmark beacon -----------------------------------------------------

// A tall pole with a lit panel and a big glow, color-coded so it reads
// across the fog. Origin at ground level.
export function buildLandmarkBeacon(
  color: THREE.ColorRepresentation
): THREE.Group {
  const group = new THREE.Group()
  // The pole stops at the panel centre, and the panel is deeper than the
  // pole is wide, so the pole top stays hidden inside it.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 9.4, 5),
    lambert({ color: '#20242a' })
  )
  pole.position.y = 4.7
  group.add(pole)
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.0, 0.36),
    lambert({
      color: '#101216',
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.9,
    })
  )
  panel.position.y = 9.4
  group.add(panel)
  const rgb = new THREE.Color(color)
  const sprite = makeGlowSprite(
    makeGlowTexture(
      `rgba(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)}, 0.55)`
    ),
    14
  )
  sprite.position.y = 9.4
  group.add(sprite)
  return group
}

// --- Cigarette packs -----------------------------------------------------

// A real king-size flip-top: 55 × 88 × 22 mm, lid open about 110° so the
// filter tips show. Origin at ground level under the middle, art facing +Z.
const PACK = {
  width: 0.055,
  depth: 0.022,
  bodyHeight: 0.066,
  lidHeight: 0.022,
  lidOpen: THREE.MathUtils.degToRad(110),
  stickRadius: 0.0036,
  filterLength: 0.021,
  glowScale: 0.9,
}

// A painted canvas as a texture, in sRGB like the CSS colors it was drawn in.
export function artTexture({ c }: CanvasArt): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Art that glows through its own emissiveMap, so it reads in the dark; the
// pickup pulse drives emissiveIntensity.
function packFace(texture: THREE.Texture): THREE.MeshLambertMaterial {
  return lambert({
    map: texture,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: 0.45,
  })
}

function packFlat(color: string): THREE.MeshLambertMaterial {
  return lambert({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.45,
  })
}

// Twenty sticks in three staggered rows of 7, 6, 7. Returns tip heights
// above the collar top: most sit flush, a few ride up out of the pack.
interface StickSpot {
  x: number
  z: number
  raised: number
}

function stickLayout(rng: Rng): StickSpot[] {
  const d = PACK.stickRadius * 2
  const rowGap = PACK.stickRadius * Math.sqrt(3)
  const spots: StickSpot[] = []
  for (const [row, n] of [
    [-1, 7],
    [0, 6],
    [1, 7],
  ]) {
    for (let i = 0; i < n; i++) {
      const raised =
        rng() < 0.2 ? range(rng, 0.006, 0.02) : range(rng, 0, 0.002)
      spots.push({ x: (i - (n - 1) / 2) * d, z: row * rowGap, raised })
    }
  }
  return spots
}

// glow: false leaves out the halo, for close-up views like the inventory.
function buildCigarettePack(
  brandId: string,
  seed = 0x5ac,
  { glow = true }: PickupOptions = {}
): THREE.Group {
  const art = paintPack(brandId)
  const { width: W, depth: D, bodyHeight: BH, lidHeight: LH } = PACK
  const pack = new THREE.Group()
  pack.name = `pack-${brandId}`
  const pulse: THREE.MeshLambertMaterial[] = []
  const face = (canvasArt: CanvasArt): THREE.MeshLambertMaterial => {
    const m = packFace(artTexture(canvasArt))
    pulse.push(m)
    return m
  }
  const flat = (color: string): THREE.MeshLambertMaterial => {
    const m = packFlat(color)
    pulse.push(m)
    return m
  }
  const hidden = new THREE.MeshBasicMaterial({ visible: false })

  // Body. BoxGeometry face order: +x, -x, +y, -y, +z, -z. The top is the
  // floor the filters stand on.
  const front = face(art.front)
  const side = face(art.side)
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, BH, D), [
    side,
    side,
    flat(art.inner),
    flat(art.edge),
    front,
    front,
  ])
  body.position.y = BH / 2
  pack.add(body)

  // The inner collar: an open-topped band standing proud of the body rim.
  const collarH = 0.012
  const collarMat = flat(art.collar)
  collarMat.side = THREE.DoubleSide
  const collar = new THREE.Mesh(
    new THREE.BoxGeometry(W - 0.002, collarH, D - 0.002),
    [collarMat, collarMat, hidden, hidden, collarMat, collarMat]
  )
  collar.position.y = BH - 0.002 + collarH / 2
  pack.add(collar)

  // Cigarettes, filter up: instanced paper and filter, tip on the top cap.
  const collarTop = BH - 0.002 + collarH
  const spots = stickLayout(mulberry32(seed))
  const r = PACK.stickRadius
  const paperLen = 0.03
  const paperGeo = new THREE.CylinderGeometry(r, r, paperLen, 6)
  paperGeo.translate(0, -paperLen / 2, 0)
  const filterGeo = new THREE.CylinderGeometry(r, r, PACK.filterLength, 6)
  filterGeo.translate(0, -PACK.filterLength / 2, 0)
  // CylinderGeometry groups: side, top cap, bottom cap.
  const tip = flat(art.stick.tip)
  const parts: [
    THREE.BufferGeometry,
    THREE.Material | THREE.Material[],
    number,
  ][] = [
    [paperGeo, flat(art.stick.paper), -PACK.filterLength],
    [filterGeo, [flat(art.stick.filter), tip, tip], 0],
  ]
  if (art.stick.band) {
    const bandGeo = new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.0018, 6)
    parts.push([bandGeo, flat(art.stick.band), -PACK.filterLength])
  }
  const dummy = new THREE.Object3D()
  for (const [geometry, material, offset] of parts) {
    const sticks = new THREE.InstancedMesh(geometry, material, spots.length)
    spots.forEach((spot, i) => {
      dummy.position.set(spot.x, collarTop + spot.raised + offset, spot.z)
      dummy.updateMatrix()
      sticks.setMatrixAt(i, dummy.matrix)
    })
    sticks.instanceMatrix.needsUpdate = true
    pack.add(sticks)
  }

  // The lid, hinged on the back top edge and swung open over the back.
  const hinge = new THREE.Group()
  hinge.position.set(0, BH, -D / 2)
  hinge.rotation.x = -PACK.lidOpen
  const lidSide = flat(art.edge)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W, LH, D), [
    lidSide,
    lidSide,
    face(art.lidTop),
    flat(art.inner),
    face(art.lidFront),
    lidSide,
  ])
  lid.position.set(0, LH / 2, D / 2)
  hinge.add(lid)
  pack.add(hinge)

  // A brand-colored halo so a 9 cm pack can be found in the fog.
  if (glow) {
    const halo = makeGlowSprite(makeGlowTexture(art.glow), PACK.glowScale)
    halo.position.y = BH * 0.6
    pack.add(halo)
  }

  setPulseMaterials(pack, pulse)
  return pack
}

// --- Joints --------------------------------------------------------------

// A hand-rolled cone joint, 9 cm. It must not read as a cigarette, so the
// shape is exaggerated: a strong taper from a fat tip to a thin card
// crutch, a lumpy and slightly bent body, a long paper twist that flops to
// one side, and a pale card crutch (not a tan filter). Origin at the middle
// of its length, lying along +X with the tip at +X.
const JOINT = {
  length: 0.09,
  tipRadius: 0.0085,
  crutchRadius: 0.003,
  crutchLength: 0.012,
  twistLength: 0.016,
  bend: 0.004,
  glowScale: 0.8,
}

const JOINT_PAPER = '#ece6cf'
const JOINT_CRUTCH = '#e0d8bc'
const JOINT_HOLE = '#2a2418'

// The paper body as a lathe: radius against length, crutch end at y = 0.
// Lumps come from the seeded rng so each joint in a pile differs.
function jointBody(rng: Rng, length: number): THREE.LatheGeometry {
  const { tipRadius: RT, crutchRadius: RC } = JOINT
  const points: THREE.Vector2[] = []
  const steps = 7
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Cone with a belly near the tip, then a pinch into the twist.
    let r = RC + (RT - RC) * Math.pow(t, 0.8)
    if (i === steps) r *= 0.55
    else if (i > 0) r *= range(rng, 0.9, 1.1)
    points.push(new THREE.Vector2(r, t * length))
  }
  // Close the tip so the open lathe end never shows.
  points.push(new THREE.Vector2(0, length * 1.02))
  const geometry = new THREE.LatheGeometry(points, 6)
  // A gentle bow along the length, then lay +Y along +X.
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / length
    pos.setZ(i, pos.getZ(i) + JOINT.bend * 4 * t * (1 - t))
  }
  geometry.computeVertexNormals()
  return geometry.rotateZ(-Math.PI / 2)
}

function jointPart(
  rng: Rng,
  paper: THREE.Material,
  crutch: THREE.Material,
  hole: THREE.Material
): THREE.Group {
  const { length: L, crutchRadius: RC, tipRadius: RT } = JOINT
  const { crutchLength: CL, twistLength: TL } = JOINT
  const joint = new THREE.Group()
  // CylinderGeometry runs along +Y; rotate so +Y becomes +X (tip end).
  const toX = <G extends THREE.BufferGeometry>(geometry: G): G =>
    geometry.rotateZ(-Math.PI / 2)
  const bodyLen = L - CL - TL
  const body = new THREE.Mesh(jointBody(rng, bodyLen), paper)
  body.position.x = -L / 2 + CL
  // The card crutch sticks out past the paper, open at the end.
  const card = new THREE.Mesh(
    toX(new THREE.CylinderGeometry(RC, RC * 0.95, CL, 6)),
    crutch
  )
  card.position.x = -L / 2 + CL / 2
  const mouth = new THREE.Mesh(
    toX(new THREE.CylinderGeometry(RC * 0.6, RC * 0.6, 0.0008, 6)),
    hole
  )
  mouth.position.x = -L / 2 - 0.0002
  // The twist: a thin paper wisp, kinked once and flopped sideways.
  const twist = new THREE.Group()
  twist.position.x = L / 2 - TL
  const wispA = new THREE.Mesh(
    toX(new THREE.ConeGeometry(RT * 0.55, TL * 0.55, 4)),
    paper
  )
  wispA.position.x = TL * 0.27
  const wispB = new THREE.Mesh(
    toX(new THREE.ConeGeometry(RT * 0.3, TL * 0.6, 4)),
    paper
  )
  wispB.position.set(TL * 0.62, 0, range(rng, 0.002, 0.004))
  wispB.rotation.y = -range(rng, 0.5, 0.9)
  twist.add(wispA, wispB)
  twist.rotation.set(range(rng, 0, Math.PI), range(rng, -0.3, 0.3), 0)
  joint.add(body, card, mouth, twist)
  return joint
}

// Three joints dropped in a loose pile, crossed, not lined up like a pack.
// glow: false leaves out the halo.
function buildJoints({ glow = true }: PickupOptions = {}): THREE.Group {
  const pulse: THREE.MeshLambertMaterial[] = []
  const mat = (color: string): THREE.MeshLambertMaterial => {
    const m = lambert({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.45,
    })
    pulse.push(m)
    return m
  }
  const paper = mat(JOINT_PAPER)
  const crutch = mat(JOINT_CRUTCH)
  const hole = lambert({ color: JOINT_HOLE })
  const rng = mulberry32(0x7015)
  const group = new THREE.Group()
  group.name = 'joints'
  // [dx, dz, yaw, lift]: the third rests across the other two.
  const lay = [
    [0, -0.014, 0.35, 0],
    [0.006, 0.012, -0.3, 0],
    [-0.004, 0, 1.25, JOINT.tipRadius * 1.4],
  ]
  for (const [dx, dz, yaw, lift] of lay) {
    const joint = jointPart(rng, paper, crutch, hole)
    joint.position.set(dx, JOINT.tipRadius + lift, dz)
    joint.rotation.y = yaw
    group.add(joint)
  }
  if (glow) {
    const halo = makeGlowSprite(
      makeGlowTexture('rgba(74, 222, 128, 0.6)'),
      JOINT.glowScale
    )
    halo.position.y = 0.02
    group.add(halo)
  }
  setPulseMaterials(group, pulse)
  return group
}

// --- Berry bush ----------------------------------------------------------

// The berries' skin: near black, with a little light in them so they read
// through the fog at the lot's edge.
function berryMaterial(): THREE.MeshLambertMaterial {
  return lambert({
    color: '#22101f',
    emissive: new THREE.Color('#b0407a'),
    emissiveIntensity: 0.45,
  })
}

// The bush by the spawn Citgo that gives one berry a day (sharedworld.ts
// rule 8): a low mound of dark lumps on a stub of trunk, berries set on
// the lumps' skins. Origin at ground level under the middle; about 1.4 m
// across and 1 m high.
export function buildBerryBush(seed = 0xbe221): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'berry-bush'
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.08, 0.3, 5),
    lambert({ color: '#33271a' })
  )
  trunk.position.y = 0.15
  group.add(trunk)
  // A shade over the tree canopies, so it reads as a bush and not a rock.
  const leaf = lambert({ color: '#2a4529' })
  const lumps: { at: THREE.Vector3; r: number }[] = []
  const count = 7
  for (let i = 0; i < count; i++) {
    const r = i === 0 ? 0.5 : range(rng, 0.3, 0.42)
    const a = (i / count) * Math.PI * 2 + range(rng, -0.3, 0.3)
    const d = i === 0 ? 0 : range(rng, 0.3, 0.42)
    const at = new THREE.Vector3(
      Math.cos(a) * d,
      r * 0.9 + range(rng, 0.05, 0.3),
      Math.sin(a) * d
    )
    const lump = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaf)
    lump.position.copy(at)
    lump.rotation.set(range(rng, 0, Math.PI), range(rng, 0, Math.PI), 0)
    group.add(lump)
    lumps.push({ at, r })
  }
  // The berries in one group, so the bush can show itself picked clean.
  const berries = new THREE.Group()
  berries.name = 'berries'
  group.add(berries)
  const berry = berryMaterial()
  const berryGeo = new THREE.SphereGeometry(0.045, 5, 4)
  for (let i = 0; i < 16; i++) {
    const lump = lumps[Math.floor(range(rng, 0, lumps.length)) % lumps.length]
    // On the skin, above the equator so none sit in the dirt.
    const yaw = range(rng, 0, Math.PI * 2)
    const pitch = range(rng, 0.1, 1.2)
    const mesh = new THREE.Mesh(berryGeo, berry)
    mesh.position.set(
      lump.at.x + Math.cos(yaw) * Math.cos(pitch) * lump.r,
      lump.at.y + Math.sin(pitch) * lump.r,
      lump.at.z + Math.sin(yaw) * Math.cos(pitch) * lump.r
    )
    berries.add(mesh)
  }
  return group
}

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

// --- Raincloud -----------------------------------------------------------

// Gron's own weather: a low grey cloud that never leaves him, raining on
// him alone. Origin at the cloud's underside, where the rain starts; the
// drops fall `fall` metres, to the ground under it. update(t) moves the
// rain; call it every frame with a running time in seconds, or once with a
// fixed time to hold it still.
export interface Raincloud {
  group: THREE.Group
  update(t: number): void
}

// Metres a drop falls per second, and how many fall at once.
const RAIN_SPEED = 4.5
const RAIN_DROPS = 26

export function buildRaincloud(fall = 2.6, seed = 0x7a1c): Raincloud {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'raincloud'
  const shades = [lambert({ color: '#5a6069' }), lambert({ color: '#474c55' })]
  // A flattened cluster, wider than it is tall, its belly lowest.
  for (let i = 0; i < 7; i++) {
    const r = i === 0 ? 0.36 : range(rng, 0.2, 0.32)
    const a = (i / 7) * Math.PI * 2 + range(rng, -0.4, 0.4)
    const d = i === 0 ? 0 : range(rng, 0.22, 0.4)
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0),
      shades[i % shades.length]
    )
    puff.position.set(
      Math.cos(a) * d,
      r * 0.6 + range(rng, 0, 0.12),
      Math.sin(a) * d * 0.7
    )
    puff.scale.y = 0.7
    puff.rotation.set(range(rng, 0, Math.PI), range(rng, 0, Math.PI), 0)
    group.add(puff)
  }
  // The rain: thin streaks under the cloud, each starting at its own point
  // of the fall so the sheet never empties.
  const dropMat = new THREE.MeshBasicMaterial({
    color: '#9fb4c8',
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  })
  const dropGeo = new THREE.BoxGeometry(0.012, 0.18, 0.012)
  const drops = Array.from({ length: RAIN_DROPS }, () => {
    const mesh = new THREE.Mesh(dropGeo, dropMat)
    const a = range(rng, 0, Math.PI * 2)
    const d = Math.sqrt(rng()) * 0.42
    mesh.position.set(Math.cos(a) * d, 0, Math.sin(a) * d * 0.7)
    group.add(mesh)
    return { mesh, phase: rng() }
  })
  const update = (t: number) => {
    for (const { mesh, phase } of drops) {
      const along = ((t * RAIN_SPEED) / fall + phase) % 1
      mesh.position.y = -along * fall
    }
  }
  update(0)
  setMotion(group, update)
  return { group, update }
}

// --- Flames --------------------------------------------------------------

// Moab Coldë and his horse burn without burning down: tongues of flame
// that stand up off them, each a pair of low-poly cones (an orange skin
// round a yellow heart) over a soft halo, with sparks and smoke rising off
// them. Each tongue swells slowly and flickers a little over it, and its
// halo brightens and dims on its own phase. update(t) moves them; call it
// every frame with a running time, or once with a fixed time to hold them
// still.
export interface Flames {
  group: THREE.Group
  update(t: number): void
  // Stand the tongues back up when what they burn on tips by (x, z)
  // radians, so fire always rises.
  counter(x: number, z: number): void
}

// One tongue: its base [x, y, z] in the owner's space and its height in
// metres.
export interface FlameSpot {
  at: Vec3
  size: number
}

interface FlameParts {
  geometry: THREE.ConeGeometry
  skin: THREE.MeshBasicMaterial
  heart: THREE.MeshBasicMaterial
  halo: THREE.Texture
  spark: THREE.Texture
  smoke: THREE.Texture
}

// Unit cones with their base at the origin, shared by every tongue.
let flameParts: FlameParts | null = null
function getFlameParts(): FlameParts {
  if (!flameParts) {
    const geometry = new THREE.ConeGeometry(0.5, 1, 5)
    geometry.translate(0, 0.5, 0)
    const flame = (color: string, opacity: number) =>
      applyPS1(
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
    flameParts = {
      geometry,
      skin: flame('#ff4a12', 0.85),
      heart: flame('#ffc23a', 0.9),
      halo: makeGlowTexture('rgba(255, 96, 32, 0.55)'),
      spark: makeGlowTexture('rgba(255, 255, 255, 1)'),
      smoke: makeGlowTexture('rgba(255, 255, 255, 0.9)'),
    }
  }
  return flameParts
}

// A tongue is this much narrower than it is tall, and its halo this many
// times its height across.
const FLAME_WIDTH = 0.45
const FLAME_HALO = 2.4

// What rises off a tongue, in multiples of its height: how many at once,
// how long one takes to rise, how high and how wide it goes, how much it
// flutters side to side, and its point size against the biggest tongue.
interface ParticleKind {
  perTongue: number
  seconds: number
  rise: number
  spread: number
  flutter: number
  size: number
  opacity: number
}

// Quick and bright: a spark flies up a few tongue heights and goes out.
const SPARKS: ParticleKind = {
  perTongue: 3,
  seconds: 1.3,
  rise: 4,
  spread: 0.9,
  flutter: 0.15,
  size: 0.12,
  opacity: 1,
}

// Slow and thin: smoke climbs higher, spreading as it thins.
const SMOKE: ParticleKind = {
  perTongue: 2,
  seconds: 4,
  rise: 7,
  spread: 1.6,
  flutter: 0.3,
  size: 1.1,
  opacity: 0.35,
}

export function buildFlames(
  spots: readonly FlameSpot[],
  seed = 0xf1a3
): Flames {
  const rng = mulberry32(seed)
  const { geometry, skin, heart, halo, spark, smoke } = getFlameParts()
  const group = new THREE.Group()
  group.name = 'flames'
  // Every tongue's skin in one draw and every heart in another: instanced
  // cones, each placed, turned and stretched by its own matrix.
  const skins = new THREE.InstancedMesh(geometry, skin, spots.length)
  const hearts = new THREE.InstancedMesh(geometry, heart, spots.length)
  group.add(skins, hearts)
  const tongues = spots.map(({ at, size }) => {
    // Each halo has its own material, so each one can dim on its own.
    const sprite = makeGlowSprite(halo, size * FLAME_HALO)
    sprite.position.set(at[0], at[1] + size * 0.35, at[2])
    group.add(sprite)
    return { at, sprite, size, phase: range(rng, 0, Math.PI * 2) }
  })
  // How far what they burn on has tipped (counter), undone on every tongue.
  const tip = new THREE.Euler()
  const tipped = new THREE.Quaternion()
  const turn = new THREE.Euler()
  const turned = new THREE.Quaternion()
  const where = new THREE.Vector3()
  const stretch = new THREE.Vector3()
  const matrix = new THREE.Matrix4()

  // Sparks and smoke rise off every tongue: a few of each per tongue, each
  // on its own point in its own cycle, so they never leave together. One
  // set of points for each, so the whole fire is two more draws.
  const rise = (kind: ParticleKind) =>
    tongues.flatMap((tongue) =>
      Array.from({ length: kind.perTongue }, (_, k) => ({
        tongue,
        offset: (k + rng()) / kind.perTongue,
        turn: range(rng, 0, Math.PI * 2),
      }))
    )
  const sparks = rise(SPARKS)
  const puffs = rise(SMOKE)
  const biggest = Math.max(...spots.map((s) => s.size), 0.05)
  const points = (
    count: number,
    channels: 3 | 4,
    material: THREE.PointsMaterial,
    name: string
  ) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    )
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(count * channels), channels)
    )
    const cloud = new THREE.Points(geometry, material)
    cloud.name = name
    // The points move every frame; their bounds would go stale.
    cloud.frustumCulled = false
    group.add(cloud)
    return geometry
  }
  const sparkGeo = points(
    sparks.length,
    3,
    new THREE.PointsMaterial({
      map: spark,
      size: Math.max(0.025, biggest * SPARKS.size),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    'sparks'
  )
  const smokeGeo = points(
    puffs.length,
    4,
    new THREE.PointsMaterial({
      map: smoke,
      size: biggest * SMOKE.size,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    }),
    'smoke'
  )

  // Where a particle is `life` (0 to 1) of the way up its rise: drifting
  // round its own turn, which shifts every time it starts again.
  const place = (
    out: THREE.BufferAttribute,
    i: number,
    { tongue, turn }: { tongue: (typeof tongues)[number]; turn: number },
    kind: ParticleKind,
    life: number,
    cycle: number,
    t: number
  ) => {
    const { at, size } = tongue
    const a = turn + cycle * 2.4
    const spread = size * kind.spread * life
    out.setXYZ(
      i,
      at[0] +
        Math.cos(a) * spread +
        Math.sin(t * 3 + turn) * size * kind.flutter,
      at[1] + size * (0.6 + kind.rise * life),
      at[2] + Math.sin(a) * spread
    )
  }

  const update = (t: number) => {
    tongues.forEach(({ at, sprite, size, phase }, i) => {
      // A slow swell with a quicker flicker over it.
      const swell =
        0.84 +
        0.08 * Math.sin(t * 2.4 + phase) +
        0.05 * Math.sin(t * 5.3 + phase * 1.7) +
        0.03 * Math.sin(t * 9.1 + phase * 2.3)
      const w = size * FLAME_WIDTH * (1.1 - 0.2 * swell)
      turned.setFromEuler(
        turn.set(0, t * 0.9 + phase, 0.12 * Math.sin(t * 1.8 + phase))
      )
      turned.premultiply(tipped)
      where.set(...at)
      skins.setMatrixAt(
        i,
        matrix.compose(where, turned, stretch.set(w, size * swell, w))
      )
      // The heart is the skin at a little over half the size.
      hearts.setMatrixAt(
        i,
        matrix.compose(where, turned, stretch.multiplyScalar(0.55))
      )
      const glow = 0.5 + 0.5 * Math.sin(t * 1.2 + phase)
      sprite.material.opacity = 0.45 + 0.4 * glow
      sprite.scale.setScalar(size * FLAME_HALO * (0.9 + 0.15 * glow))
    })
    skins.instanceMatrix.needsUpdate = true
    hearts.instanceMatrix.needsUpdate = true
    const sparkAt = sparkGeo.getAttribute('position') as THREE.BufferAttribute
    const sparkColor = sparkGeo.getAttribute('color') as THREE.BufferAttribute
    sparks.forEach((p, i) => {
      const age = t / SPARKS.seconds + p.offset
      const life = age - Math.floor(age)
      place(sparkAt, i, p, SPARKS, life, Math.floor(age), t)
      // Additive: fading to black is fading out. Yellow cools to red.
      const heat = 1 - life
      sparkColor.setXYZ(i, heat, heat * (0.4 + 0.4 * heat), heat * 0.15)
    })
    const smokeAt = smokeGeo.getAttribute('position') as THREE.BufferAttribute
    const smokeColor = smokeGeo.getAttribute('color') as THREE.BufferAttribute
    puffs.forEach((p, i) => {
      const age = t / SMOKE.seconds + p.offset
      const life = age - Math.floor(age)
      place(smokeAt, i, p, SMOKE, life, Math.floor(age), t)
      // Thickening as it leaves the flame, thinning as it climbs.
      const alpha = SMOKE.opacity * Math.min(1, life * 5) * (1 - life)
      smokeColor.setXYZW(i, 0.42, 0.4, 0.4, alpha)
    })
    sparkAt.needsUpdate = true
    sparkColor.needsUpdate = true
    smokeAt.needsUpdate = true
    smokeColor.needsUpdate = true
  }
  const counter = (x: number, z: number) => {
    tipped.setFromEuler(tip.set(-x, 0, -z))
  }
  update(0)
  // Culled by where the tongues stand: they swell and sway a little past
  // these bounds, never far.
  skins.computeBoundingSphere()
  hearts.computeBoundingSphere()
  setMotion(group, update)
  return { group, update, counter }
}

// --- Fire roots ----------------------------------------------------------

// Cracks of fire spreading out over the ground from where Moab Coldë
// stands: roots that wander outward, fork, and thin to nothing, glowing on
// a soft pool of light, writhing slowly, with a pulse of heat running out
// along them.
// Origin on the ground at the middle; everything lies a hair over the
// ground, draped over it by `groundAt` (heights in the roots' own space;
// flat when left out), so the roots follow a sloping lot as they writhe. update(t) moves the pulse; call it every frame with a running time,
// or once with a fixed time to hold it still.
export interface FireRoots {
  group: THREE.Group
  update(t: number): void
}

// The roots, in metres and radians: how many leave the middle, how far a
// root runs before it gives out, its step, how much it wanders a step, how
// wide it starts and ends, and how often it forks.
const ROOTS = {
  count: 8,
  reach: [1.6, 3.0] as const,
  step: 0.22,
  wander: 0.35,
  width: [0.08, 0.022] as const,
  fork: 0.22,
  // Over the ground, clear of the lot without floating off it.
  lift: 0.04,
  // The pulse: how fast it runs outward (m/s), and its wavelength.
  pulseSpeed: 0.9,
  pulseLength: 1.6,
  pool: 6.5,
  // The writhe: every point of every root turns about the middle by up to
  // `twist` radians a metre out (so the tips swing widest), and runs a
  // little longer and shorter by up to `stretch` of its reach, each on a
  // slow wave that travels out along the roots. One smooth field over the
  // ground, so a fork never comes apart from its root.
  twist: 0.07,
  twistSeconds: 6.5,
  twistLength: 3.5,
  stretch: 0.05,
  stretchSeconds: 4.2,
  stretchLength: 2.2,
  // The ground under them, sampled once into a grid this many cells a
  // side over this span (wide enough for the pool and the writhe), and
  // read between samples as they move.
  grid: 28,
  span: 7.2,
}

// Heights in the roots' own space, from the origin's ground.
export type GroundAt = (x: number, z: number) => number

// `ground` sampled once on a grid round the origin; between samples, the
// blend of the four round the point. Off the grid, the nearest edge.
function groundGrid(ground: GroundAt): GroundAt {
  const n = ROOTS.grid
  const half = ROOTS.span / 2
  const cell = ROOTS.span / n
  const heights: number[] = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      heights.push(ground(-half + i * cell, -half + j * cell))
    }
  }
  const at = (i: number, j: number) => heights[j * (n + 1) + i]
  return (x, z) => {
    const u = Math.min(n, Math.max(0, (x + half) / cell))
    const v = Math.min(n, Math.max(0, (z + half) / cell))
    const i = Math.min(n - 1, Math.floor(u))
    const j = Math.min(n - 1, Math.floor(v))
    const fu = u - i
    const fv = v - j
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fu
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu
    return top + (bottom - top) * fv
  }
}

export function buildFireRoots(
  seed = 0xf007,
  ground: GroundAt = () => 0
): FireRoots {
  const heightAt = groundGrid(ground)
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'fire-roots'
  const positions: number[] = []
  // Each quad's distance out from the middle, for the pulse and the fade.
  const reachOf: number[] = []

  // One root: steps out from (x, z) heading `a`, `left` metres still to
  // run, `from` metres already out; a fork is a shorter root of its own.
  const grow = (
    x: number,
    z: number,
    a: number,
    left: number,
    from: number
  ) => {
    let heading = a
    let run = 0
    while (run < left) {
      heading += range(rng, -ROOTS.wander, ROOTS.wander)
      const nx = x + Math.cos(heading) * ROOTS.step
      const nz = z + Math.sin(heading) * ROOTS.step
      const out = from + run
      const total = from + left
      const half = (t: number) =>
        (ROOTS.width[0] + (ROOTS.width[1] - ROOTS.width[0]) * t) / 2
      const w0 = half(out / total)
      const w1 = half((out + ROOTS.step) / total)
      // Square to the step, either side.
      const px = -Math.sin(heading)
      const pz = Math.cos(heading)
      const y = ROOTS.lift
      positions.push(
        x + px * w0,
        y,
        z + pz * w0,
        x - px * w0,
        y,
        z - pz * w0,
        nx - px * w1,
        y,
        nz - pz * w1,
        x + px * w0,
        y,
        z + pz * w0,
        nx - px * w1,
        y,
        nz - pz * w1,
        nx + px * w1,
        y,
        nz + pz * w1
      )
      for (let k = 0; k < 6; k++) reachOf.push(out / total)
      if (rng() < ROOTS.fork && left - run > 0.6) {
        const side = rng() < 0.5 ? -1 : 1
        grow(
          nx,
          nz,
          heading + side * range(rng, 0.4, 0.8),
          (left - run) * 0.6,
          out
        )
      }
      x = nx
      z = nz
      run += ROOTS.step
    }
  }
  for (let i = 0; i < ROOTS.count; i++) {
    const a = (i / ROOTS.count) * Math.PI * 2 + range(rng, -0.25, 0.25)
    grow(0, 0, a, range(rng, ...ROOTS.reach), 0)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  const colors = new Float32Array(positions.length)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const cracks = new THREE.Mesh(
    geometry,
    applyPS1(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        // Drawn over the ground they lie on, never under it.
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      })
    )
  )
  cracks.name = 'fire-root-cracks'
  // The points move every frame; their bounds would go stale.
  cracks.frustumCulled = false
  group.add(cracks)

  // A soft pool of firelight on the ground under them, draped over it.
  const poolGeo = new THREE.PlaneGeometry(ROOTS.pool, ROOTS.pool, 16, 16)
  poolGeo.rotateX(-Math.PI / 2)
  const poolAt = poolGeo.getAttribute('position') as THREE.BufferAttribute
  for (let v = 0; v < poolAt.count; v++) {
    poolAt.setY(v, heightAt(poolAt.getX(v), poolAt.getZ(v)) + ROOTS.lift - 0.01)
  }
  const pool = new THREE.Mesh(
    poolGeo,
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture('rgba(255, 90, 28, 0.35)'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    })
  )
  pool.name = 'fire-root-pool'
  group.add(pool)

  const color = geometry.getAttribute('color') as THREE.BufferAttribute
  const at = geometry.getAttribute('position') as THREE.BufferAttribute
  // Where each point lies at rest, as distance and angle from the middle.
  const rest = Array.from({ length: at.count }, (_, v) => {
    const x = at.getX(v)
    const z = at.getZ(v)
    return { r: Math.hypot(x, z), a: Math.atan2(z, x) }
  })
  const TAU = Math.PI * 2
  const update = (t: number) => {
    const R = ROOTS
    for (let v = 0; v < rest.length; v++) {
      const { r, a } = rest[v]
      // The angle term gives each direction its own phase, so the roots
      // never all swing the same way at once.
      const twist =
        R.twist *
        r *
        Math.sin(TAU * (t / R.twistSeconds - r / R.twistLength) + 2 * a)
      const stretch =
        1 +
        R.stretch *
          Math.sin(TAU * (t / R.stretchSeconds - r / R.stretchLength) + 3 * a)
      const x = Math.cos(a + twist) * r * stretch
      const z = Math.sin(a + twist) * r * stretch
      at.setXYZ(v, x, heightAt(x, z) + ROOTS.lift, z)
    }
    at.needsUpdate = true
    const longest = ROOTS.reach[1]
    for (let v = 0; v < reachOf.length; v++) {
      const out = reachOf[v] * longest
      const wave =
        0.5 +
        0.5 *
          Math.sin(
            ((out - t * ROOTS.pulseSpeed) / ROOTS.pulseLength) * Math.PI * 2
          )
      // Hot at the middle, dimming toward the tips; the pulse rides over.
      const heat = (1 - reachOf[v] * 0.7) * (0.35 + 0.65 * wave)
      color.setXYZ(v, heat, heat * 0.32, heat * 0.07)
    }
    color.needsUpdate = true
    pool.material.opacity = 0.7 + 0.3 * Math.sin(t * 1.3)
  }
  update(0)
  setMotion(group, update)
  return { group, update }
}

// --- Skeleton horse ------------------------------------------------------

// Moab Coldë's horse: bare bone from skull to tail, under a saddle with
// saddlebags, burning at the mane, the tail and the hooves, its eyes lit.
// It stands at ease: the ribs rise and fall, the head nods and looks about,
// the tail swishes now and then, and every so often it stamps a forehoof.
// Horse-local space: origin on the ground under the middle of the barrel,
// facing +Z, left side +X, like a figure. Call update(t) every frame with
// a running time, or once with a fixed time to hold it still.
export interface SkeletonHorse {
  group: THREE.Group
  update(t: number): void
}

// The top of the seat, metres off the ground.
const HORSE_SADDLE_TOP = 1.55

// The spine's height along the back, from the croup (-Z) to the withers
// (+Z), as [z, y] stations to interpolate between.
const HORSE_SPINE: [number, number][] = [
  [-0.9, 1.38],
  [-0.6, 1.4],
  [-0.2, 1.37],
  [0.2, 1.4],
  [0.55, 1.47],
]

function horseSpineY(z: number): number {
  const last = HORSE_SPINE.length - 1
  if (z <= HORSE_SPINE[0][0]) return HORSE_SPINE[0][1]
  if (z >= HORSE_SPINE[last][0]) return HORSE_SPINE[last][1]
  let i = 0
  while (HORSE_SPINE[i + 1][0] < z) i++
  const [z0, y0] = HORSE_SPINE[i]
  const [z1, y1] = HORSE_SPINE[i + 1]
  return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0)
}

// Ribs as [z, radius]: deepest behind the shoulder, closing toward the
// loin.
const HORSE_RIBS: [number, number][] = [
  [0.4, 0.27],
  [0.3, 0.31],
  [0.2, 0.33],
  [0.1, 0.33],
  [0.0, 0.32],
  [-0.1, 0.3],
  [-0.2, 0.27],
  [-0.3, 0.23],
]

// Each rib is an arch round the barrel, open at the top where the spine
// runs: a torus arc missing this much either side of straight up.
const RIB_GAP = 0.45

// The joints the horse moves about, in horse-local space.
const HORSE_NECK_BASE: Vec3 = [0, 1.48, 0.6]
const HORSE_POLL: Vec3 = [0, 2.0, 1.02]
const HORSE_CROUP: Vec3 = [0, 1.36, -0.95]
const HORSE_CHEST: Vec3 = [0, 1.4, 0.05]

// The idle, in seconds and radians. A stamp comes once a cycle, the tail
// swishes in bouts, and the breath and the nod never stop.
const HORSE_IDLE = {
  breathSeconds: 4.5,
  breathDepth: 0.025,
  nod: 0.1,
  nodSeconds: 13,
  look: 0.2,
  lookSeconds: 21,
  swish: 0.35,
  swishSeconds: 1.6,
  swishBoutSeconds: 11,
  stampSeconds: 9,
  stampLength: 0.8,
  stampLift: 0.35,
}

const UP = new THREE.Vector3(0, 1, 0)

// A bone from a to b: a thin five-sided cylinder, narrower at b.
function boneBetween(
  a: Vec3,
  b: Vec3,
  radius: number,
  material: THREE.Material
): THREE.Mesh {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const length = dir.length()
  // CylinderGeometry runs top (+Y) to bottom; the bottom is at a.
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.8, radius, length, 5),
    material
  )
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize())
  return mesh
}

// A knuckle of bone at a joint.
function knob(at: Vec3, radius: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 0),
    material
  )
  mesh.position.set(...at)
  return mesh
}

function boxAt(
  size: Vec3,
  at: Vec3,
  material: THREE.Material,
  rotation?: Vec3
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...at)
  if (rotation) mesh.rotation.set(...rotation)
  return mesh
}

// A moving part of the horse: `pivot` turns about `at`, and everything
// added to `body` is placed in horse-local space as if it never moved.
function hinge(
  parent: THREE.Object3D,
  name: string,
  at: Vec3
): { pivot: THREE.Group; body: THREE.Group } {
  const pivot = new THREE.Group()
  pivot.name = name
  pivot.position.set(...at)
  const body = new THREE.Group()
  body.position.set(-at[0], -at[1], -at[2])
  pivot.add(body)
  parent.add(pivot)
  return { pivot, body }
}

// The horse's skull: a cranium and a long muzzle with the jaw under it,
// in its own space with the poll at the origin and the nose along +Z.
// Its eyes burn in their sockets.
let horseEyeGlow: THREE.Texture | null = null
function horseSkull(bone: THREE.Material, socket: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  group.name = 'horse-skull'
  group.add(boxAt([0.2, 0.2, 0.24], [0, 0, 0.04], bone))
  // The muzzle narrows toward the nose.
  const muzzle = new THREE.BoxGeometry(0.15, 0.13, 0.4)
  const pos = muzzle.attributes.position
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > 0) {
      pos.setX(i, pos.getX(i) * 0.7)
      pos.setY(i, pos.getY(i) * 0.8)
    }
  }
  muzzle.computeVertexNormals()
  const snout = new THREE.Mesh(muzzle, bone)
  snout.position.set(0, -0.02, 0.34)
  group.add(snout)
  group.add(boxAt([0.11, 0.05, 0.42], [0, -0.12, 0.3], bone, [0.12, 0, 0]))
  // The nostril hole, and an eye socket each side with its ember.
  group.add(boxAt([0.08, 0.04, 0.02], [0, 0.01, 0.545], socket))
  horseEyeGlow ??= makeGlowTexture('rgba(255, 80, 24, 0.9)')
  for (const side of [1, -1]) {
    group.add(boxAt([0.02, 0.07, 0.08], [side * 0.1, 0.02, 0.08], socket))
    const eye = makeGlowSprite(horseEyeGlow, 0.12)
    eye.position.set(side * 0.115, 0.02, 0.08)
    group.add(eye)
  }
  // The front teeth, in rows along the end of the jaw.
  for (let i = 0; i < 5; i++) {
    group.add(boxAt([0.1, 0.03, 0.016], [0, -0.085, 0.42 + i * 0.025], bone))
  }
  return group
}

// 0 to 1 and back to 0 across the first `length` seconds of every
// `period`, and 0 the rest of the time.
function pulse(t: number, period: number, length: number): number {
  const at = ((t % period) + period) % period
  return at < length ? Math.sin((at / length) * Math.PI) : 0
}

// Bakes every node's plain mesh children (no children of their own, one
// material) into one mesh per material, in place: the same look in a few
// draws instead of one per part. A mesh alone with its material stays as
// it is, and nothing else (sprites, points, groups) is touched, so a
// pivot's parts merge among themselves and still move with it.
//
// A part keeps only the attributes its material reads: position and
// normal, and uv where the material has a map. Parts that still differ
// (a mapped part with no uv) merge only with their like.
export function mergeStatic(root: THREE.Object3D): void {
  const nodes: THREE.Object3D[] = []
  root.traverse((node) => nodes.push(node))
  for (const node of nodes) {
    const groups = new Map<
      string,
      { material: THREE.Material; meshes: THREE.Mesh[] }
    >()
    for (const child of node.children) {
      if (!isMesh(child) || child.children.length > 0) continue
      if (Array.isArray(child.material)) continue
      const keep = keptAttributes(child.material, child.geometry)
      const key = `${child.material.uuid}|${keep.join(',')}`
      const group = groups.get(key) ?? { material: child.material, meshes: [] }
      group.meshes.push(child)
      groups.set(key, group)
    }
    for (const { material, meshes } of groups.values()) {
      if (meshes.length < 2) continue
      const parts = meshes.map((mesh) => {
        mesh.updateMatrix()
        const source = mesh.geometry.index
          ? mesh.geometry.toNonIndexed()
          : mesh.geometry.clone()
        source.applyMatrix4(mesh.matrix)
        const part = new THREE.BufferGeometry()
        for (const name of keptAttributes(material, mesh.geometry)) {
          part.setAttribute(name, source.getAttribute(name))
        }
        return part
      })
      const merged = mergeGeometries(parts) as THREE.BufferGeometry | null
      if (!merged) continue
      for (const mesh of meshes) {
        node.remove(mesh)
        mesh.geometry.dispose()
      }
      node.add(new THREE.Mesh(merged, material))
    }
  }
}

// What a part needs to draw with `material`: always position and normal,
// and uv when the material has a map to read through it.
function keptAttributes(
  material: THREE.Material,
  geometry: THREE.BufferGeometry
): string[] {
  const keep = ['position', 'normal']
  const mapped = 'map' in material && material.map !== null
  if (mapped && geometry.getAttribute('uv')) keep.push('uv')
  return keep
}

export function buildSkeletonHorse(): SkeletonHorse {
  const group = new THREE.Group()
  group.name = 'skeleton-horse'
  const bone = lambert({ color: '#d6cfb8' })
  const socket = lambert({ color: '#060606' })
  const hoofMat = lambert({ color: '#2a241c' })
  const leather = lambert({ color: '#3a2216' })
  const bag = lambert({ color: '#4a2c1a' })
  const strap = lambert({ color: '#0a0a0b' })
  const iron = lambert({ color: '#8a8a86' })
  const blanket = lambert({ color: '#5e0f0f' })

  // The backbone, a vertebra every 10 cm, with the spines over the
  // withers standing tallest.
  for (let i = 0; i <= 14; i++) {
    const z = -0.9 + i * 0.1
    const y = horseSpineY(z)
    group.add(boxAt([0.08, 0.09, 0.08], [0, y, z], bone))
    const spine = 0.05 + Math.max(0, z - 0.1) * 0.25
    group.add(boxAt([0.025, spine, 0.04], [0, y + 0.045 + spine / 2, z], bone))
  }

  // The ribcage, each rib a torus arc open at the top, the sternum along
  // the bottom of it, and a girth strap round it just behind the elbows
  // holding the saddle on. They breathe together, out from the chest.
  const ribs = hinge(group, 'horse-ribs', HORSE_CHEST)
  for (const [z, r] of HORSE_RIBS) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.022, 3, 9, Math.PI * 2 - RIB_GAP * 2),
      bone
    )
    rib.rotation.z = Math.PI / 2 + RIB_GAP
    rib.position.set(0, horseSpineY(z) - r * 0.92, z)
    ribs.body.add(rib)
  }
  ribs.body.add(boxAt([0.07, 0.04, 0.7], [0, 0.82, 0.08], bone, [-0.08, 0, 0]))
  const girth = new THREE.Mesh(
    new THREE.TorusGeometry(0.345, 0.018, 3, 12),
    strap
  )
  girth.position.set(0, horseSpineY(0.15) - 0.33 * 0.92, 0.15)
  ribs.body.add(girth)

  // Shoulder blades and the pelvis.
  for (const side of [1, -1]) {
    group.add(
      boxAt([0.025, 0.32, 0.12], [side * 0.25, 1.25, 0.46], bone, [
        0.35,
        0,
        side * 0.12,
      ])
    )
  }
  group.add(boxAt([0.44, 0.12, 0.3], [0, 1.3, -0.75], bone, [-0.2, 0, 0]))
  for (const side of [1, -1]) {
    group.add(boxAt([0.08, 0.22, 0.08], [side * 0.2, 1.2, -0.7], bone))
  }

  // The legs, as [y, z] joints: shoulder or hip, knee or stifle (and the
  // hock behind), the fetlock, the hoof. A bone between each pair, a knob
  // at each joint below the top, and the hoof burning. Each leg swings
  // from its top joint; only the near forehoof (+X) stamps.
  const legFlames: Flames[] = []
  const leg = (x: number, joints: [number, number][]) => {
    const [topY, topZ] = joints[0]
    const { pivot, body } = hinge(group, 'horse-leg', [x, topY, topZ])
    for (let i = 0; i < joints.length - 1; i++) {
      const a: Vec3 = [x, ...joints[i]]
      const b: Vec3 = [x, ...joints[i + 1]]
      body.add(boneBetween(a, b, i === 0 ? 0.045 : 0.03, bone))
      if (i > 0) body.add(knob(a, 0.045, bone))
    }
    const [, footZ] = joints[joints.length - 1]
    const hoof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.07, 0.08, 6),
      hoofMat
    )
    hoof.position.set(x, 0.04, footZ + 0.02)
    body.add(hoof)
    const fire = buildFlames(
      [{ at: [x, 0.06, footZ + 0.02], size: 0.22 }],
      0x40f + legFlames.length
    )
    body.add(fire.group)
    legFlames.push(fire)
    return { pivot, fire }
  }
  const legs = [1, -1].flatMap((side) => {
    const x = side * 0.17
    return [
      leg(x, [
        [1.18, 0.44],
        [0.7, 0.42],
        [0.2, 0.42],
        [0.08, 0.47],
      ]),
      leg(x, [
        [1.25, -0.72],
        [0.92, -0.6],
        [0.52, -0.82],
        [0.2, -0.8],
        [0.08, -0.75],
      ]),
    ]
  })
  const stamper = legs[0]

  // The neck, rising forward from the withers to the poll, the skull hung
  // nose-down off the end of it, and the mane burning up its length. It
  // nods and looks about from the withers.
  const neck = hinge(group, 'horse-neck', HORSE_NECK_BASE)
  const mane: FlameSpot[] = []
  const steps = 5
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps
    const y = HORSE_NECK_BASE[1] + (HORSE_POLL[1] - HORSE_NECK_BASE[1]) * t
    const z = HORSE_NECK_BASE[2] + (HORSE_POLL[2] - HORSE_NECK_BASE[2]) * t
    neck.body.add(boxAt([0.09, 0.08, 0.11], [0, y, z], bone, [-0.9, 0, 0]))
    mane.push({ at: [0, y + 0.05, z - 0.04], size: 0.32 - t * 0.08 })
  }
  const maneFire = buildFlames(mane, 0x3a7e)
  neck.body.add(maneFire.group)
  const skull = horseSkull(bone, socket)
  skull.position.set(...HORSE_POLL)
  skull.rotation.x = 0.6
  neck.body.add(skull)

  // The tail, a string of small bones curling down off the croup, burning
  // at the end. It swishes from the croup.
  const tail = hinge(group, 'horse-tail', HORSE_CROUP)
  let tip: Vec3 = HORSE_CROUP
  for (let i = 0; i < 6; i++) {
    const next: Vec3 = [0, tip[1] - 0.09, tip[2] - 0.05 + i * 0.012]
    tail.body.add(boneBetween(tip, next, 0.022, bone))
    tip = next
  }
  const tailFire = buildFlames([{ at: tip, size: 0.3 }], 0x7a11)
  tail.body.add(tailFire.group)

  // The saddle on a blanket over the ribs, with its pommel and cantle,
  // and the stirrups on their leathers.
  const seatY = HORSE_SADDLE_TOP - 0.04
  group.add(
    boxAt([0.62, 0.03, 0.72], [0, horseSpineY(0) + 0.05, 0.02], blanket)
  )
  group.add(boxAt([0.46, 0.08, 0.56], [0, seatY, 0.02], leather))
  group.add(boxAt([0.16, 0.14, 0.07], [0, seatY + 0.08, 0.29], leather))
  group.add(boxAt([0.34, 0.12, 0.06], [0, seatY + 0.07, -0.25], leather))
  for (const side of [1, -1]) {
    group.add(
      boxAt([0.02, 0.6, 0.07], [side * 0.27, seatY - 0.32, 0.06], strap)
    )
    group.add(boxAt([0.1, 0.03, 0.12], [side * 0.29, seatY - 0.63, 0.08], iron))
  }

  // The saddlebags, slung over the loin behind the cantle: a strap across
  // the spine, and a bag down each side with a flap over its top and two
  // buckled straps down its outer face.
  const bagZ = -0.5
  const bagTop = horseSpineY(bagZ) + 0.04
  group.add(boxAt([0.62, 0.025, 0.24], [0, bagTop, bagZ], leather))
  for (const side of [1, -1]) {
    const x = side * 0.34
    group.add(boxAt([0.14, 0.34, 0.34], [x, bagTop - 0.19, bagZ], bag))
    group.add(boxAt([0.155, 0.13, 0.35], [x, bagTop - 0.07, bagZ], leather))
    for (const dz of [-0.09, 0.09]) {
      const face = x + side * 0.074
      group.add(
        boxAt([0.012, 0.26, 0.03], [face, bagTop - 0.2, bagZ + dz], strap)
      )
      group.add(
        boxAt(
          [0.014, 0.03, 0.036],
          [face + side * 0.004, bagTop - 0.15, bagZ + dz],
          iron
        )
      )
    }
  }

  // Some 150 bones and fittings, a few draws per moving part.
  mergeStatic(group)
  castShadows(group)

  const I = HORSE_IDLE
  const update = (t: number) => {
    const breath =
      1 + I.breathDepth * Math.sin((t / I.breathSeconds) * Math.PI * 2)
    ribs.pivot.scale.set(breath, breath, 1)
    // The head sinks a little, comes up, and turns to look about.
    const nod = I.nod * (0.5 + 0.5 * Math.sin((t / I.nodSeconds) * Math.PI * 2))
    neck.pivot.rotation.set(
      nod,
      I.look * Math.sin((t / I.lookSeconds) * Math.PI * 2),
      0
    )
    maneFire.counter(nod, 0)
    maneFire.update(t)
    // A bout of swishing, then the tail hangs still a while.
    const bout = pulse(t, I.swishBoutSeconds, I.swishSeconds * 2)
    const swish = I.swish * bout * Math.sin((t / I.swishSeconds) * Math.PI * 2)
    tail.pivot.rotation.z = swish
    tailFire.counter(0, swish)
    tailFire.update(t)
    // The near forehoof comes up, forward, and down.
    const stamp = -I.stampLift * pulse(t, I.stampSeconds, I.stampLength)
    stamper.pivot.rotation.x = stamp
    stamper.fire.counter(stamp, 0)
    for (const fire of legFlames) fire.update(t)
  }
  update(0)
  setMotion(group, update)
  return { group, update }
}

// A handful of berries, as the inventory shows them: five in a loose pile.
// Origin at ground level under the middle.
function buildBerries({ glow = true }: PickupOptions = {}): THREE.Group {
  const group = new THREE.Group()
  group.name = 'berries'
  const material = berryMaterial()
  const geo = new THREE.SphereGeometry(0.06, 5, 4)
  const pile: Vec3[] = [
    [0, 0.06, 0],
    [0.1, 0.06, 0.04],
    [-0.08, 0.06, 0.07],
    [0.02, 0.06, -0.1],
    [0.01, 0.16, 0.01],
  ]
  for (const [x, y, z] of pile) {
    const mesh = new THREE.Mesh(geo, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
  }
  if (glow) {
    const halo = makeGlowSprite(makeGlowTexture('rgba(176, 64, 122, 0.5)'), 0.8)
    halo.position.y = 0.1
    group.add(halo)
  }
  setPulseMaterials(group, [material])
  return group
}

// --- Dimes ---------------------------------------------------------------

// The dimes a shadowman bursts into (drops.ts DIMES), `count` of them
// scattered flat and tipped over a patch about a metre across, the seed
// laying them out. A dime is 18 mm; these are drawn three times that, or
// the PS1 downscale would lose them in the grass. Origin at ground level
// under the middle of the scatter.
export function buildDimes(
  count: number,
  seed = 0xd1e,
  { glow = true }: PickupOptions = {}
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'dimes'
  const material = lambert({
    color: '#8a8f96',
    emissive: new THREE.Color('#dfe6ee'),
    emissiveIntensity: 0.35,
  })
  const geo = new THREE.CylinderGeometry(0.027, 0.027, 0.004, 10)
  const rng = mulberry32(seed)
  for (let i = 0; i < Math.max(1, Math.min(count, 20)); i++) {
    const coin = new THREE.Mesh(geo, material)
    // Thicker toward the middle, as a spray lands.
    const r = Math.sqrt(rng()) * 0.45
    const a = rng() * Math.PI * 2
    coin.position.set(Math.cos(a) * r, 0.004 + rng() * 0.01, Math.sin(a) * r)
    coin.rotation.set(range(rng, -0.35, 0.35), 0, range(rng, -0.35, 0.35))
    group.add(coin)
  }
  if (glow) {
    const halo = makeGlowSprite(
      makeGlowTexture('rgba(214, 226, 238, 0.45)'),
      1.1
    )
    halo.position.y = 0.08
    group.add(halo)
  }
  setPulseMaterials(group, [material])
  return group
}

// --- Gold bullion --------------------------------------------------------

// One troy ounce of gold: a small minted bar (about 50 x 29 x 2 mm, so it
// can be seen at all it is drawn half again as big), lying flat with a
// raised stamp on its face. Origin at the bottom of the bar.
function buildGoldBullion({ glow = true }: PickupOptions = {}): THREE.Group {
  const group = new THREE.Group()
  group.name = 'gold-bullion'
  const gold = lambert({
    color: '#8a6514',
    emissive: new THREE.Color('#f2b632'),
    emissiveIntensity: 0.45,
  })
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.006, 0.045), gold)
  bar.position.y = 0.003
  group.add(bar)
  const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.026), gold)
  stamp.position.y = 0.007
  group.add(stamp)
  if (glow) {
    const halo = makeGlowSprite(makeGlowTexture('rgba(255, 196, 64, 0.5)'), 0.6)
    halo.position.y = 0.02
    group.add(halo)
  }
  setPulseMaterials(group, [gold])
  return group
}

// --- The Flaming Halo -----------------------------------------------------

// A cosmetic Moab Coldë trades for gold (cosmetics.ts): a ring of gold
// floating level over the head, burning all the way round with Moab's own
// fire. Origin at the middle of the ring. update(t) moves the fire and
// turns the ring slowly; dispose() frees what this halo alone owns (the
// ring's geometry and material are shared by every halo).
export interface FlamingHalo {
  group: THREE.Group
  update: (t: number) => void
  dispose: () => void
}

const HALO = { radius: 0.15, tube: 0.012, tongues: 9, flame: 0.085 }

let haloRing: {
  geometry: THREE.TorusGeometry
  material: THREE.Material
} | null = null

export function buildFlamingHalo(): FlamingHalo {
  haloRing ??= {
    geometry: new THREE.TorusGeometry(HALO.radius, HALO.tube, 4, 18),
    material: lambert({
      color: '#a07818',
      emissive: new THREE.Color('#ffc23a'),
      emissiveIntensity: 0.8,
    }),
  }
  const group = new THREE.Group()
  group.name = 'flaming-halo'
  const ring = new THREE.Mesh(haloRing.geometry, haloRing.material)
  ring.rotation.x = Math.PI / 2
  group.add(ring)
  const spots: FlameSpot[] = Array.from({ length: HALO.tongues }, (_, i) => {
    const a = (i / HALO.tongues) * Math.PI * 2
    // Every other tongue a little shorter, so the crown is never even.
    const size = HALO.flame * (i % 2 === 0 ? 1 : 0.7)
    return {
      at: [Math.cos(a) * HALO.radius, 0, Math.sin(a) * HALO.radius],
      size,
    }
  })
  const flames = buildFlames(spots, 0x4a10)
  group.add(flames.group)
  const update = (t: number) => {
    group.rotation.y = t * 0.4
    flames.update(t)
  }
  update(0)
  const dispose = () => {
    flames.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose()
      else if (o instanceof THREE.Points) {
        const points = o as THREE.Points<THREE.BufferGeometry, THREE.Material>
        points.geometry.dispose()
        points.material.dispose()
      } else if (o instanceof THREE.Sprite) o.material.dispose()
    })
  }
  return { group, update, dispose }
}

// --- Baseball bat --------------------------------------------------------

// A 33-inch ash bat, turned on a lathe: knob, thin handle, a long taper,
// and the barrel, cupped a little at the end. Local space: the grip (where
// a hand closes, just above the knob) at the origin, the bat hanging down
// -Y to the barrel end.
// [radius, y] from the barrel end up to the knob: LatheGeometry faces
// outward for a profile that rises.
const BAT_PROFILE: [number, number][] = [
  [0, -0.765],
  [0.03, -0.77],
  [0.033, -0.74],
  [0.032, -0.62],
  [0.022, -0.45],
  [0.012, -0.22],
  [0.012, 0.03],
  [0.02, 0.04],
  [0.02, 0.055],
  [0, 0.06],
]

export function buildBat(): THREE.Group {
  const ash = lambert({ color: '#c9a46a' })
  const tape = lambert({ color: '#141416' })
  const profile = BAT_PROFILE.map(([r, y]) => new THREE.Vector2(r, y))
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 8), ash)
  // Grip tape over the handle, a hair proud of the wood.
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0135, 0.0135, 0.2, 8),
    tape
  )
  grip.position.y = -0.07
  const group = new THREE.Group()
  group.name = 'bat'
  group.add(body, grip)
  return group
}

// --- Flashlight ----------------------------------------------------------

// A two-D-cell flashlight in dull yellow plastic, the kind kept in a kitchen
// drawer: a ribbed barrel, a black head flared round the lens, a black
// slide switch on top. Local space: the barrel along +Z, the lens at the
// +Z end, the origin in the middle of the grip. setOn lights the lens.
// beam: a fake cone of light this many metres long out of the lens, for a
// flashlight seen from outside (peers); the player's own throws a real
// spot instead (fphands.ts).
export interface Flashlight {
  group: THREE.Group
  // The middle of the lens, in the group's space.
  lens: THREE.Vector3
  setOn(on: boolean): void
}

const FLASHLIGHT = {
  barrel: { radius: 0.019, length: 0.17 },
  head: { radius: 0.03, length: 0.06 },
}

const LENS_OFF = '#3a3b36'
const LENS_ON = '#fff4d6'
let lensGlow: THREE.Texture | null = null

export function buildFlashlight({ beam = 0 } = {}): Flashlight {
  const { barrel, head } = FLASHLIGHT
  const plastic = lambert({ color: '#c9a227' })
  const black = lambert({ color: '#18181a' })
  const group = new THREE.Group()
  group.name = 'flashlight'

  // A cylinder along +Z, centred at z.
  const along = (
    top: number,
    bottom: number,
    length: number,
    z: number,
    material: THREE.Material
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(top, bottom, length, 8),
      material
    )
    mesh.rotation.x = Math.PI / 2
    mesh.position.z = z
    group.add(mesh)
    return mesh
  }
  along(barrel.radius, barrel.radius, barrel.length, 0, plastic)
  // Three grip ribs, a hair proud of the barrel.
  const rib = barrel.radius + 0.002
  for (const z of [-0.05, -0.025, 0]) along(rib, rib, 0.008, z, black)
  // The end cap, and the head flaring out to the lens. A cylinder's top
  // turns to +Z, toward the lens.
  along(barrel.radius, barrel.radius * 0.9, 0.012, -barrel.length / 2, black)
  along(
    head.radius,
    barrel.radius,
    head.length,
    barrel.length / 2 + head.length / 2,
    black
  )
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.03), black)
  slide.position.set(0, barrel.radius + 0.003, 0.04)
  group.add(slide)

  const lensZ = barrel.length / 2 + head.length + 0.001
  const lensMaterial = new THREE.MeshBasicMaterial({ color: LENS_OFF })
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(head.radius * 0.85, 8),
    lensMaterial
  )
  lens.position.z = lensZ
  group.add(lens)
  castShadows(group)

  lensGlow ??= makeGlowTexture('rgba(255, 240, 200, 0.85)')
  const glow = makeGlowSprite(lensGlow, 0.1)
  glow.position.z = lensZ + 0.01
  glow.visible = false
  group.add(glow)

  // The cone fades from the lens to nothing at its far end; additive, so
  // black is no light at all.
  let cone: THREE.Mesh | null = null
  if (beam > 0) {
    const geometry = new THREE.ConeGeometry(
      Math.tan(CONFIG.flashlight.halfAngle) * beam,
      beam,
      12,
      1,
      true
    )
    // Brightest at the apex (+Y, before it turns), none at the open end.
    const pos = geometry.attributes.position
    const colors: number[] = []
    const warm = new THREE.Color(CONFIG.flashlight.color)
    for (let i = 0; i < pos.count; i++) {
      const fade = (pos.getY(i) / beam + 0.5) * 0.05
      colors.push(warm.r * fade, warm.g * fade, warm.b * fade)
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    // The apex to the lens, the open end out along +Z.
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, 0, beam / 2)
    cone = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    )
    cone.name = 'beam'
    cone.position.z = lensZ
    cone.visible = false
    group.add(cone)
  }

  return {
    group,
    lens: new THREE.Vector3(0, 0, lensZ),
    setOn(on: boolean) {
      lensMaterial.color.set(on ? LENS_ON : LENS_OFF)
      glow.visible = on
      if (cone) cone.visible = on
    },
  }
}

// --- The Caretaker -------------------------------------------------------

// The shade that keeps the corn maze (caretaker.ts): a tall hooded shroud
// with no feet, its hem torn into rags that never touch the ground, two
// pale pinpoints under the hood, arms too long hanging at its sides, and a
// lantern of cold light swinging from its right hand, so it shows down a
// corridor before it turns the corner. A dark smudge of air hangs round
// it. update(t) bobs it, sways it, swings the lantern and flickers the
// eyes; setBurn(0..1) pales it as two beams unmake it. Origin on the
// ground under it; it floats CONFIG.caretaker.hover over that.
export interface CaretakerRig {
  group: THREE.Group
  update(t: number): void
  setBurn(burn: number): void
}

const CARETAKER_BODY = new THREE.Color('#050508')
const CARETAKER_PALE = new THREE.Color('#5d6070')

export function buildCaretaker(seed = 0xca2e): CaretakerRig {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'caretaker'
  const body = new THREE.Group()
  body.position.y = CONFIG.caretaker.hover
  group.add(body)
  const shroud = applyPS1(
    new THREE.MeshBasicMaterial({
      color: CARETAKER_BODY,
      side: THREE.DoubleSide,
    })
  )

  // The shroud, turned on a lathe from the shoulders down to the hem, wider
  // as it falls; then the hem's ring torn ragged, every other vertex pulled
  // up or down.
  const profile = [
    new THREE.Vector2(0.06, 2.55),
    new THREE.Vector2(0.3, 2.3),
    new THREE.Vector2(0.38, 2.1),
    new THREE.Vector2(0.42, 1.6),
    new THREE.Vector2(0.5, 1.0),
    new THREE.Vector2(0.62, 0.35),
    new THREE.Vector2(0.7, 0),
  ]
  const segments = 12
  const robe = new THREE.LatheGeometry(profile, segments)
  const position = robe.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0.01) continue
    position.setY(i, i % 2 ? range(rng, -0.45, -0.1) : range(rng, 0, 0.25))
  }
  robe.computeVertexNormals()
  body.add(new THREE.Mesh(robe, shroud))

  // The hood: a cone forward over the head, and the void under it.
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 7), shroud)
  hood.position.set(0, 2.7, -0.03)
  hood.rotation.x = -0.25
  body.add(hood)
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 8),
    applyPS1(new THREE.MeshBasicMaterial({ color: '#000000' }))
  )
  face.position.set(0, 2.5, 0.2)
  body.add(face)
  const eyeMaterial = applyPS1(
    new THREE.MeshBasicMaterial({ color: '#e8f4ec', fog: false })
  )
  const eyes = new THREE.Group()
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 4, 3),
      eyeMaterial
    )
    eye.position.set(side * 0.06, 2.52, 0.24)
    eyes.add(eye)
  }
  body.add(eyes)

  // Arms too long, hanging a little out from the shroud, bony fingers past
  // the hem's highest rag.
  const hands: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const arm = new THREE.Group()
    arm.position.set(side * 0.36, 2.2, 0.02)
    arm.rotation.z = side * 0.1
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.11, 1.35, 5),
      shroud
    )
    sleeve.position.y = -0.68
    arm.add(sleeve)
    const hand = new THREE.Group()
    hand.position.y = -1.38
    for (let f = 0; f < 3; f++) {
      const finger = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.016, 0.28, 3),
        shroud
      )
      finger.position.set((f - 1) * 0.03, -0.14, 0)
      finger.rotation.x = (f - 1) * 0.15
      hand.add(finger)
    }
    arm.add(hand)
    body.add(arm)
    hands.push(hand)
  }

  // The lantern, from the right hand on a short bail: a dark frame round a
  // cold flame, and the glow it throws.
  const lantern = new THREE.Group()
  lantern.position.y = -0.2
  hands[1].add(lantern)
  const frame = lambert({ color: '#1d1f22' })
  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.22, 6, 1, true),
    frame
  )
  cage.position.y = -0.2
  lantern.add(cage)
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 6), frame)
  cap.position.y = -0.05
  lantern.add(cap)
  const flameMaterial = applyPS1(
    new THREE.MeshBasicMaterial({ color: '#9ff0c8', fog: false })
  )
  const flame = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.05, 0),
    flameMaterial
  )
  flame.position.y = -0.2
  lantern.add(flame)
  const lanternGlow = makeGlowSprite(
    makeGlowTexture('rgba(159, 240, 200, 0.6)'),
    1.6
  )
  lanternGlow.position.y = -0.2
  lantern.add(lanternGlow)

  // The smudge of dark air round it, drawn over what stands behind.
  const smudge = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(4, 4, 8, 0.75)'),
      depthWrite: false,
      transparent: true,
    })
  )
  smudge.scale.set(2.6, 3.6, 1)
  smudge.position.y = 1.4
  body.add(smudge)

  const update = (t: number) => {
    body.position.y = CONFIG.caretaker.hover + Math.sin(t * 1.3) * 0.12
    body.rotation.z = Math.sin(t * 0.7) * 0.04
    lantern.rotation.x = Math.sin(t * 1.9) * 0.35
    lantern.rotation.z = Math.sin(t * 1.3 + 1) * 0.15
    // The eyes go out now and then, for a blink's length.
    eyes.visible = Math.sin(t * 0.9) * Math.sin(t * 2.3) < 0.92
    const breath = 0.8 + 0.2 * Math.sin(t * 5.1) * Math.sin(t * 1.7)
    flameMaterial.color.setRGB(0.62 * breath, 0.94 * breath, 0.78 * breath)
    lanternGlow.material.opacity = 0.7 + 0.3 * breath
  }
  update(0)
  setMotion(group, update)
  return {
    group,
    update,
    setBurn(burn) {
      shroud.color.lerpColors(CARETAKER_BODY, CARETAKER_PALE, burn)
    },
  }
}

// --- Shadow burst --------------------------------------------------------

// A shadowman caught in the flashlight: a black cloud thrown out from his
// chest, and skulls flung up out of it, spinning, that fall back and fade.
// draw(age) poses the burst age seconds after it went off, from its seed
// alone, so the pool in shadowburst.ts and the Akashic both just pick an
// age. Local space: the chest at the origin.
export interface ShadowBurst {
  group: THREE.Group
  start(seed: number): void
  draw(age: number): void
}

export const SHADOW_BURST = {
  seconds: 1.8,
  mist: 36,
  skulls: 5,
  gravity: 9,
}

let burstMist: THREE.Texture | null = null
let burstSkull: THREE.Texture | null = null

function makeSkullTexture(): THREE.Texture {
  const art = canvas([32, 32])
  skull(art.ctx, 16, 12, 9)
  const texture = artTexture(art)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  return texture
}

interface Flung {
  velocity: THREE.Vector3
  spin: number
  size: number
}

export function buildShadowBurst(): ShadowBurst {
  const { mist, skulls } = SHADOW_BURST
  const group = new THREE.Group()
  group.name = 'shadow-burst'

  burstMist ??= makeGlowTexture('rgba(6, 6, 10, 0.95)')
  const cloudMaterial = new THREE.PointsMaterial({
    map: burstMist,
    color: '#000000',
    size: 1.4,
    transparent: true,
    depthWrite: false,
  })
  const positions = new Float32Array(mist * 3)
  const cloudGeometry = new THREE.BufferGeometry()
  cloudGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3)
  )
  const cloud = new THREE.Points(cloudGeometry, cloudMaterial)
  cloud.frustumCulled = false
  group.add(cloud)

  burstSkull ??= makeSkullTexture()
  const sprites: THREE.Sprite[] = []
  for (let i = 0; i < skulls; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: burstSkull, transparent: true })
    )
    group.add(sprite)
    sprites.push(sprite)
  }

  let puffs: THREE.Vector3[] = []
  let flung: Flung[] = []
  const start = (seed: number) => {
    const rng = mulberry32(seed)
    // A direction on the upper half of the sphere, mostly sideways.
    const out = () => {
      const a = rng() * Math.PI * 2
      const up = range(rng, -0.2, 0.7)
      const flat = Math.sqrt(1 - up * up)
      return new THREE.Vector3(Math.cos(a) * flat, up, Math.sin(a) * flat)
    }
    puffs = Array.from({ length: mist }, () =>
      out().multiplyScalar(range(rng, 1.2, 3.4))
    )
    flung = Array.from({ length: skulls }, () => {
      const velocity = out().multiplyScalar(range(rng, 1.5, 3.5))
      velocity.y = range(rng, 3.5, 6)
      return { velocity, spin: range(rng, -9, 9), size: range(rng, 0.6, 0.85) }
    })
  }

  const draw = (age: number) => {
    const t = Math.max(0, age)
    const life = Math.min(1, t / SHADOW_BURST.seconds)
    group.visible = t < SHADOW_BURST.seconds
    // The cloud: out fast, slowing, rising a little, and thinning.
    const spread = 1 - Math.exp(-t * 3.5)
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i]
      positions[i * 3] = p.x * spread
      positions[i * 3 + 1] = p.y * spread + t * 0.4
      positions[i * 3 + 2] = p.z * spread
    }
    cloudGeometry.attributes.position.needsUpdate = true
    cloudMaterial.size = 1.1 + spread * 1.4
    cloudMaterial.opacity = 0.9 * (1 - life) ** 1.5
    // The skulls: thrown, falling, spinning, gone over the last third.
    const g = SHADOW_BURST.gravity
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i]
      const f = flung[i]
      sprite.position.set(
        f.velocity.x * t,
        f.velocity.y * t - 0.5 * g * t * t,
        f.velocity.z * t
      )
      sprite.scale.setScalar(f.size * Math.min(1, t * 8))
      sprite.material.rotation = f.spin * t
      sprite.material.opacity = Math.min(1, 3 * (1 - life))
    }
  }

  start(0x5c011)
  draw(SHADOW_BURST.seconds)
  return { group, start, draw }
}

// --- Paperback -----------------------------------------------------------

// An open mass-market paperback, held for reading: two covers hinged at
// the spine, each with its half of the page block on the inside, the
// covers folded a little back so the pages lie open in a shallow V.
// Local space: the spine up +Y, the origin at its middle, the pages
// facing +Z (toward the reader). A cover is 11 by 18 cm; the page block
// is 2 cm in all.
const BOOK_COVER: [number, number, number] = [0.11, 0.178, 0.004]
const BOOK_PAGES: [number, number, number] = [0.104, 0.17, 0.01]
const BOOK_OPEN = 0.5
export function buildBook(): THREE.Group {
  const cover = lambert({ color: '#5a1f1a' })
  const pages = lambert({ color: '#e7dcc3' })
  const group = new THREE.Group()
  group.name = 'book'
  for (const side of [1, -1]) {
    // Each half hinges at the spine and swings back by BOOK_OPEN.
    const hinge = new THREE.Group()
    hinge.rotation.y = -side * BOOK_OPEN
    const back = new THREE.Mesh(new THREE.BoxGeometry(...BOOK_COVER), cover)
    back.position.set((side * BOOK_COVER[0]) / 2, 0, -BOOK_COVER[2] / 2)
    const block = new THREE.Mesh(new THREE.BoxGeometry(...BOOK_PAGES), pages)
    block.position.set((side * BOOK_PAGES[0]) / 2, 0, BOOK_PAGES[2] / 2)
    hinge.add(back, block)
    group.add(hinge)
  }
  return group
}

// --- Moab's scroll -------------------------------------------------------

// A burning scroll, unrolled and held out by its top rod for whoever walks
// up to read: old parchment covered in close black script round a sigil,
// a dark rod at the top and a rolled stump at the bottom, the bottom edge
// charred ragged and on fire. Local space: the middle of the top rod at
// the origin, the sheet hanging down -Y, its face toward +Z. update(t)
// moves the fire; call it every frame with a running time, or once with a
// fixed time to hold it still.
export interface Scroll {
  group: THREE.Group
  update(t: number): void
}

const SCROLL = { width: 0.34, height: 0.5, rod: 0.016 }

// The sheet: yellowed parchment browning to char at the bottom, lines of
// script (strokes, not words) round a ringed sigil, the charred edge torn
// into points.
function paintScroll(): CanvasArt {
  const art = canvas([68, 100], '#d9c79c')
  const { ctx, w, h } = art
  const rng = mulberry32(0x5c7011)
  const burn = ctx.createLinearGradient(0, h * 0.55, 0, h)
  burn.addColorStop(0, 'rgba(90, 50, 20, 0)')
  burn.addColorStop(1, 'rgba(40, 18, 6, 0.9)')
  ctx.fillStyle = burn
  ctx.fillRect(0, 0, w, h)
  // The sigil: a ring, a triangle in it, and a dot.
  ctx.strokeStyle = '#5a0e0a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(w / 2, 30, 13, 0, Math.PI * 2)
  ctx.moveTo(w / 2, 19)
  ctx.lineTo(w / 2 + 10, 36)
  ctx.lineTo(w / 2 - 10, 36)
  ctx.closePath()
  ctx.stroke()
  ctx.fillStyle = '#5a0e0a'
  ctx.fillRect(w / 2 - 1, 29, 2, 2)
  // Lines of script: runs of short dark strokes.
  ctx.fillStyle = '#1e140e'
  for (let y = 50; y < h - 14; y += 5) {
    let x = 6
    while (x < w - 6) {
      const run = 3 + Math.floor(rng() * 7)
      ctx.fillRect(x, y, Math.min(run, w - 6 - x), 1.5)
      x += run + 2
    }
  }
  // The charred bottom edge, torn into points.
  ctx.fillStyle = '#120804'
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= w; x += 5) {
    ctx.lineTo(x + 2.5, h - 3 - rng() * 9)
    ctx.lineTo(x + 5, h)
  }
  ctx.closePath()
  ctx.fill()
  return art
}

export function buildScroll(): Scroll {
  const { width, height, rod } = SCROLL
  const group = new THREE.Group()
  group.name = 'scroll'
  const wood = lambert({ color: '#2a1a12' })
  // The sheet takes the art on both faces and stays readable in the dark:
  // a little glow off the fire that eats it.
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    lambert({
      map: artTexture(paintScroll()),
      emissive: new THREE.Color('#3a2410'),
      side: THREE.DoubleSide,
    })
  )
  sheet.position.y = -height / 2
  group.add(sheet)
  // The top rod with its knobs, and the rolled stump of what is left at
  // the bottom.
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(rod, rod, width + 0.08, 6),
    wood
  )
  bar.rotation.z = Math.PI / 2
  group.add(bar)
  for (const side of [1, -1]) {
    const knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 0), wood)
    knob.position.x = side * (width / 2 + 0.05)
    group.add(knob)
  }
  const roll = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, width * 0.9, 6),
    lambert({ color: '#6b4a26' })
  )
  roll.rotation.z = Math.PI / 2
  roll.position.set(0, -height * 0.97, 0.015)
  group.add(roll)
  // The fire along the charred bottom edge, and up one side.
  const fire = buildFlames(
    [
      { at: [-0.12, -height - 0.01, 0.02], size: 0.12 },
      { at: [-0.03, -height - 0.02, 0.02], size: 0.16 },
      { at: [0.07, -height - 0.01, 0.02], size: 0.13 },
      { at: [0.15, -height + 0.04, 0.02], size: 0.1 },
      { at: [0.165, -height * 0.6, 0.01], size: 0.07 },
    ],
    0x5c7
  )
  group.add(fire.group)
  mergeStatic(group)
  castShadows(group)
  const update = (t: number) => fire.update(t)
  setMotion(group, update)
  return { group, update }
}

// --- Moab's scythe -------------------------------------------------------

// A war scythe taller than he is: a long black snath bound with straps, an
// iron collar at the head, and a hooked blade, notched along its inner
// edge, with a spike off the back. Local space: the foot of the snath on
// the ground at the origin, the snath up +Y, the blade reaching out along
// +X, its flat facing ±Z.
const SCYTHE_LENGTH = 2.5

// The blade, as a flat outline in its own plane: from the collar out along
// the back edge to the hooked point, and in along the cutting edge with
// its notches.
function scytheBladeShape(): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.1)
  shape.quadraticCurveTo(0.62, 0.32, 1.2, -0.38)
  shape.quadraticCurveTo(1.0, -0.06, 0.8, 0.0)
  // The notches: saw teeth back toward the collar.
  for (const x of [0.64, 0.48, 0.32, 0.16]) {
    shape.lineTo(x + 0.06, 0.03)
    shape.lineTo(x, -0.04)
  }
  shape.lineTo(0, -0.08)
  shape.closePath()
  return shape
}

export function buildScythe(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'scythe'
  const wood = lambert({ color: '#1c1512' })
  const strap = lambert({ color: '#0a0a0b' })
  const iron = lambert({ color: '#4a4c50' })
  const steel = lambert({
    color: '#b4b9c0',
    emissive: new THREE.Color('#3a3c42'),
  })
  const snath = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.028, SCYTHE_LENGTH, 6),
    wood
  )
  snath.position.y = SCYTHE_LENGTH / 2
  group.add(snath)
  // The two grips, and straps wound round the snath between them.
  for (const y of [1.05, 1.6]) {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), wood)
    grip.position.set(0, y, 0.07)
    group.add(grip)
  }
  for (const y of [0.4, 0.75, 1.3, 1.95, 2.2]) {
    const wrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.031, 0.031, 0.03, 6),
      strap
    )
    wrap.position.y = y
    group.add(wrap)
  }
  // The collar at the head, the blade off it, and the spike off the back.
  const top = SCYTHE_LENGTH - 0.06
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.12, 6),
    iron
  )
  collar.position.y = top
  group.add(collar)
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(scytheBladeShape(), {
      depth: 0.012,
      bevelEnabled: false,
    }),
    steel
  )
  blade.position.set(0.02, top, -0.006)
  group.add(blade)
  const spike = new THREE.Shape()
  spike.moveTo(0, 0.04)
  spike.lineTo(-0.26, 0.0)
  spike.lineTo(0, -0.04)
  spike.closePath()
  const back = new THREE.Mesh(
    new THREE.ExtrudeGeometry(spike, { depth: 0.012, bevelEnabled: false }),
    steel
  )
  back.position.set(-0.02, top, -0.006)
  group.add(back)
  mergeStatic(group)
  castShadows(group)
  return group
}

// --- Guitar --------------------------------------------------------------

// An LTD EX-400: an Explorer body, about a metre long, in the finish
// passed in (black by default; finishes.ts has the table) with black
// hardware. The outline is measured from the catalogue photo: the body's
// silhouette thresholded and read column by column, then turned onto the
// neck axis. Local space: the neck up +Y, the strings facing +Z, the
// origin on the string line below the tailpiece. The outline runs
// anticlockwise from the neck joint: down the bass edge, closing in on the
// pickups, out along the long diagonal to the horn tip at the bottom, back
// along the horn's underside to the rear corner, in to the waist beside
// the bridge, out again along the wing to its tip above the neck joint,
// and into the notch at the heel.
const GUITAR_OUTLINE: [number, number][] = [
  [0.025, 0.3],
  [-0.085, 0.252],
  [-0.067, 0.131],
  [-0.209, -0.155],
  [-0.001, -0.071],
  [0.154, -0.015],
  [0.093, 0.124],
  [0.17, 0.359],
  [0.048, 0.269],
]
// The pointed headstock, in its own space: the nut at y = 0, the tip up +Y
// and over to the treble side, the six tuners down the long bass diagonal.
const GUITAR_HEAD_OUTLINE: [number, number][] = [
  [0.025, 0],
  [0.045, 0.128],
  [0.035, 0.17],
  [-0.044, 0.046],
  [-0.025, 0],
]
const GUITAR_DEPTH = 0.045
// The nut, where the headstock leaves the neck, and the headstock's tilt
// back from the neck.
const GUITAR_NUT_Y = 0.68
const GUITAR_HEAD_TILT = -0.25
// The dot inlays, between the frets of a 24.75" scale: 3, 5, 7, 9, 15, 17,
// 19 and 21. The 12th fret carries the model plate instead.
const GUITAR_DOTS = [0.596, 0.536, 0.484, 0.438, 0.323, 0.293, 0.267, 0.244]
const GUITAR_PLATE_Y = 0.375

function outlineGeometry(
  outline: [number, number][],
  depth: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(...outline[0])
  for (const point of outline.slice(1)) shape.lineTo(...point)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

// A built guitar: its group, and setFinish to recolor the gloss (the
// body, the neck and the headstock) in place.
export interface Guitar {
  group: THREE.Group
  setFinish(color: string): void
}

export function buildGuitar(
  finish: string = finishById(DEFAULT_FINISH).color
): Guitar {
  const gloss = lambert({ color: finish })
  const hardware = lambert({ color: '#26262b' })
  const rosewood = lambert({ color: '#2c1a10' })
  const pearl = lambert({ color: '#d9d6cc' })
  const chrome = lambert({ color: '#a2a7ad' })

  const group = new THREE.Group()
  group.name = 'guitar'
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number
  ) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
  }
  const face = GUITAR_DEPTH / 2
  add(outlineGeometry(GUITAR_OUTLINE, GUITAR_DEPTH), gloss, 0, 0, 0)
  // The set neck in the body's finish, the rosewood fretboard over it with
  // its dots and the model plate, and the pointed headstock tilted back
  // from the nut.
  add(new THREE.BoxGeometry(0.05, 0.46, 0.022), gloss, 0, 0.45, face - 0.011)
  add(new THREE.BoxGeometry(0.05, 0.44, 0.008), rosewood, 0, 0.46, face)
  for (const y of GUITAR_DOTS) {
    add(new THREE.BoxGeometry(0.01, 0.01, 0.003), pearl, 0, y, face + 0.005)
  }
  add(
    new THREE.BoxGeometry(0.022, 0.008, 0.003),
    pearl,
    0,
    GUITAR_PLATE_Y,
    face + 0.005
  )
  const head = new THREE.Group()
  head.position.set(0, GUITAR_NUT_Y, face - 0.02)
  head.rotation.x = GUITAR_HEAD_TILT
  group.add(head)
  head.add(new THREE.Mesh(outlineGeometry(GUITAR_HEAD_OUTLINE, 0.016), gloss))
  for (let i = 0; i < 6; i++) {
    // Spaced along the bass diagonal, from its corner toward the tip.
    const t = 0.1 + i * 0.15
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.011, 0.011),
      hardware
    )
    post.position.set(-0.044 + t * 0.079, 0.046 + t * 0.124, 0)
    head.add(post)
  }
  // Two blank EMG pickups, the Tune-o-matic bridge and its tailpiece, the
  // volume and tone knobs in a row below the tailpiece on the treble side,
  // and the toggle between them and the waist.
  for (const y of [0.23, 0.15]) {
    add(new THREE.BoxGeometry(0.075, 0.04, 0.012), hardware, 0, y, face + 0.006)
  }
  add(new THREE.BoxGeometry(0.08, 0.014, 0.012), hardware, 0, 0.1, face + 0.006)
  add(
    new THREE.BoxGeometry(0.07, 0.02, 0.008),
    hardware,
    0,
    0.065,
    face + 0.004
  )
  for (const y of [0.05, 0.005]) {
    add(
      new THREE.CylinderGeometry(0.012, 0.014, 0.016, 6),
      hardware,
      0.1,
      y,
      face + 0.008
    ).rotation.x = Math.PI / 2
  }
  add(
    new THREE.BoxGeometry(0.008, 0.03, 0.008),
    hardware,
    0.074,
    0.091,
    face + 0.006
  )
  // The strings, as one pale strip from the tailpiece to the nut.
  add(
    new THREE.BoxGeometry(0.03, 0.615, 0.003),
    chrome,
    0,
    0.3725,
    face + 0.005
  )
  return {
    group,
    setFinish: (color) => {
      gloss.color.set(color)
    },
  }
}

// The guitar standing on its horn, for Akashic.
function sampleGuitar(): THREE.Group {
  const guitar = buildGuitar().group
  guitar.position.y = -Math.min(...GUITAR_OUTLINE.map(([, y]) => y))
  const group = new THREE.Group()
  group.add(guitar)
  return group
}

// --- Drinks --------------------------------------------------------------

// The drinks, circa 2008: cans (slim, 12 oz, tall), the NOS bottle, three
// liquor bottles, the MD 20/20 flask, the Miller High Life longneck and
// the Ice Mountain water bottle.
// Sizes come from CONTAINERS in drinks.ts; art from canart.ts. Origin at
// ground level under the middle, label front facing +Z.
// Even, so a label centered on the front shares vertices with the lathes.
const DRINK_SEGMENTS = 16
const DRINK_GLOW_SCALE = 1

// A lathe profile point: [radius, y].
type ProfilePoint = [number, number]

// The superellipse a round lathe is pushed out to (see squareUp).
interface SquareSize {
  radius: number
  depth: number
  n: number
}

interface BottleShape {
  size: SquareSize
  weight: (y: number) => number
}

// The material makers one drink's parts share, so every material it makes
// joins the pickup pulse.
// Function properties, not methods: the builders destructure them.
export interface DrinkMaterials {
  face: (canvasArt: CanvasArt | undefined) => THREE.MeshLambertMaterial
  cutout: (canvasArt: CanvasArt | undefined) => THREE.MeshLambertMaterial
  flat: (color: string | undefined) => THREE.MeshLambertMaterial
}

type DrinkPartsBuilder = (
  art: DrinkArt,
  size: Container,
  mats: DrinkMaterials
) => THREE.Object3D[]

// DrinkArt and Container fields are optional because they differ per
// container. A builder that reads one its container must have gets it here.
function need<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`Drink art or container is missing "${field}"`)
  }
  return value
}

// A label on a round surface, centered on the front (+Z). arc is how far
// it wraps, in radians; the default goes all the way around, and then the
// middle of the canvas is the front. Keep arc a multiple of PI / 4 so its
// edges land on lathe vertices.
function drinkLabel(
  material: THREE.Material,
  radius: number,
  y0: number,
  y1: number,
  arc = Math.PI * 2
): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    y1 - y0,
    Math.round((DRINK_SEGMENTS * arc) / (Math.PI * 2)),
    1,
    true,
    -arc / 2,
    arc
  )
  const label = new THREE.Mesh(geometry, material)
  label.position.y = (y0 + y1) / 2
  return label
}

// A flat label on the front face of a square or flat bottle.
function flatLabel(
  material: THREE.Material,
  width: number,
  y0: number,
  y1: number,
  z: number
): THREE.Mesh {
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(width, y1 - y0),
    material
  )
  label.position.set(0, (y0 + y1) / 2, z)
  return label
}

function latheGeometry(points: ProfilePoint[]): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    DRINK_SEGMENTS
  )
}

function lathe(points: ProfilePoint[], material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(latheGeometry(points), material)
}

// Square up a round lathe: push each vertex out to a superellipse of
// exponent n, and squash front to back to depth / radius. weight(y) goes
// from 1 (full shape) to 0 (stays round), so the neck stays a cylinder.
function squareUp(
  geometry: THREE.BufferGeometry,
  { radius, depth, n }: SquareSize,
  weight: (y: number) => number
): THREE.BufferGeometry {
  const pos = geometry.attributes.position
  const squash = depth / radius
  for (let i = 0; i < pos.count; i++) {
    const w = weight(pos.getY(i))
    if (w <= 0) continue
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const phi = Math.atan2(x, z)
    const s = Math.abs(Math.sin(phi))
    const c = Math.abs(Math.cos(phi))
    const k = 1 / Math.pow(Math.pow(s, n) + Math.pow(c, n), 1 / n)
    pos.setX(i, x * (1 + (k - 1) * w))
    pos.setZ(i, z * (1 + (k * squash - 1) * w))
  }
  geometry.computeVertexNormals()
  return geometry
}

// A lathe profile split at the fill line: the part below and the part
// above, both including the cut point.
function splitAt(
  points: ProfilePoint[],
  fillY: number
): { below: ProfilePoint[]; above: ProfilePoint[] } {
  const below: ProfilePoint[] = []
  const above: ProfilePoint[] = []
  for (let i = 0; i < points.length; i++) {
    const [r, y] = points[i]
    const next = points[i + 1]
    ;(y <= fillY ? below : above).push([r, y])
    if (next && y <= fillY && next[1] > fillY) {
      const t = (fillY - y) / (next[1] - y)
      const cut: ProfilePoint = [r + (next[0] - r) * t, fillY]
      below.push(cut)
      above.push(cut)
    }
  }
  return { below, above }
}

// glow lights the glass from within, so pale plastic stays pale at night.
function glassMaterial(
  color = '#d8e6e2',
  opacity = 0.35,
  glow = 0
): THREE.MeshLambertMaterial {
  return lambert({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: glow,
    transparent: true,
    opacity,
    depthWrite: false,
  })
}

// A cap: a short cylinder from y0 to y1.
function cap(
  material: THREE.Material,
  radius: number,
  y0: number,
  y1: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, y1 - y0, DRINK_SEGMENTS),
    material
  )
  mesh.position.y = (y0 + y1) / 2
  return mesh
}

// An aluminium can: necked at the bottom, necked in to a rim at the top,
// a lid with a tab.
function canParts(
  art: DrinkArt,
  size: Container,
  { face, flat }: DrinkMaterials
): THREE.Mesh[] {
  const { radius: R, height: H } = size
  const bottom = H * 0.05
  const top = H * 0.07
  const metal = flat(art.metal)
  const parts = [
    drinkLabel(face(art.wrap), R, bottom, H - top),
    lathe(
      [
        [0, 0.004],
        [R * 0.78, 0.0015],
        [R * 0.84, 0],
        [R * 0.96, bottom * 0.55],
        [R, bottom],
      ],
      metal
    ),
    lathe(
      [
        [R, H - top],
        [R * 0.9, H - top * 0.35],
        [R * 0.86, H - 0.0015],
        [R * 0.88, H],
        [R * 0.82, H],
        [R * 0.8, H - 0.003],
      ],
      metal
    ),
  ]
  const lid = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.8, DRINK_SEGMENTS).rotateX(-Math.PI / 2),
    flat(art.lid || art.metal)
  )
  lid.position.y = H - 0.003
  const tab = new THREE.Mesh(
    new THREE.BoxGeometry(R * 0.42, 0.0015, R * 0.6),
    flat(art.tab)
  )
  tab.position.set(0, H - 0.0022, R * 0.22)
  parts.push(lid, tab)
  return parts
}

// The NOS bottle: blue plastic on five petal feet, a domed shoulder, a
// neck ring and the orange cap.
function nosParts(
  art: DrinkArt,
  size: Container,
  { face, flat }: DrinkMaterials
): THREE.Mesh[] {
  const { radius: R, height: H } = size
  const plastic = flat(art.plastic)
  const foot = 0.024
  const body = lathe(
    [
      [0, 0.007],
      [R * 0.45, 0],
      [R * 0.85, 0.003],
      [R * 0.98, foot * 0.7],
      [R, foot],
      [R, 0.17],
      [R * 0.95, 0.18],
      [R * 0.8, 0.19],
      [R * 0.6, 0.196],
      [0.016, 0.2],
      [0.0155, 0.204],
    ],
    plastic
  )
  // Pinch the base into five petal feet.
  const pos = body.geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y >= foot) continue
    const w = 1 - y / foot
    const phi = Math.atan2(pos.getX(i), pos.getZ(i))
    const k = 1 - 0.22 * w * (0.5 - 0.5 * Math.cos(5 * phi))
    pos.setX(i, pos.getX(i) * k)
    pos.setZ(i, pos.getZ(i) * k)
  }
  body.geometry.computeVertexNormals()
  const capMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0195, 0.018, H - 0.207, DRINK_SEGMENTS),
    flat(art.cap)
  )
  capMesh.position.y = (0.207 + H) / 2
  return [
    drinkLabel(face(art.wrap), R * 1.012, 0.035, 0.135),
    body,
    cap(plastic, 0.0195, 0.204, 0.207),
    capMesh,
  ]
}

// Liquid below the fill line and clear glass above it, as two meshes.
// shape squares the glass up (see squareUp); round when left out.
function glassBottle(
  points: ProfilePoint[],
  fillY: number,
  liquidColor: string | undefined,
  { flat }: Pick<DrinkMaterials, 'flat'>,
  shape?: BottleShape
): THREE.Mesh[] {
  const { below, above } = splitAt(points, fillY)
  const meshes = [
    new THREE.Mesh(latheGeometry(below), flat(liquidColor)),
    new THREE.Mesh(latheGeometry(above), glassMaterial()),
  ]
  if (shape) {
    for (const mesh of meshes) squareUp(mesh.geometry, shape.size, shape.weight)
  }
  return meshes
}

// Wild Turkey 101: a round fifth with sloped shoulders and a long neck,
// sealed under a maroon capsule.
function bourbonParts(
  art: DrinkArt,
  size: Container,
  mats: DrinkMaterials
): THREE.Mesh[] {
  const { radius: R, height: H } = size
  const points: ProfilePoint[] = [
    [0, 0.003],
    [R * 0.92, 0],
    [R, 0.01],
    [R, 0.16],
    [R * 0.93, 0.18],
    [R * 0.7, 0.198],
    [0.02, 0.212],
    [0.0145, 0.222],
    [0.0145, 0.27],
  ]
  return [
    ...glassBottle(points, 0.226, art.liquid, mats),
    drinkLabel(mats.face(art.label), R * 1.01, 0.018, 0.155, Math.PI),
    drinkLabel(mats.face(art.neck), 0.0158, 0.236, H, Math.PI * 2),
    cap(mats.flat(art.cap), 0.0157, 0.236, H),
  ]
}

// Miller High Life: a clear 12 oz longneck, a long taper into the neck,
// gold foil on the neck and a gold crown cap.
function longneckParts(
  art: DrinkArt,
  size: Container,
  mats: DrinkMaterials
): THREE.Mesh[] {
  const { radius: R, height: H } = size
  const points: ProfilePoint[] = [
    [0, 0.003],
    [R * 0.9, 0],
    [R, 0.008],
    [R, 0.125],
    [R * 0.9, 0.14],
    [R * 0.6, 0.158],
    [0.0128, 0.168],
    [0.0125, 0.226],
  ]
  return [
    ...glassBottle(points, 0.19, art.liquid, mats),
    drinkLabel(mats.face(art.label), R * 1.01, 0.03, 0.1, Math.PI),
    drinkLabel(mats.face(art.neck), 0.0134, 0.17, 0.205),
    cap(mats.flat(art.cap), 0.0142, 0.226, H),
  ]
}

// Jim Beam: a rounded-square fifth with flat shoulders, a short neck and
// a white cap.
function squareParts(
  art: DrinkArt,
  size: Container,
  mats: DrinkMaterials
): THREE.Mesh[] {
  const { radius: R, height: H } = size
  const D = need(size.depth, 'depth')
  const points: ProfilePoint[] = [
    [0, 0.003],
    [R * 0.92, 0],
    [R, 0.01],
    [R, 0.2],
    [R * 0.9, 0.214],
    [R * 0.55, 0.225],
    [0.017, 0.232],
    [0.015, 0.24],
    [0.015, 0.256],
  ]
  const weight = (y: number): number =>
    y <= 0.2 ? 1 : Math.max(0, 1 - (y - 0.2) / 0.03)
  const shape = { size: { radius: R, depth: D, n: 4 }, weight }
  return [
    ...glassBottle(points, 0.236, art.liquid, mats, shape),
    flatLabel(mats.face(art.label), R * 1.7, 0.03, 0.15, D + 0.0008),
    drinkLabel(mats.face(art.neck), 0.0168, 0.24, H),
    cap(mats.flat(art.cap), 0.0166, 0.24, H),
  ]
}

// Grey Goose: a tall frosted bottle, the label printed on the glass, a
// blue cap.
function gooseParts(
  art: DrinkArt,
  size: Container,
  { face, flat }: DrinkMaterials
): THREE.Mesh[] {
  const { radius: R, height: H } = size
  const body = lathe(
    [
      [0, 0.003],
      [R * 0.95, 0],
      [R, 0.01],
      [R, 0.235],
      [R * 0.93, 0.255],
      [R * 0.7, 0.275],
      [0.022, 0.29],
      [0.017, 0.298],
      [0.017, 0.31],
    ],
    flat(art.frost)
  )
  return [
    body,
    drinkLabel(face(art.label), R * 1.006, 0.02, 0.235, Math.PI),
    cap(flat(art.cap), 0.0188, 0.306, H),
  ]
}

// MD 20/20: a flat flask with round shoulders and a silver screw cap.
function flaskParts(
  art: DrinkArt,
  size: Container,
  mats: DrinkMaterials
): THREE.Mesh[] {
  const { radius: R, height: H } = size
  const D = need(size.depth, 'depth')
  const points: ProfilePoint[] = [
    [0, 0.003],
    [R * 0.94, 0],
    [R, 0.012],
    [R, 0.17],
    [R * 0.92, 0.2],
    [R * 0.7, 0.22],
    [0.02, 0.232],
    [0.016, 0.24],
    [0.016, 0.252],
  ]
  const weight = (y: number): number =>
    y <= 0.17 ? 1 : Math.max(0, 1 - (y - 0.17) / 0.06)
  const shape = { size: { radius: R, depth: D, n: 3 }, weight }
  return [
    ...glassBottle(points, 0.244, art.liquid, mats, shape),
    flatLabel(mats.cutout(art.label), R * 1.6, 0.03, 0.171, D + 0.0008),
    cap(mats.flat(art.cap), 0.018, 0.249, H),
  ]
}

// Ice Mountain: a ribbed PET bottle of water, a wrap label, a blue cap.
function waterParts(
  art: DrinkArt,
  size: Container,
  { face, flat }: DrinkMaterials
): THREE.Mesh[] {
  const { radius: R, height: H } = size
  const rib = (y: number): ProfilePoint[] => [
    [R, y - 0.005],
    [R * 0.93, y],
    [R, y + 0.005],
  ]
  const body = lathe(
    [
      [0, 0.004],
      [R * 0.8, 0],
      [R, 0.012],
      ...rib(0.028),
      [R, 0.04],
      [R, 0.115],
      ...rib(0.127),
      ...rib(0.142),
      [R, 0.15],
      [R * 0.8, 0.172],
      [0.016, 0.186],
      [0.0135, 0.19],
      [0.0135, 0.193],
    ],
    glassMaterial(art.water, 0.8, 0.5)
  )
  return [
    body,
    drinkLabel(face(art.wrap), R * 1.01, 0.045, 0.112),
    cap(flat(art.cap), 0.0152, 0.192, H),
  ]
}

const DRINK_PARTS: Record<ContainerKey, DrinkPartsBuilder> = {
  tall: canParts,
  slim: canParts,
  can12: canParts,
  nos: nosParts,
  bourbon: bourbonParts,
  square: squareParts,
  goose: gooseParts,
  flask: flaskParts,
  water: waterParts,
  longneck: longneckParts,
}

// glow: false leaves out the halo, for close-up views like the inventory.
function buildDrink(
  drinkId: string,
  { glow = true }: PickupOptions = {}
): THREE.Group {
  const drink = isDrink(drinkId) ? itemById(drinkId) : null
  if (!drink?.container) throw new Error(`Unknown drink "${drinkId}"`)
  const art = paintDrink(drinkId)
  const size = CONTAINERS[drink.container]
  const group = new THREE.Group()
  group.name = `drink-${drinkId}`
  const pulse: THREE.MeshLambertMaterial[] = []
  const mats: DrinkMaterials = {
    face(canvasArt) {
      const m = packFace(artTexture(need(canvasArt, 'label canvas')))
      pulse.push(m)
      return m
    },
    // A label with see-through margins: the canvas alpha cuts it out.
    cutout(canvasArt) {
      const m = mats.face(canvasArt)
      m.alphaTest = 0.5
      return m
    },
    flat(color) {
      const m = packFlat(need(color, 'color'))
      pulse.push(m)
      return m
    },
  }
  group.add(...DRINK_PARTS[drink.container](art, size, mats))
  if (glow) {
    const halo = makeGlowSprite(makeGlowTexture(art.glow), DRINK_GLOW_SCALE)
    halo.position.y = size.height * 0.5
    group.add(halo)
  }
  setPulseMaterials(group, pulse)
  return group
}

// --- Medicine ------------------------------------------------------------

// The over-the-counter rack by the register, one shape per MedicineForm: a
// 24-count pill bottle, a folding carton, and a half-ounce dropper bottle,
// each with its painted label (medart.ts). Sizes in metres, origin at
// ground level under the middle, art facing +Z.
const MEDICINE_GLOW_SCALE = 0.7

interface MedicineMaterials {
  face: (canvasArt: CanvasArt | undefined) => THREE.MeshLambertMaterial
  flat: (color: string | undefined) => THREE.MeshLambertMaterial
}

type MedicinePartsBuilder = (
  art: MedicineArt,
  mats: MedicineMaterials
) => { parts: THREE.Object3D[]; height: number }

// A pill bottle: 38 mm across, a wrap label, a child-proof cap.
function pillsParts(
  art: MedicineArt,
  { face, flat }: MedicineMaterials
): ReturnType<MedicinePartsBuilder> {
  const R = 0.019
  const H = 0.062
  const body = lathe(
    [
      [0, 0.002],
      [R * 0.85, 0],
      [R, 0.004],
      [R, 0.046],
      [R * 0.9, 0.05],
      [R * 0.8, 0.051],
    ],
    flat(art.plastic)
  )
  return {
    parts: [
      body,
      drinkLabel(face(art.label), R * 1.01, 0.008, 0.042),
      cap(flat(art.cap), R * 0.98, 0.05, H),
    ],
    height: H,
  }
}

// A folding carton, standing on its base, front toward +Z. BoxGeometry
// face order: +x, -x, +y, -y, +z, -z.
function cartonParts(
  art: MedicineArt,
  { face, flat }: MedicineMaterials
): ReturnType<MedicinePartsBuilder> {
  const W = 0.07
  const H = 0.1
  const D = 0.025
  const front = face(art.front)
  const side = face(art.side)
  const edge = flat(art.edge)
  const carton = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [
    side,
    side,
    edge,
    edge,
    front,
    front,
  ])
  carton.position.y = H / 2
  return { parts: [carton], height: H }
}

// A dropper bottle: 26 mm across, a wrap label, a tall tapered cap.
function dropperParts(
  art: MedicineArt,
  { face, flat }: MedicineMaterials
): ReturnType<MedicinePartsBuilder> {
  const R = 0.013
  const H = 0.075
  const body = lathe(
    [
      [0, 0.002],
      [R * 0.8, 0],
      [R, 0.004],
      [R, 0.045],
      [R * 0.85, 0.052],
      [0.007, 0.056],
      [0.007, 0.058],
    ],
    flat(art.plastic)
  )
  const top = lathe(
    [
      [0.0085, 0.056],
      [0.0085, 0.07],
      [0.0065, H],
      [0, H],
    ],
    flat(art.cap)
  )
  return {
    parts: [body, drinkLabel(face(art.label), R * 1.01, 0.008, 0.042), top],
    height: H,
  }
}

const MEDICINE_PARTS: Record<MedicineForm, MedicinePartsBuilder> = {
  pills: pillsParts,
  carton: cartonParts,
  dropper: dropperParts,
}

// glow: false leaves out the halo, for close-up views like the inventory.
function buildMedicine(
  medicineId: string,
  { glow = true }: PickupOptions = {}
): THREE.Group {
  const medicine = isMedicine(medicineId) ? itemById(medicineId) : null
  if (!medicine?.form) throw new Error(`Unknown medicine "${medicineId}"`)
  const art = paintMedicine(medicineId)
  const group = new THREE.Group()
  group.name = `med-${medicineId}`
  const pulse: THREE.MeshLambertMaterial[] = []
  const mats: MedicineMaterials = {
    face(canvasArt) {
      const m = packFace(artTexture(need(canvasArt, 'label canvas')))
      pulse.push(m)
      return m
    },
    flat(color) {
      const m = packFlat(need(color, 'color'))
      pulse.push(m)
      return m
    },
  }
  const { parts, height } = MEDICINE_PARTS[medicine.form](art, mats)
  group.add(...parts)
  if (glow) {
    const halo = makeGlowSprite(makeGlowTexture(art.glow), MEDICINE_GLOW_SCALE)
    halo.position.y = height * 0.5
    group.add(halo)
  }
  setPulseMaterials(group, pulse)
  return group
}

// --- Pickups -------------------------------------------------------------

// The materials the game loop pulses on each pickup. A WeakMap keeps the
// list typed; Object3D.userData is `any`.
const PULSE = new WeakMap<THREE.Object3D, THREE.MeshLambertMaterial[]>()

// Assets that move on their own (fire, rain, the horse at ease), keyed by
// their root: the update to call with a running time in seconds. The game
// keeps its own handle on each rig; the Akashic plays them from here.
const MOTION = new WeakMap<THREE.Object3D, (t: number) => void>()

export function setMotion(
  object: THREE.Object3D,
  update: (t: number) => void
): void {
  MOTION.set(object, update)
}

export function motionOf(object: THREE.Object3D): ((t: number) => void) | null {
  return MOTION.get(object) ?? null
}

function setPulseMaterials(
  object: THREE.Object3D,
  materials: THREE.MeshLambertMaterial[]
): void {
  PULSE.set(object, materials)
}

export function pulseMaterials(
  object: THREE.Object3D
): THREE.MeshLambertMaterial[] {
  return PULSE.get(object) ?? []
}

// Kinds: 'cabbage', 'dimes', or an item id from items.ts. glow: false
// leaves out the halo on packs, joints, drinks, medicine, berries, dimes
// and gold bullion.
export function buildPickup(
  kind: string,
  seed?: number,
  { glow = true }: PickupOptions = {}
): THREE.Object3D {
  if (isCigarette(kind)) return buildCigarettePack(kind, seed, { glow })
  if (kind === 'joints') return buildJoints({ glow })
  if (isDrink(kind)) return buildDrink(kind, { glow })
  if (kind === 'berries') return buildBerries({ glow })
  if (kind === 'dimes') return buildDimes(12, seed, { glow })
  if (kind === 'gold-bullion') return buildGoldBullion({ glow })
  if (isMedicine(kind)) return buildMedicine(kind, { glow })
  let mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshLambertMaterial>
  if (kind === 'cabbage') {
    const sphere = new THREE.SphereGeometry(0.35, 6, 5)
    sphere.translate(0, 0.35, 0)
    mesh = new THREE.Mesh(
      sphere,
      new THREE.MeshLambertMaterial({
        color: '#1c2a16',
        emissive: new THREE.Color('#9be88a'),
        emissiveIntensity: 0.5,
      })
    )
  } else {
    throw new Error(`Unknown pickup kind "${kind}"`)
  }
  setPulseMaterials(mesh, [mesh.material])
  return mesh
}

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

// --- Sky -----------------------------------------------------------------

// Stars and the moon. loop.ts moves the group with the player so the sky
// never recedes into fog.
export function buildSky(): THREE.Group {
  const sky = new THREE.Group()
  const starRng = mulberry32(0x57a25)
  const starPositions = new Float32Array(700 * 3)
  for (let i = 0; i < 700; i++) {
    const az = starRng() * Math.PI * 2
    const el = Math.asin(starRng() * 0.95 + 0.05)
    const r = 1200
    starPositions[i * 3] = Math.cos(el) * Math.sin(az) * r
    starPositions[i * 3 + 1] = Math.sin(el) * r
    starPositions[i * 3 + 2] = Math.cos(el) * Math.cos(az) * r
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  sky.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: '#aab6cf',
        size: 2,
        sizeAttenuation: false,
        fog: false,
        transparent: true,
        opacity: 0.75,
      })
    )
  )
  const moonCanvas = document.createElement('canvas')
  moonCanvas.width = 64
  moonCanvas.height = 64
  const mctx = context2d(moonCanvas)
  const mgrad = mctx.createRadialGradient(32, 32, 6, 32, 32, 30)
  mgrad.addColorStop(0, 'rgba(226, 232, 240, 0.95)')
  mgrad.addColorStop(0.45, 'rgba(190, 205, 228, 0.35)')
  mgrad.addColorStop(1, 'rgba(190, 205, 228, 0)')
  mctx.fillStyle = mgrad
  mctx.fillRect(0, 0, 64, 64)
  const moon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(moonCanvas),
      fog: false,
      transparent: true,
      depthWrite: false,
    })
  )
  moon.position.set(450, 750, -680)
  moon.scale.setScalar(170)
  sky.add(moon)
  return sky
}

// --- World surfaces ------------------------------------------------------

// world.ts builds these meshes from geo.json; the materials live here. Each
// call returns a new material.

// The roads (and the streams): lit, so the headlights and the station
// lights fall on them and what stands in a beam throws a shadow down the
// road. The emissive is each vertex's own tone, which keeps a road as dark
// as it was unlit, at the lot's strength (lotMaterial) so the two meet.
export function roadMaterial(): THREE.MeshLambertMaterial {
  const material = lambert({
    vertexColors: true,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  })
  const ps1 = material.onBeforeCompile.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    ps1(shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;'
    )
  }
  material.customProgramCacheKey = () => 'road-vertex-emissive'
  return material
}

// Worn mud (mudart.ts): every road's shoulders and the trail out of the
// corn maze by default, or other mud art, like the maze's own trail. Lit,
// and glowing through its own art at the roads' strength, so the two read
// as one at night. The default art repeats along the mud (v) and frays at
// both edges (u); see-through art shows the grass through alphaTest.
export function mudMaterial(
  art: CanvasArt = paintMud()
): THREE.MeshLambertMaterial {
  const texture = artTexture(art)
  texture.wrapT = THREE.RepeatWrapping
  return lambert({
    map: texture,
    alphaTest: 0.5,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  })
}

// The station lots, lit like the roads, so the canopy light falls on the
// forecourt and the pumps throw shadows across it. The night light barely
// reaches asphalt this dark, so the emissive carries the lot's own color
// at the roads' strength, and the two meet.
export function lotMaterial(): THREE.MeshLambertMaterial {
  return lambert({
    vertexColors: true,
    emissive: new THREE.Color(FUEL_LAYOUT.lotColor),
    emissiveIntensity: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  })
}

// Every mesh under `root` throws a shadow under the station lights.
export function castShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (isMesh(o)) o.castShadow = true
  })
}

export function waterMaterial(): THREE.MeshLambertMaterial {
  return lambert({
    vertexColors: true,
    emissive: new THREE.Color('#03121f'),
    side: THREE.DoubleSide,
  })
}

// The faint fence line at a property edge.
export function fenceMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: '#3a3f47',
    transparent: true,
    opacity: 0.4,
  })
}

// The amber line round the survey boundary.
export function boundaryMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: '#f59e0b',
    transparent: true,
    opacity: 0.45,
  })
}

// --- Assembly ------------------------------------------------------------

// One Mesh per part in a Group, for a single non-instanced copy.
function assembleParts(parts: Part[]): THREE.Group {
  const group = new THREE.Group()
  for (const part of parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material)
    mesh.name = part.name
    if (part.position) mesh.position.set(...part.position)
    if (part.rotation) mesh.rotation.set(...part.rotation)
    if (part.scale) mesh.scale.set(...part.scale)
    group.add(mesh)
  }
  return group
}

// Registry for the Akashic page, in cycle order. The truck (with its
// driver) and the shadowman come in from their own modules, because both
// need figure or game code; see src/akashic.ts.
export const WORLD_ASSETS: AkashicAsset[] = [
  { id: 'citgo-station', label: 'Citgo station', build: sampleFuelStation },
  {
    id: 'citgo-interior',
    label: 'Citgo interior',
    build: sampleStoreInterior,
  },
  ...STORE_LAYOUT.signs.map((sign) => ({
    id: `ad-${signId(sign)}`,
    label: `Citgo sign: ${signId(sign)}`,
    build: () =>
      assembleParts([{ ...adSignPart(sign), position: [0, sign.size[1], 0] }]),
  })),
  { id: 'pump', label: 'Gas pump', build: () => assembleParts(pumpParts()) },
  {
    id: 'trash-can',
    label: 'Trash can',
    build: () => assembleParts(trashCanParts()),
  },
  { id: 'tree', label: 'Tree', build: sampleTree },
  { id: 'corn-wall', label: 'Corn maze: wall corner', build: sampleCornWall },
  { id: 'corn-maze', label: 'Corn maze: whole layout', build: sampleCornMaze },
  {
    id: 'corn-maze-sign',
    label: 'Corn maze: sign',
    build: buildCornMazeSign,
  },
  { id: 'enter-sign', label: 'Corn maze: enter sign', build: buildEnterSign },
  {
    id: 'portal',
    label: 'Corn maze: portal',
    build: () => {
      const portal = buildPortal()
      setMotion(portal.group, (t) => portal.update(t))
      return portal.group
    },
  },
  { id: 'pole', label: 'Utility pole', build: samplePole },
  { id: 'streetlight', label: 'Streetlight', build: sampleStreetlight },
  { id: 'reeds', label: 'Reeds (clump of 12)', build: sampleReeds },
  {
    id: 'gravestone',
    label: 'Gravestone',
    build: () => assembleParts([gravestonePart()]),
  },
  {
    id: 'beacon-keep',
    label: "Beacon: Mt. Coleman's Keep",
    build: () => buildLandmarkBeacon('#e879f9'),
  },
  { id: 'cabbage', label: 'Cabbage', build: () => buildPickup('cabbage') },
  ...ITEMS.filter((item) => item.category === 'cigarette').map((item) => ({
    id: `pack-${item.id}`,
    label: `Pack: ${item.label}`,
    build: () => buildCigarettePack(item.id),
  })),
  { id: 'joints', label: 'Joints', build: () => buildPickup('joints') },
  ...ITEMS.filter((item) => item.category === 'drink').map((d) => ({
    id: `drink-${d.id}`,
    label: `Drink: ${d.label}`,
    build: () => buildDrink(d.id),
  })),
  { id: 'berries', label: 'Berries', build: () => buildPickup('berries') },
  { id: 'dimes', label: 'Dimes (12)', build: () => buildDimes(12) },
  {
    id: 'gold-bullion',
    label: 'Gold bullion (1 troy oz)',
    build: () => buildPickup('gold-bullion'),
  },
  {
    id: 'flaming-halo',
    label: 'The Flaming Halo',
    build: () => {
      // At a head's height, where it is worn.
      const group = new THREE.Group()
      const halo = buildFlamingHalo()
      halo.group.position.y = 1.85
      group.add(halo.group)
      setMotion(group, halo.update)
      return group
    },
  },
  { id: 'berry-bush', label: 'Berry bush', build: () => buildBerryBush() },
  {
    id: 'caretaker',
    label: 'The Caretaker',
    build: () => buildCaretaker().group,
  },
  {
    id: 'cabbage-stand',
    label: 'Bull Valley Cabbage Stand',
    build: () => buildCabbageStand(),
  },
  {
    id: 'raincloud',
    label: "Gron's raincloud",
    build: () => {
      // Lifted so its rain ends on the floor of the view.
      const cloud = buildRaincloud()
      cloud.group.position.y = 2.6
      return cloud.group
    },
  },
  ...ITEMS.filter((item) => item.category === 'medicine').map((m) => ({
    id: `med-${m.id}`,
    label: `Medicine: ${m.label}`,
    build: () => buildMedicine(m.id),
  })),
  {
    id: 'fire-roots',
    label: "Moab's fire roots",
    build: () => buildFireRoots().group,
  },
  {
    id: 'skeleton-horse',
    label: "Moab's skeleton horse",
    build: () => buildSkeletonHorse().group,
  },
  { id: 'guitar', label: 'Guitar: black LTD EX-400', build: sampleGuitar },
  { id: 'bat', label: 'Baseball bat', build: buildBat },
  {
    id: 'flashlight',
    label: 'Flashlight',
    build: () => {
      const flashlight = buildFlashlight()
      flashlight.setOn(true)
      return flashlight.group
    },
  },
  {
    id: 'shadow-burst',
    label: 'Shadowman burst',
    build: () => {
      // Chest high, going off again every few seconds with a new throw.
      const group = new THREE.Group()
      const burst = buildShadowBurst()
      burst.group.position.y = CONFIG.shadowmen.chestHeight
      group.add(burst.group)
      const every = SHADOW_BURST.seconds + 0.6
      setMotion(group, (t) => {
        burst.start(0x5c011 + Math.floor(t / every))
        burst.draw(t % every)
      })
      return group
    },
  },
  { id: 'book', label: 'Paperback', build: buildBook },
  {
    id: 'scroll',
    label: "Moab's burning scroll",
    build: () => {
      // Hung from its top rod, so it stands just off the floor.
      const group = new THREE.Group()
      const scroll = buildScroll()
      scroll.group.position.y = 0.56
      group.add(scroll.group)
      setMotion(group, (t) => scroll.update(t))
      return group
    },
  },
  { id: 'scythe', label: "Moab's scythe", build: buildScythe },
]

// Bounds from meshes only: glow sprites are unit planes scaled up, and would
// frame a camera on empty air.
export function meshBounds(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  object.updateMatrixWorld(true)
  object.traverse((o) => {
    if (isMesh(o)) box.expandByObject(o)
  })
  return box
}
