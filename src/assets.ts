import * as THREE from 'three'
import { paintDrink } from './canart.ts'
import { context2d } from './canvas.ts'
import { CONTAINERS } from './drinks.ts'
import { DEFAULT_FINISH, finishById } from './finishes.ts'
import { isCigarette, isDrink, itemById, ITEMS } from './items.ts'
import { paintPack } from './packart.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'
import { STORE_LAYOUT } from './store.ts'
import type { DrinkArt } from './canart.ts'
import type { CanvasArt } from './canvas.ts'
import type { Container, ContainerKey, Vec3 } from './interfaces.ts'
import type { Rng } from './rng.ts'
import type { StoreFinish } from './store.ts'

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

const POLE_SAMPLE = { height: 8.75 }
export const POLE_ARM_DROP = 0.9

export function poleParts() {
  const pole = new THREE.CylinderGeometry(0.12, 0.16, 1, 5)
  pole.translate(0, 0.5, 0)
  return {
    pole: {
      name: 'pole',
      geometry: pole,
      material: lambert({ color: '#3a2f22' }),
    },
    arm: {
      name: 'arm',
      geometry: new THREE.BoxGeometry(1.7, 0.14, 0.14),
      material: lambert({ color: '#33291d' }),
    },
  }
}

function samplePole(): THREE.Group {
  const { pole, arm } = poleParts()
  const h = POLE_SAMPLE.height
  return assembleParts([
    { ...pole, scale: [1, h, 1] },
    { ...arm, position: [0, h - POLE_ARM_DROP, 0] },
  ])
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
  // stops at the road edge); halfWidth spans local Z.
  lot: { back: STORE_LAYOUT.front, halfWidth: 11 },
  lotColor: '#262a30',
}

// The store's colors, by finish. The walls and floor carry a little
// emissive, the fluorescent tubes nobody turns off.
const STORE_FINISH: Record<StoreFinish, () => THREE.MeshLambertMaterial> = {
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
  roof: () => lambert({ color: '#6c6961' }),
  shelf: () => lambert({ color: '#3e434a' }),
  counter: () => lambert({ color: '#5a3426' }),
}

// The store shell and fixtures from STORE_LAYOUT, one part per box, each
// geometry already in station-local space: place it at the pump island
// with the station's yaw. One material per finish, shared across boxes.
export function storeParts(): Part[] {
  const materials = new Map<StoreFinish, THREE.MeshLambertMaterial>()
  return STORE_LAYOUT.boxes.map((b) => {
    let material = materials.get(b.finish)
    if (!material) {
      material = STORE_FINISH[b.finish]()
      materials.set(b.finish, material)
    }
    const geometry = new THREE.BoxGeometry(...b.size)
    geometry.translate(...b.center)
    return { name: `store-${b.name}`, geometry, material }
  })
}

// One shelf unit: what the carousel shows, without the halo.
function buildShelfItem(kind: string): THREE.Object3D {
  if (kind === 'sack') return buildSack()
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

export function fuelStationParts() {
  const canopy = new THREE.BoxGeometry(9, 0.45, 6.5)
  canopy.translate(0, 4.6, 0)
  const canopyPole = new THREE.CylinderGeometry(0.12, 0.12, 4.6, 5)
  canopyPole.translate(0, 2.3, 0)
  const pump = new THREE.BoxGeometry(0.9, 1.3, 0.5)
  pump.translate(0, 0.65, 0)
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
    pump: {
      name: 'pump',
      geometry: pump,
      material: lambert({
        color: '#7a1d1d',
        emissive: new THREE.Color('#40100f'),
        emissiveIntensity: 0.4,
      }),
    },
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
    parts.push({ ...p.pump, position: [0, 0, off] })
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

// --- Burlap sack ---------------------------------------------------------

// The Citgo's burlap sack, filled out a little, gathered and tied at the
// neck. Origin at ground level under the middle. Seen on the store's sack
// shelf and in the inventory.
export function buildSack(seed = 0x5ac4): THREE.Group {
  const rng = mulberry32(seed)
  const burlap = lambert({ color: '#8a6d42' })
  const twine = lambert({ color: '#5a4426' })
  const bodyGeo = new THREE.BoxGeometry(0.42, 0.46, 0.28, 3, 3, 2)
  const pos = bodyGeo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    // Taper toward the neck, bulge at the belly, lump everything a bit.
    const t = (y + 0.23) / 0.46
    const squeeze = 1 - 0.45 * t * t
    pos.setX(i, pos.getX(i) * squeeze + range(rng, -0.012, 0.012))
    pos.setZ(i, pos.getZ(i) * squeeze + range(rng, -0.012, 0.012))
    pos.setY(i, y + range(rng, -0.01, 0.01))
  }
  bodyGeo.computeVertexNormals()
  const body = new THREE.Mesh(bodyGeo, burlap)
  body.position.y = 0.23
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.06, 0.05, 6),
    twine
  )
  neck.position.y = 0.48
  const flare = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.03, 0.08, 6),
    burlap
  )
  flare.position.y = 0.54
  const group = new THREE.Group()
  group.name = 'sack'
  group.add(body, neck, flare)
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

// The bush by the spawn Citgo that gives one berry a day (sharedraid.ts
// rule 9): a low mound of dark lumps on a stub of trunk, berries set on
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
    group.add(mesh)
  }
  return group
}

// A handful of berries, as the inventory shows them: five in a loose pile.
// Origin at ground level under the middle.
export function buildBerries({ glow = true }: PickupOptions = {}): THREE.Group {
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
  // The set neck in the body's black, the rosewood fretboard over it with
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
// liquor bottles, the MD 20/20 flask and the Ice Mountain water bottle.
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

// --- Pickups -------------------------------------------------------------

// The materials the game loop pulses on each pickup. A WeakMap keeps the
// list typed; Object3D.userData is `any`.
const PULSE = new WeakMap<THREE.Object3D, THREE.MeshLambertMaterial[]>()

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

// Kinds: 'cabbage', or an item id from items.ts. glow: false leaves out the
// halo on packs, joints, and drinks.
export function buildPickup(
  kind: string,
  seed?: number,
  { glow = true }: PickupOptions = {}
): THREE.Object3D {
  if (isCigarette(kind)) return buildCigarettePack(kind, seed, { glow })
  if (kind === 'joints') return buildJoints({ glow })
  if (isDrink(kind)) return buildDrink(kind, { glow })
  if (kind === 'berries') return buildBerries({ glow })
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
  // Headlights: emissive stubs plus a warm glow.
  const lightMat = applyPS1(
    new THREE.MeshLambertMaterial({
      color: '#241a05',
      emissive: new THREE.Color('#fbe7a3'),
      emissiveIntensity: 0.9,
    })
  )
  add(new THREE.BoxGeometry(0.3, 0.18, 0.08), lightMat, 0.62, 0.95, 2.78)
  add(new THREE.BoxGeometry(0.3, 0.18, 0.08), lightMat, -0.62, 0.95, 2.78)
  const glow = makeGlowTexture('rgba(251, 231, 163, 0.55)')
  for (const gx of [0.62, -0.62]) {
    const sprite = makeGlowSprite(glow, 1.6)
    sprite.position.set(gx, 0.95, 2.85)
    group.add(sprite)
  }

  // The steering wheel, in front of the driver seat (left side, +X), where
  // the sit pose puts the hands.
  const steeringGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 8)
  const wheel = add(steeringGeo, dark, 0.45, 1.2, 1.06)
  wheel.rotation.x = Math.PI / 2 - 0.35
  return group
}

// --- Sky -----------------------------------------------------------------

// Stars and the moon. main.ts moves the group with the player so the sky
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

// Basic, not lambert: ribbon winding flips with the direction each polyline
// was digitized in, so lighting by face normal would render half the roads
// unlit. Flat night asphalt wants a constant tone anyway; fog still applies.
// DoubleSide keeps the flipped half visible.
export function roadMaterial(): THREE.MeshBasicMaterial {
  return applyPS1(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.DoubleSide,
    })
  )
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
  { id: 'tree', label: 'Tree', build: sampleTree },
  { id: 'pole', label: 'Utility pole', build: samplePole },
  { id: 'reeds', label: 'Reeds (clump of 12)', build: sampleReeds },
  {
    id: 'gravestone',
    label: 'Gravestone',
    build: () => assembleParts([gravestonePart()]),
  },
  {
    id: 'beacon-stand',
    label: 'Beacon: Cabbage Stand',
    build: () => buildLandmarkBeacon('#22d3ee'),
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
  { id: 'berry-bush', label: 'Berry bush', build: () => buildBerryBush() },
  { id: 'sack', label: 'Burlap sack', build: () => buildSack() },
  { id: 'guitar', label: 'Guitar: black LTD EX-400', build: sampleGuitar },
  { id: 'bat', label: 'Baseball bat', build: buildBat },
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
