import * as THREE from 'three'
import {
  artTexture,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  memo,
  packFace,
  packFlat,
  setPulseMaterials,
} from './assetkit.ts'
import { paintDrink } from './canart.ts'
import { CONTAINERS } from './drinks.ts'
import { itemById } from './items.ts'
import type { PickupOptions } from './assetkit.ts'
import type { DrinkArt } from './canart.ts'
import type { CanvasArt } from './canvas.ts'
import type { Container, ContainerKey } from './interfaces.ts'

const drinkArt = memo(paintDrink)

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
export type ProfilePoint = [number, number]

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
export function need<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`Drink art or container is missing "${field}"`)
  }
  return value
}

// A label on a round surface, centered on the front (+Z). arc is how far
// it wraps, in radians; the default goes all the way around, and then the
// middle of the canvas is the front. Keep arc a multiple of PI / 4 so its
// edges land on lathe vertices.
export function drinkLabel(
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

export function lathe(
  points: ProfilePoint[],
  material: THREE.Material
): THREE.Mesh {
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
export function cap(
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
export function buildDrink(
  drinkId: string,
  { glow = true }: PickupOptions = {}
): THREE.Group {
  const drink = itemById(drinkId)
  if (drink?.category !== 'drink') throw new Error(`Unknown drink "${drinkId}"`)
  const art = drinkArt(drinkId)
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
