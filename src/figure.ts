// The shared character body, in the PS1 style of Silent Hill and Metal Gear
// Solid: rigid parts on joint pivots, each part a tapered low-poly loft
// (rings of 6 or 8 sides) with smooth normals, so Lambert lighting shades it
// like Gouraud-shaded hardware. Every character is this body in a different
// outfit (outfits.ts), posed and animated from poses.ts. Materials go through
// the PS1 snap, the same way the truck is built.
//
// Body space: origin at the feet, facing +Z, left side +X.

import * as THREE from 'three'
import {
  artTexture,
  buildBat,
  buildBook,
  buildGuitar,
  buildRaincloud,
  castShadows,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
} from './assets.ts'
import { paintPrints } from './decalart.ts'
import { ADDONS, outfitById } from './outfits.ts'
import { JOINTS, samplePose } from './poses.ts'
import type { Guitar } from './assets.ts'
import type { Vec3 } from './interfaces.ts'
import type {
  Crescent,
  DecalId,
  LoftRing,
  OutfitId,
  PatternPart,
  PrintPart,
} from './outfits.ts'
import type { JointName, PoseSample } from './poses.ts'

// A built body: its root group, one pivot per joint, and the hip height
// that poses lift from.
export interface Figure {
  group: THREE.Group
  joints: Record<JointName, THREE.Group>
  hipY: number
  // The guitar on the back, when the outfit carries one; setFinish
  // recolors it in place.
  guitar?: Guitar
}

export interface FigureOptions {
  // false hides the head and everything on the neck.
  head?: boolean
  // The guitar's gloss color, for an outfit with one on its back.
  guitarFinish?: string
}

// The lit cigarette; call update(t) every frame with a running time.
export interface CigaretteRig {
  update(t: number): void
}

// A loft ring, with the forward shift optional.
type RingInput = [number, number, number, number?]

// One material per color and one geometry per shape, shared by every figure.
const materials = new Map<string, THREE.MeshLambertMaterial>()
function material(color: string): THREE.MeshLambertMaterial {
  let found = materials.get(color)
  if (!found) {
    found = lambert({ color })
    materials.set(color, found)
  }
  return found
}

// One material per decal and outfit, since a painter can use the outfit's
// colors. A print is a transparent overlay: alphaTest keeps only the painted
// pixels, and the polygon offset pulls it in front of the part it lies on,
// vertex for vertex. Each decal is either a print or a face, never both.
const decals = new Map<string, THREE.MeshLambertMaterial>()
function decalMaterial(
  outfitId: OutfitId,
  ids: readonly DecalId[],
  print = false
): THREE.MeshLambertMaterial {
  const key = `${outfitId}|${ids.join('+')}`
  let found = decals.get(key)
  if (!found) {
    found = lambert({
      map: artTexture(paintPrints(ids, outfitById(outfitId).colors)),
      ...(print && {
        alphaTest: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
      }),
    })
    decals.set(key, found)
  }
  return found
}

const geometries = new Map<string, THREE.BufferGeometry>()
function cached(
  key: string,
  build: () => THREE.BufferGeometry
): THREE.BufferGeometry {
  let found = geometries.get(key)
  if (!found) {
    found = build()
    geometries.set(key, found)
  }
  return found
}

// A closed loft through rings of [y, rx, rz, cz]: an elliptical cross
// section of half-width rx and half-depth rz, shifted cz forward, at height
// y. Sides are flat facets; normals are shared, so the shading is smooth.
export function loft(
  rings: readonly RingInput[],
  sides = 6
): THREE.BufferGeometry {
  return cached(`${sides}|${JSON.stringify(rings)}`, () => {
    const sorted = [...rings].sort((a, b) => a[0] - b[0])
    const positions: number[] = []
    const index: number[] = []
    for (const [y, rx, rz, cz = 0] of sorted) {
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2
        positions.push(Math.cos(a) * rx, y, Math.sin(a) * rz + cz)
      }
    }
    const at = (i: number, k: number) => i * sides + (k % sides)
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let k = 0; k < sides; k++) {
        index.push(at(i, k), at(i + 1, k), at(i + 1, k + 1))
        index.push(at(i, k), at(i + 1, k + 1), at(i, k + 1))
      }
    }
    // Caps: a centre vertex at each end.
    const last = sorted.length - 1
    const bottom = positions.length / 3
    positions.push(0, sorted[0][0], sorted[0][3] || 0)
    const top = bottom + 1
    positions.push(0, sorted[last][0], sorted[last][3] || 0)
    for (let k = 0; k < sides; k++) {
      index.push(bottom, at(0, k), at(0, k + 1))
      index.push(top, at(last, k + 1), at(last, k))
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    )
    geometry.setIndex(index)
    geometry.computeVertexNormals()
    return geometry
  })
}

// A print overlay on loft(rings, sides), with no caps and with UVs that
// span the part: from its lowest ring to its highest, and either across the
// front half (front: from +X round to -X, projected straight on, so the
// canvas spans the widest ring) or once all round (wrap). A print follows
// the body's facets.
function printLoft(
  rings: readonly RingInput[],
  sides: number,
  wrap: boolean
): THREE.BufferGeometry {
  return cached(`print|${sides}|${wrap}|${JSON.stringify(rings)}`, () => {
    const sorted = [...rings].sort((a, b) => a[0] - b[0])
    const bottom = sorted[0][0]
    const height = sorted[sorted.length - 1][0] - bottom
    const width = 2 * Math.max(...sorted.map((ring) => ring[1]))
    // A wrap repeats the first column at the end, so the seam has its own UVs.
    const around = wrap ? sides + 1 : sides / 2 + 1
    const positions: number[] = []
    const uvs: number[] = []
    const index: number[] = []
    for (const [y, rx, rz, cz = 0] of sorted) {
      for (let k = 0; k < around; k++) {
        const a = (k / sides) * Math.PI * 2
        const x = Math.cos(a) * rx
        positions.push(x, y, Math.sin(a) * rz + cz)
        uvs.push(wrap ? k / sides : 0.5 + x / width, (y - bottom) / height)
      }
    }
    const at = (i: number, k: number) => i * around + k
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let k = 0; k < around - 1; k++) {
        index.push(at(i, k), at(i + 1, k), at(i + 1, k + 1))
        index.push(at(i, k), at(i + 1, k + 1), at(i, k + 1))
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    )
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(index)
    geometry.computeVertexNormals()
    return geometry
  })
}

// How far forward the head or the hair cap reaches at (x, y) in the neck's
// space: the larger of the two smooth lofts through their rings. The real
// facets sit inside this, so anything laid on it stays outside the head.
function headFront(x: number, y: number): number {
  let front = 0
  for (const rings of [HEAD, HAIR]) {
    for (let i = 0; i < rings.length - 1; i++) {
      const [y0, rx0, rz0, cz0 = 0] = rings[i]
      const [y1, rx1, rz1, cz1 = 0] = rings[i + 1]
      if (y < y0 || y > y1) continue
      const t = (y - y0) / (y1 - y0)
      const rx = rx0 + (rx1 - rx0) * t
      const rz = rz0 + (rz1 - rz0) * t
      const cz = cz0 + (cz1 - cz0) * t
      const across = Math.max(0, 1 - (x / rx) ** 2)
      front = Math.max(front, cz + rz * Math.sqrt(across))
    }
  }
  return front
}

// A crescent of hair, 0.012 m thick, laid on the head: an arch over a circle
// of the given radius, widest at the apex and pointed at both ends, with its
// apex at `at` and turned `turn` about Z. Every point sits `lift` in front
// of the head or hair cap, so the crescent follows the forehead round.
const CRESCENT_SEGMENTS = 12
const CRESCENT_DEPTH = 0.012
function crescent(one: Crescent): THREE.BufferGeometry {
  return cached(`crescent|${JSON.stringify(one)}`, () => {
    const { at, turn, radius, sweep, width, lift } = one
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)
    const positions: number[] = []
    // Four vertices per step: outer and inner edge, back and front.
    for (let i = 0; i <= CRESCENT_SEGMENTS; i++) {
      const t = i / CRESCENT_SEGMENTS
      const a = Math.PI / 2 + sweep / 2 - sweep * t
      for (const side of [1, -1]) {
        const r = radius + side * (width / 2) * Math.sin(Math.PI * t)
        const lx = Math.cos(a) * r
        const ly = Math.sin(a) * r - radius
        const x = at[0] + lx * cos - ly * sin
        const y = at[1] + lx * sin + ly * cos
        const z = headFront(x, y) + lift
        positions.push(x, y, z, x, y, z + CRESCENT_DEPTH)
      }
    }
    // Vertex k of step i: 0 outer back, 1 outer front, 2 inner back,
    // 3 inner front.
    const v = (i: number, k: number) => i * 4 + k
    const index: number[] = []
    const quad = (p: number, q: number, r: number, s: number) => {
      index.push(p, q, r, p, r, s)
    }
    for (let i = 0; i < CRESCENT_SEGMENTS; i++) {
      const j = i + 1
      quad(v(i, 3), v(j, 3), v(j, 1), v(i, 1)) // front, facing +Z
      quad(v(i, 2), v(i, 0), v(j, 0), v(j, 2)) // back
      quad(v(i, 0), v(i, 1), v(j, 1), v(j, 0)) // outer edge
      quad(v(i, 2), v(j, 2), v(j, 3), v(i, 3)) // inner edge
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    )
    geometry.setIndex(index)
    geometry.computeVertexNormals()
    return geometry
  })
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return cached(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d))
}

// A boot: a box whose toe end is lower and narrower.
function boot(): THREE.BufferGeometry {
  return cached('boot', () => {
    const geometry = new THREE.BoxGeometry(0.11, 0.1, 0.25)
    const pos = geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > 0) {
        pos.setX(i, pos.getX(i) * 0.8)
        if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) - 0.04)
      }
    }
    geometry.computeVertexNormals()
    return geometry
  })
}

// Ring y values scale with a limb's length; widths stay.
function stretch(rings: readonly RingInput[], s: number): LoftRing[] {
  return rings.map(([y, rx, rz, cz = 0]): LoftRing => [y * s, rx, rz, cz])
}

// Rings fattened by s across and front to back, for baggy pants and a
// loose shirt.
function widen(rings: readonly RingInput[], s: number): LoftRing[] {
  return rings.map(([y, rx, rz, cz = 0]): LoftRing => [y, rx * s, rz * s, cz])
}

function part(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  color: string,
  x = 0,
  y = 0,
  z = 0
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material(color))
  mesh.position.set(x, y, z)
  parent.add(mesh)
  return mesh
}

function pivot(
  parent: THREE.Object3D,
  joints: Partial<Record<JointName, THREE.Group>>,
  name: JointName,
  x: number,
  y: number,
  z: number
): THREE.Group {
  const node = new THREE.Group()
  node.name = name
  node.position.set(x, y, z)
  parent.add(node)
  joints[name] = node
  return node
}

// Shapes in each joint's space. Limbs hang down (negative y) from their
// pivot; the torso and head rise from theirs.
// The front stays behind the thigh fronts below the waist, so the crotch
// tucks in between the legs; the back keeps its full seat.
const PELVIS: RingInput[] = [
  [0.07, 0.15, 0.1],
  [-0.03, 0.175, 0.1, -0.015],
  [-0.11, 0.13, 0.08, -0.035],
]
const TORSO: RingInput[] = [
  [0, 0.145, 0.095],
  [0.14, 0.16, 0.105, 0.005],
  [0.3, 0.195, 0.12, 0.015],
  [0.43, 0.205, 0.105, 0],
  [0.5, 0.09, 0.07, -0.005],
]
const NECK: RingInput[] = [
  [-0.02, 0.05, 0.05],
  [0.09, 0.045, 0.05, 0.005],
]
const HEAD: RingInput[] = [
  [0.07, 0.05, 0.05, 0.03],
  [0.1, 0.075, 0.085, 0.02],
  [0.17, 0.088, 0.1, 0.005],
  [0.23, 0.092, 0.106, 0],
  [0.28, 0.078, 0.092, -0.005],
  [0.305, 0.035, 0.045, -0.01],
]
const HAIR: RingInput[] = [
  [0.19, 0.097, 0.11, -0.012],
  [0.27, 0.094, 0.108, -0.006],
  [0.315, 0.05, 0.06, -0.01],
]
const UPPER_ARM: RingInput[] = [
  [0.02, 0.05, 0.056],
  [-0.08, 0.05, 0.055],
  [-0.32, 0.038, 0.042],
]
// A t-shirt sleeve over the top third of the upper arm, a little proud of
// it and flared at the opening.
const SHORT_SLEEVE: RingInput[] = [
  [0.03, 0.056, 0.062],
  [-0.06, 0.056, 0.061],
  [-0.12, 0.055, 0.06],
]
// An oversized top's hem, in the pelvis's space: shirt cloth from the
// waist (the torso's lowest ring) down over the hips and the seat, boxy
// enough that baggy thighs stay inside it through the walk cycle.
const LOOSE_HEM: RingInput[] = [
  [0.07, 0.145, 0.095],
  [-0.04, 0.185, 0.12, 0],
  [-0.14, 0.195, 0.145, 0],
]
const FOREARM: RingInput[] = [
  [0.01, 0.04, 0.042],
  [-0.08, 0.045, 0.047],
  [-0.28, 0.029, 0.032],
]
// Flipper hand: one mitten, flat across the palm.
const HAND: RingInput[] = [
  [0, 0.022, 0.035],
  [-0.07, 0.02, 0.045],
  [-0.13, 0.012, 0.03],
]
const THIGH: RingInput[] = [
  [0.02, 0.085, 0.09],
  [-0.16, 0.08, 0.085],
  [-0.44, 0.05, 0.055],
]
const SHIN: RingInput[] = [
  [0.01, 0.05, 0.055],
  [-0.11, 0.055, 0.062, -0.012],
  [-0.38, 0.034, 0.038],
]

// head: false hides the head and everything on the neck, for the
// first-person player body.
export function buildFigure(
  outfitId: OutfitId,
  { head = true, guitarFinish }: FigureOptions = {}
): Figure {
  const outfit = outfitById(outfitId)
  const c = outfit.colors
  const arm = outfit.proportions?.arm ?? 1
  const leg = outfit.proportions?.leg ?? 1
  const upperArm = 0.32 * arm
  const foreArm = 0.28 * arm
  const thigh = 0.44 * leg
  const shin = 0.38 * leg
  const baggy = outfit.baggy ?? 1
  const loose = outfit.loose ?? 1
  const hipY = 0.08 + shin + thigh + 0.05

  const group = new THREE.Group()
  group.name = `figure-${outfitId}`
  const built: Partial<Record<JointName, THREE.Group>> = {}

  const pelvis = pivot(group, built, 'pelvis', 0, hipY, 0)

  // A part, with the outfit's pattern for its cloth wrapped round it, and
  // the outfit's print for it laid over the top.
  const printed = (
    parent: THREE.Object3D,
    rings: readonly RingInput[],
    sides: number,
    color: string,
    at: PrintPart | null,
    cloth: PatternPart | null = null
  ) => {
    part(parent, loft(rings, sides), color)
    const pattern = cloth && outfit.patterns?.[cloth]
    if (pattern) {
      parent.add(
        new THREE.Mesh(
          printLoft(rings, sides, true),
          decalMaterial(outfitId, [pattern], true)
        )
      )
    }
    const layers = at && outfit.prints?.[at]
    if (!layers?.length) return
    parent.add(
      new THREE.Mesh(
        printLoft(rings, sides, at === 'arm'),
        decalMaterial(outfitId, layers, true)
      )
    )
  }

  printed(pelvis, PELVIS, 8, c.pants, null, 'pants')

  const spine = pivot(pelvis, built, 'spine', 0, 0.07, 0)
  printed(spine, widen(TORSO, loose), 8, c.shirt, 'torso', 'shirt')
  // A loose top hangs over the hips, on the pelvis so it stays with the
  // seat; it takes the shirt's pattern, like every shirt part.
  if (outfit.loose) {
    printed(pelvis, widen(LOOSE_HEM, loose), 8, c.shirt, null, 'shirt')
  }

  const neck = pivot(spine, built, 'neck', 0, 0.48, 0)
  part(neck, loft(NECK), c.skin)
  part(neck, loft(HEAD, 8), c.skin)
  // The hair cap has the head's 8 sides: with 6, the middle of each facet
  // dipped inside the head and the skin showed through.
  part(neck, loft(HAIR, 8), outfit.shaved ? c.skin : c.hair)
  // A nose and a brow line: enough for a face to read at PS1 resolution.
  part(neck, box(0.026, 0.045, 0.03), c.skin, 0, 0.17, 0.1)
  part(neck, box(0.13, 0.014, 0.02), c.hair, 0, 0.215, 0.098)
  neck.visible = head

  const sides: ['L' | 'R', number][] = [
    ['L', 1],
    ['R', -1],
  ]
  for (const [side, sign] of sides) {
    const shoulder = pivot(
      spine,
      built,
      `shoulder${side}`,
      0.18 * sign,
      0.42,
      0
    )
    // Bare arm parts take the skin color, and an arm print. A short sleeve
    // covers the top of a bare upper arm, the way a t-shirt does. Long
    // sleeves are the arm parts themselves, so a loose top widens them.
    const bare = Boolean(outfit.sleeves)
    const skinOrShirt = bare ? c.skin : c.shirt
    const sleeve = bare ? 1 : loose
    printed(
      shoulder,
      widen(stretch(UPPER_ARM, arm), sleeve),
      6,
      skinOrShirt,
      bare ? 'arm' : null,
      bare ? null : 'shirt'
    )
    if (outfit.sleeves === 'short') {
      part(shoulder, loft(stretch(SHORT_SLEEVE, arm)), c.shirt)
    }
    const elbow = pivot(shoulder, built, `elbow${side}`, 0, -upperArm, 0)
    printed(
      elbow,
      widen(stretch(FOREARM, arm), sleeve),
      6,
      skinOrShirt,
      bare ? 'arm' : null,
      bare ? null : 'shirt'
    )
    part(elbow, loft(HAND), c.skin, 0, -foreArm, 0)
    part(elbow, box(0.025, 0.05, 0.025), c.skin, 0, -foreArm - 0.035, 0.04)
    // The bat hangs from the right hand, gripped just above the knob, its
    // barrel swung a little forward of the leg.
    if (side === 'R' && outfit.inHand === 'bat') {
      const bat = buildBat()
      bat.position.set(0, -foreArm - 0.075, 0.01)
      bat.rotation.set(-0.18, 0, 0)
      elbow.add(bat)
    }

    const hip = pivot(pelvis, built, `hip${side}`, 0.09 * sign, -0.05, 0)
    const thighRings = widen(stretch(THIGH, leg), baggy)
    printed(hip, thighRings, 6, c.pants, 'thigh', 'pants')
    const knee = pivot(hip, built, `knee${side}`, 0, -thigh, 0)
    const shinRings = widen(stretch(SHIN, leg), baggy)
    printed(knee, shinRings, 6, c.pants, null, 'pants')
    part(knee, boot(), c.boots, 0, -shin - 0.03, 0.045)
  }

  // The guitar hangs on the back with its strings out, the body at the left
  // hip and the neck up behind the right shoulder.
  let guitar: Guitar | undefined
  if (outfit.onBack === 'guitar') {
    guitar = buildGuitar(guitarFinish)
    guitar.group.position.set(0.07, -0.03, -0.155)
    guitar.group.rotation.set(0, Math.PI, -0.45)
    spine.add(guitar.group)
  }

  // Every joint in JOINTS now has its pivot.
  const joints = built as Record<JointName, THREE.Group>

  for (const id of outfit.addons || []) {
    const addon = ADDONS[id]
    if ('crescents' in addon) {
      for (const one of addon.crescents) {
        part(joints[addon.joint], crescent(one), c[addon.slot] as string)
      }
      continue
    }
    const geometry =
      'rings' in addon ? loft(addon.rings, addon.sides) : box(...addon.box)
    const spots: Vec3[] = addon.offsets || [addon.offset || [0, 0, 0]]
    for (const at of spots) {
      // An add-on slot the outfit leaves out has no color, as before.
      const mesh = part(
        joints[addon.joint],
        geometry,
        c[addon.slot] as string,
        ...at
      )
      if (addon.rotation) mesh.rotation.set(...addon.rotation)
      // BoxGeometry faces run +X, -X, +Y, -Y, +Z, -Z; the decal takes +Z.
      if ('decal' in addon && addon.decal) {
        const plain = mesh.material as THREE.MeshLambertMaterial
        mesh.material = [
          plain,
          plain,
          plain,
          plain,
          decalMaterial(outfitId, [addon.decal]),
          plain,
        ]
      }
    }
  }

  // Every figure throws a shadow under the station lights.
  castShadows(group)
  return { group, joints, hipY, guitar }
}

// Copy a samplePose() result onto a figure's pivots.
export function applyPose(figure: Figure, pose: PoseSample): void {
  for (const joint of JOINTS) {
    figure.joints[joint].rotation.set(...pose.joints[joint])
  }
  figure.joints.pelvis.position.y = figure.hipY + pose.lift
}

// An open paperback held in front of the chest, where the read pose
// (poses.ts) brings both hands and the eyes. It rides the spine, so it
// stays level with the chest and the hands reach it; hide it when the
// figure is not reading. Turned about the spine so its pages face the
// figure, then tipped back, top away and pages up toward the eyes.
export function attachBook(figure: Figure): THREE.Group {
  const book = buildBook()
  book.position.set(0, 0.2, 0.37)
  book.rotation.set(0.8, Math.PI, 0)
  castShadows(book)
  figure.joints.spine.add(book)
  return book
}

// A lit cigarette in the corner of the mouth: paper, an ember that glows
// harder on each drag, and smoke wisps that rise and fade. Returns
// { update(t) }; call it every frame with a running time in seconds.
let emberGlow: THREE.Texture | null = null
let smokeTexture: THREE.Texture | null = null
export function attachCigarette(figure: Figure): CigaretteRig {
  const neck = figure.joints.neck
  const holder = new THREE.Group()
  holder.position.set(-0.03, 0.115, 0.1)
  holder.rotation.set(0.35, -0.3, 0)
  neck.add(holder)
  part(holder, box(0.008, 0.008, 0.075), '#ece8de', 0, 0, 0.035)

  const emberMat = new THREE.MeshBasicMaterial({ color: '#ff7a2a' })
  const ember = new THREE.Mesh(box(0.01, 0.01, 0.012), emberMat)
  ember.position.z = 0.076
  holder.add(ember)
  emberGlow ??= makeGlowTexture('rgba(255, 140, 60, 0.8)')
  const glow = makeGlowSprite(emberGlow, 0.1)
  glow.position.z = 0.078
  holder.add(glow)

  smokeTexture ??= makeGlowTexture('rgba(190, 196, 206, 0.5)')
  const wisps: THREE.Sprite[] = []
  for (let i = 0; i < 3; i++) {
    const wisp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: smokeTexture,
        transparent: true,
        depthWrite: false,
      })
    )
    neck.add(wisp)
    wisps.push(wisp)
  }
  const tip = new THREE.Vector3(-0.052, 0.1, 0.168)

  return {
    update(t: number) {
      // A drag every six seconds, held for one.
      const drag =
        Math.max(0, Math.sin(((t % 6) / 6) * Math.PI * 12)) *
        (t % 6 < 1 ? 1 : 0)
      glow.scale.setScalar(0.08 + drag * 0.08)
      emberMat.color.set(drag > 0.3 ? '#ffb15a' : '#ff7a2a')
      for (let i = 0; i < wisps.length; i++) {
        const life = (t * 0.5 + i / wisps.length) % 1
        const wisp = wisps[i]
        wisp.position.set(
          tip.x + Math.sin(t * 1.3 + i) * 0.03 * life,
          tip.y + life * 0.45,
          tip.z - life * 0.05
        )
        wisp.scale.setScalar(0.05 + life * 0.18)
        wisp.material.opacity = 0.45 * (1 - life)
      }
    },
  }
}

// Gron as he stands by the berry bush: hunched, under his raincloud. The
// cloud sits beside the figure, not on it, so the ring that marks him as
// the one E talks to (glow.ts) goes round his body alone. Call update(t)
// every frame with a running time, for the rain.
export interface GronRig {
  group: THREE.Group
  figure: Figure
  update(t: number): void
}

// The cloud's underside, metres above the ground he stands on: clear of
// his stooped head, low enough to read as his. The stoop carries his head
// forward of his feet, so the cloud rides forward with it.
export const GRON_CLOUD_HEIGHT = 2.4
const GRON_CLOUD_FORWARD = 0.3

export function buildGron(): GronRig {
  const group = new THREE.Group()
  group.name = 'gron'
  const figure = buildFigure('gron')
  applyPose(figure, samplePose('hunch'))
  group.add(figure.group)
  const cloud = buildRaincloud(GRON_CLOUD_HEIGHT)
  cloud.group.position.set(0, GRON_CLOUD_HEIGHT, GRON_CLOUD_FORWARD)
  group.add(cloud.group)
  return { group, figure, update: (t) => cloud.update(t) }
}
