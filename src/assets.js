import * as THREE from 'three'
import { applyPS1 } from './ps1.js'
import { mulberry32, range } from './rng.js'
import { BRANDS, isBrand } from './brands.js'
import { paintPack } from './packart.js'

// Every placed 3D asset in Bull Valley, defined once in asset-local space.
// world.js instances these parts across the valley; the Akashic dev page
// (/akashic) assembles one of each for inspection. A part is
// { name, geometry, material, position?, rotation?, scale? }. Instanced
// assets export parts; one-off assets export a builder that returns an
// Object3D. Building parts consumes no rng, so placement seeds stay put.

export function lambert(opts) {
  return applyPS1(new THREE.MeshLambertMaterial(opts))
}

export function makeGlowTexture(color = 'rgba(251, 191, 36, 0.65)') {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}

export function makeGlowSprite(map, scale) {
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
export const TREE_SAMPLE = { trunkH: 3.2, canopyH: 6, canopyR: 2.25, tint: 0.5 }

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

function sampleTree() {
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

export const POLE_SAMPLE = { height: 8.75 }
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

function samplePole() {
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
function sampleReeds() {
  const reed = reedPart()
  const rng = mulberry32(0x2eed)
  const parts = []
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
function makeCitgoSignTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 96
  const ctx = canvas.getContext('2d')
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

// Station-local layout: the fuel point at the origin, local +X toward the
// road sign, the building set back along -X. `along` offsets run on the
// local Z axis (the pump island's long side). The sign sits on its own
// ground sample in the world, so `sign` gives a ground offset plus height.
export const FUEL_LAYOUT = {
  buildingSetback: 7,
  canopyPoleOffset: 2.6,
  pumpOffset: 2.6 * 0.55,
  signDistance: 10,
  signHeight: 7,
  glowScale: 9,
}

export function fuelStationParts() {
  const building = new THREE.BoxGeometry(7, 3.4, 5)
  building.translate(0, 1.7, 0)
  const canopy = new THREE.BoxGeometry(9, 0.45, 6.5)
  canopy.translate(0, 4.6, 0)
  const canopyPole = new THREE.CylinderGeometry(0.12, 0.12, 4.6, 5)
  canopyPole.translate(0, 2.3, 0)
  const pump = new THREE.BoxGeometry(0.9, 1.3, 0.5)
  pump.translate(0, 0.65, 0)
  const signPole = new THREE.CylinderGeometry(0.14, 0.14, 7, 5)
  signPole.translate(0, 3.5, 0)
  return {
    building: {
      name: 'building',
      geometry: building,
      material: lambert({ color: '#8d8a80' }),
    },
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

// One station at yaw 0, laid out exactly as world.js places them.
function sampleFuelStation() {
  const p = fuelStationParts()
  const L = FUEL_LAYOUT
  const parts = [
    { ...p.building, position: [-L.buildingSetback, 0, 0] },
    p.canopy,
    { ...p.signPole, position: [L.signDistance, 0, 0] },
    { ...p.sign, position: [L.signDistance, L.signHeight, 0] },
  ]
  for (const off of [L.canopyPoleOffset, -L.canopyPoleOffset]) {
    parts.push({ ...p.canopyPole, position: [0, 0, off] })
  }
  for (const off of [L.pumpOffset, -L.pumpOffset]) {
    parts.push({ ...p.pump, position: [0, 0, off] })
  }
  const group = assembleParts(parts)
  const sprite = makeGlowSprite(p.glow, L.glowScale)
  sprite.position.set(L.signDistance, L.signHeight, 0)
  group.add(sprite)
  return group
}

// --- Landmark beacon -----------------------------------------------------

// A tall pole with a lit panel and a big glow, color-coded so it reads
// across the fog. Origin at ground level.
export function buildLandmarkBeacon(color) {
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
export const PACK = {
  width: 0.055,
  depth: 0.022,
  bodyHeight: 0.066,
  lidHeight: 0.022,
  lidOpen: THREE.MathUtils.degToRad(110),
  stickRadius: 0.0036,
  filterLength: 0.021,
  glowScale: 0.9,
}

function packTexture({ c }) {
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Art that glows through its own emissiveMap, so it reads in the dark; the
// pickup pulse drives emissiveIntensity.
function packFace(texture) {
  return lambert({
    map: texture,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: 0.45,
  })
}

function packFlat(color) {
  return lambert({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.45,
  })
}

// Twenty sticks in three staggered rows of 7, 6, 7. Returns tip heights
// above the collar top: most sit flush, a few ride up out of the pack.
function stickLayout(rng) {
  const d = PACK.stickRadius * 2
  const rowGap = PACK.stickRadius * Math.sqrt(3)
  const spots = []
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

export function buildCigarettePack(brandId, seed = 0x5ac) {
  const art = paintPack(brandId)
  const { width: W, depth: D, bodyHeight: BH, lidHeight: LH } = PACK
  const pack = new THREE.Group()
  pack.name = `pack-${brandId}`
  const pulse = []
  const face = (canvasArt) => {
    const m = packFace(packTexture(canvasArt))
    pulse.push(m)
    return m
  }
  const flat = (color) => {
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
  const parts = [
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
  const glow = makeGlowSprite(makeGlowTexture(art.glow), PACK.glowScale)
  glow.position.y = BH * 0.6
  pack.add(glow)

  pack.userData.pulseMaterials = pulse
  return pack
}

// --- Pickups -------------------------------------------------------------

// Every pickup lists the materials the game loop pulses in
// userData.pulseMaterials. Kinds: 'cabbage', 'joints', or a brand id.
export function buildPickup(kind, seed) {
  if (isBrand(kind)) return buildCigarettePack(kind, seed)
  let mesh
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
  } else if (kind === 'joints') {
    const box = new THREE.BoxGeometry(0.5, 0.35, 0.35)
    box.translate(0, 0.4, 0)
    mesh = new THREE.Mesh(
      box,
      new THREE.MeshLambertMaterial({
        color: '#101216',
        emissive: new THREE.Color('#4ade80'),
        emissiveIntensity: 0.5,
      })
    )
  } else {
    throw new Error(`Unknown pickup kind "${kind}"`)
  }
  mesh.userData.pulseMaterials = [mesh.material]
  return mesh
}

// --- Assembly ------------------------------------------------------------

// One Mesh per part in a Group, for a single non-instanced copy.
export function assembleParts(parts) {
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

// Registry for the Akashic page, in cycle order. Truck and shadowman
// builders come in from their own modules to keep this file free of game
// state; see src/akashic.js.
export const WORLD_ASSETS = [
  { id: 'citgo-station', label: 'Citgo station', build: sampleFuelStation },
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
  ...BRANDS.map((b) => ({
    id: `pack-${b.id}`,
    label: `Pack: ${b.label}`,
    build: () => buildCigarettePack(b.id),
  })),
  { id: 'joints', label: 'Joints', build: () => buildPickup('joints') },
]
