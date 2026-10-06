// Pure: every character outfit in one table. An outfit colors the shared
// body (figure.ts) by slot, adds optional parts from ADDONS, and can stretch
// limbs with proportions. Edit characters here; the body stays the same.

import { copy } from './copy.ts'
import type { Vec3 } from './interfaces.ts'
import type { JointName } from './poses.ts'

// Every outfit colors these; add-ons may use more slots (coat, glasses).
export const BODY_SLOTS = ['skin', 'hair', 'shirt', 'pants', 'boots'] as const

export type BodySlot = (typeof BODY_SLOTS)[number]
export type ColorSlot =
  | BodySlot
  | 'coat'
  | 'glasses'
  | 'buckle'
  | 'belt'
  | 'stubble'
  | 'hat'
  | 'straps'
  | 'sockets'

// Painted art printed on a part; decalart.ts paints each one.
export type DecalId =
  | 'suicide-silence'
  | 'russ'
  | 'torn-tank'
  | 'torn-jeans'
  | 'sleeve-tattoo'
  | 'chest-tattoo'
  | 'pantera'
  | 'guitar-strap'
  | 'as-i-lay-dying'
  | 'plaid'
  | 'nin'
  | 'camo'
  | 'baja'
  | 'tattered'

// Where an outfit prints a decal over the body: across the torso front,
// across the front of both thighs, or all round both bare arms.
export type PrintPart = 'torso' | 'thigh' | 'arm'

// Cloth a pattern wraps: every shirt part (the torso, long sleeves, a
// loose hem) or every pants part (the pelvis, the thighs, the shins).
export type PatternPart = 'shirt' | 'pants'

// One loft ring: [y, rx, rz, cz] — height, half-width, half-depth and
// forward shift, in metres.
export type LoftRing = [number, number, number, number]

interface AddonBase {
  joint: JointName
  slot: ColorSlot
  offset?: Vec3
  offsets?: Vec3[]
  // Euler angles in radians, in the joint's space.
  rotation?: Vec3
}

export interface LoftAddon extends AddonBase {
  rings: LoftRing[]
  sides?: number
}

export interface BoxAddon extends AddonBase {
  box: Vec3
  // Painted on the front (+Z) face; the other faces take the slot color.
  decal?: DecalId
}

// One crescent: an arch of hair laid on the head, with its apex at `at`
// (x, y in the neck's space) and turned `turn` radians about Z. It follows a
// circle of the given radius for `sweep` radians, is `width` across in the
// middle, and comes to a point at both ends. figure.ts wraps it onto the
// head and hair cap, `lift` metres in front of them: a larger lift stacks a
// crescent over its neighbours.
export interface Crescent {
  at: [number, number]
  turn: number
  radius: number
  sweep: number
  width: number
  lift: number
}

// Crescents stacked as one add-on, on the neck joint.
export interface CrescentAddon extends AddonBase {
  crescents: Crescent[]
}

export type Addon = LoftAddon | BoxAddon | CrescentAddon

export type AddonId =
  | 'beard'
  | 'goatee'
  | 'mustache'
  | 'dreadlocks'
  | 'glasses'
  | 'glasses-arms'
  | 'coat-hem'
  | 'hood'
  | 'buckle'
  | 'long-hair'
  | 'belt'
  | 'belt-loops'
  | 'big-beard'
  | 'stubble'
  | 'fringe'
  | 'emo-hair'
  | 'fringe-fill'
  | 'hair-spikes-long'
  | 'hair-spikes-short'
  | 'beret'
  | 'bandana'
  | 'bandana-knot'
  | 'bandana-tails'
  | 'hood-down'
  | 'kangaroo-pocket'
  | 'chin-wisps'
  | 'hump'
  | 'cloak-hem'
  | 'eye-sockets'
  | 'nose-hole'
  | 'mouth'
  | 'teeth'
  | 'chest-strap-high'
  | 'chest-strap-low'
  | 'strap-buckles'
  | 'arm-straps-l'
  | 'arm-straps-r'
  | 'cuff-straps-l'
  | 'cuff-straps-r'
  | 'thigh-straps-l'
  | 'thigh-straps-r'
  | 'trench-hem'
  | 'bandolier'
  | 'collar-strap'
  | 'hem-strap-high'
  | 'hem-strap-low'
  | 'hem-buckles'
  | 'tatters-long'
  | 'tatters-short'

export type LimbGroup = 'arm' | 'leg'

export interface Outfit {
  label: string
  colors: Record<BodySlot, string> & Partial<Record<ColorSlot, string>>
  addons: AddonId[]
  proportions?: Partial<Record<LimbGroup, number>>
  // 'short' leaves the forearms bare, for a t-shirt; 'none' leaves the
  // whole arm bare, for a tank top.
  sleeves?: 'short' | 'none'
  // true draws the hair cap in the skin color, for a shaved head.
  shaved?: boolean
  // A prop slung on the back; figure.ts places it.
  onBack?: 'guitar'
  // A prop held in the right hand; figure.ts places it.
  inHand?: 'bat'
  // A pattern per cloth, wrapped all round every part of it and painted
  // under the prints.
  patterns?: Partial<Record<PatternPart, DecalId>>
  // Widens the legs of the pants (1 = the base body), for baggy jeans.
  baggy?: number
  // Widens the torso and any long sleeves (1 = the base body) and drops
  // the hem over the hips, for an oversized tee or hoodie.
  loose?: number
  // Each part's prints, painted in order (decalart.ts paintPrints).
  prints?: Partial<Record<PrintPart, DecalId[]>>
}

export type OutfitId =
  | 'marx'
  | 'player'
  | 'shadow'
  | 'coleman'
  | 'kvistad'
  | 'church'
  | 'hanson'
  | 'halatek'
  | 'jdogg'
  | 'carlsten'
  | 'gron'
  | 'moab'

// Dreadlocks hang from a ring round the back and sides of the head, leaving
// the face clear. Angles are around the head from +X toward +Z (the face).
const LOC_ANGLES = [-20, 0, 20, 160, 180, 200, 220, 245, 270, 295, 320, 340]
const LOC_ROOTS = LOC_ANGLES.map((deg): Vec3 => {
  const a = (deg * Math.PI) / 180
  return [Math.cos(a) * 0.09, 0.27, Math.sin(a) * 0.1 - 0.012]
})

// Belt loops stand on the belt in pairs: two at the front, one at each hip,
// two at the back. Angles are around the waist from +X toward +Z (the front).
const LOOP_ANGLES = [55, 125, 0, 180, 240, 300]
const LOOP_SPOTS = LOOP_ANGLES.map((deg): Vec3 => {
  const a = (deg * Math.PI) / 180
  return [Math.cos(a) * 0.167, 0.039, Math.sin(a) * 0.11 - 0.005]
})

// Spikes hang from just inside the emo-hair hem, round the back and sides
// and clear of the face; long and short ones alternate. Angles are around
// the head from +X toward +Z (the face).
const hemSpots = (angles: number[]) =>
  angles.map((deg): Vec3 => {
    const a = (deg * Math.PI) / 180
    return [Math.cos(a) * 0.077, 0.048, Math.sin(a) * 0.063 - 0.05]
  })
const LONG_SPIKE_SPOTS = hemSpots([-10, 30, 150, 190, 220, 250, 280, 310, 340])
const SHORT_SPIKE_SPOTS = hemSpots([10, 170, 205, 235, 265, 295, 325])

// Wisps hang from under the jaw in an uneven row, a few too far apart to
// meet: the beard that never filled in.
const WISP_SPOTS: Vec3[] = [
  [-0.05, 0.05, 0.05],
  [-0.018, 0.04, 0.066],
  [0.012, 0.038, 0.068],
  [0.052, 0.048, 0.048],
]

// A strap round a limb: a thin band just proud of it, placed by offsets
// down the limb. Its rings straddle y 0, so an offset sets its height.
const limbBand = (rx: number, rz: number): LoftRing[] => [
  [0.015, rx, rz, 0],
  [-0.015, rx, rz, 0],
]

// Ragged shreds of a coat's hem hang from round its bottom ring (the
// trench-hem's, at y -0.66), long and short in turn, a little uneven.
// Angles are around the waist from +X toward +Z (the front).
const hemSpot = (deg: number, drop: number): Vec3 => {
  const a = (deg * Math.PI) / 180
  return [Math.cos(a) * 0.235, -0.64 - drop, Math.sin(a) * 0.17 - 0.02]
}
const LONG_TATTER_SPOTS = [10, 70, 115, 160, 215, 250, 300, 335].map((deg, i) =>
  hemSpot(deg, (i % 3) * 0.01)
)
const SHORT_TATTER_SPOTS = [40, 95, 135, 190, 235, 275, 320].map((deg, i) =>
  hemSpot(deg + 4, (i % 2) * 0.012)
)

// Extra parts on the body. joint names a pivot from poses.ts JOINTS; slot
// picks the color. A part is either a loft (rings of [y, rx, rz, cz]: height,
// half-width, half-depth and forward shift, in metres, the same shape
// language as the body in figure.ts; sides defaults to 6) or a box (size).
// offset places it in the joint's space; offsets places one copy at each.
export const ADDONS: Record<AddonId, Addon> = {
  beard: {
    joint: 'neck',
    slot: 'hair',
    rings: [
      [0.06, 0.045, 0.05, 0.045],
      [0.1, 0.085, 0.095, 0.02],
      [0.16, 0.093, 0.108, 0.005],
    ],
  },
  // A full beard from under the nose down onto the chest, tapering to a
  // point. The lower rings move forward, so the beard stays in front of the
  // chest and never wraps behind the neck.
  'big-beard': {
    joint: 'neck',
    slot: 'hair',
    sides: 8,
    rings: [
      [0.135, 0.086, 0.097, 0.012],
      [0.1, 0.104, 0.1, 0.035],
      [0.03, 0.1, 0.08, 0.05],
      [-0.06, 0.08, 0.065, 0.09],
      [-0.15, 0.042, 0.036, 0.13],
    ],
  },
  // A short beard: a thin layer round the jaw and the mouth, close to the
  // face, that runs a little below the chin. The rings sit forward, so the
  // back stays inside the head.
  stubble: {
    joint: 'neck',
    slot: 'stubble',
    sides: 8,
    rings: [
      [0.035, 0.034, 0.034, 0.062],
      [0.065, 0.058, 0.052, 0.05],
      [0.1, 0.08, 0.07, 0.04],
      [0.15, 0.09, 0.075, 0.03],
    ],
  },
  // An emo fringe: stacked crescents that sweep down from the +X side of
  // the forehead, across the -X eye, to a point on the cheek. Each one is
  // smaller and turned further than the one above it.
  fringe: {
    joint: 'neck',
    slot: 'hair',
    crescents: [
      {
        at: [0.02, 0.268],
        turn: 0.3,
        radius: 0.1,
        sweep: 1.5,
        width: 0.05,
        lift: 0.002,
      },
      {
        at: [-0.005, 0.242],
        turn: 0.45,
        radius: 0.085,
        sweep: 1.4,
        width: 0.046,
        lift: 0.004,
      },
      {
        at: [-0.025, 0.216],
        turn: 0.6,
        radius: 0.065,
        sweep: 1.3,
        width: 0.04,
        lift: 0.009,
      },
      {
        at: [-0.04, 0.19],
        turn: 0.75,
        radius: 0.048,
        sweep: 1.2,
        width: 0.032,
        lift: 0.007,
      },
      {
        at: [-0.052, 0.164],
        turn: 0.9,
        radius: 0.034,
        sweep: 1.1,
        width: 0.024,
        lift: 0.004,
      },
    ],
  },
  // A smaller crescent stacked behind the fringe on the -X side, so nothing
  // shows between the fringe and the side hair: it covers the -X brow and
  // eye. Its lift clears the brow line.
  'fringe-fill': {
    joint: 'neck',
    slot: 'hair',
    crescents: [
      {
        at: [-0.052, 0.21],
        turn: 0.6,
        radius: 0.065,
        sweep: 1.7,
        width: 0.08,
        lift: 0.007,
      },
      // Down the temple, to meet the side hair.
      {
        at: [-0.082, 0.215],
        turn: 1.3,
        radius: 0.06,
        sweep: 1.6,
        width: 0.06,
        lift: 0.003,
      },
    ],
  },
  // Jaw-length hair over the ears and the nape, round the back and sides.
  // Like long-hair, each ring sits back far enough to keep the face clear.
  'emo-hair': {
    joint: 'neck',
    slot: 'hair',
    sides: 8,
    rings: [
      [0.32, 0.065, 0.075, -0.015],
      [0.27, 0.103, 0.11, -0.018],
      [0.18, 0.106, 0.09, -0.035],
      [0.09, 0.1, 0.08, -0.045],
      [0.04, 0.085, 0.07, -0.05],
    ],
  },
  // Pointed clumps that break up the emo-hair hem.
  'hair-spikes-long': {
    joint: 'neck',
    slot: 'hair',
    sides: 4,
    rings: [
      [0.012, 0.02, 0.016, 0],
      [-0.055, 0.002, 0.002, 0],
    ],
    offsets: LONG_SPIKE_SPOTS,
  },
  'hair-spikes-short': {
    joint: 'neck',
    slot: 'hair',
    sides: 4,
    rings: [
      [0.012, 0.018, 0.014, 0],
      [-0.033, 0.002, 0.002, 0],
    ],
    offsets: SHORT_SPIKE_SPOTS,
  },
  // A chin beard only: narrow and forward, clear of the jaw line.
  goatee: {
    joint: 'neck',
    slot: 'hair',
    rings: [
      [0.055, 0.022, 0.03, 0.068],
      [0.085, 0.036, 0.04, 0.07],
      [0.125, 0.034, 0.035, 0.074],
    ],
  },
  // The goatee's upper lip, under the nose.
  mustache: {
    joint: 'neck',
    slot: 'hair',
    box: [0.06, 0.014, 0.02],
    offset: [0, 0.137, 0.1],
  },
  dreadlocks: {
    joint: 'neck',
    slot: 'hair',
    sides: 4,
    rings: [
      [0, 0.019, 0.019, 0],
      [-0.16, 0.017, 0.017, 0],
      [-0.31, 0.011, 0.011, 0],
    ],
    offsets: LOC_ROOTS,
  },
  glasses: {
    joint: 'neck',
    slot: 'glasses',
    box: [0.052, 0.036, 0.012],
    offsets: [
      [0.036, 0.198, 0.106],
      [-0.036, 0.198, 0.106],
    ],
  },
  'glasses-arms': {
    joint: 'neck',
    slot: 'glasses',
    box: [0.008, 0.012, 0.11],
    offsets: [
      [0.088, 0.204, 0.05],
      [-0.088, 0.204, 0.05],
    ],
  },
  'coat-hem': {
    joint: 'pelvis',
    slot: 'coat',
    rings: [
      [0.06, 0.17, 0.12, 0],
      [-0.12, 0.2, 0.14, 0],
      [-0.3, 0.215, 0.155, -0.01],
    ],
  },
  // A belt buckle on the front of the waistband.
  buckle: {
    joint: 'pelvis',
    slot: 'buckle',
    box: [0.075, 0.048, 0.012],
    offset: [0, 0.035, 0.108],
    decal: 'russ',
  },
  // Straight hair from the crown to the shoulders, round the back and sides.
  // Each ring sits back far enough that the face stays clear.
  // A belt round the top of the pants, just proud of the pelvis at every
  // facet (the same 8 sides).
  belt: {
    joint: 'pelvis',
    slot: 'belt',
    sides: 8,
    rings: [
      [0.016, 0.169, 0.107, -0.008],
      [0.062, 0.159, 0.107, -0.002],
    ],
  },
  // Loops of pants cloth over the belt, a little taller than it.
  'belt-loops': {
    joint: 'pelvis',
    slot: 'pants',
    box: [0.012, 0.056, 0.012],
    offsets: LOOP_SPOTS,
  },
  'long-hair': {
    joint: 'neck',
    slot: 'hair',
    sides: 8,
    rings: [
      [0.32, 0.06, 0.07, -0.015],
      [0.27, 0.1, 0.105, -0.02],
      [0.18, 0.104, 0.085, -0.04],
      [0.06, 0.106, 0.075, -0.05],
      [-0.06, 0.112, 0.07, -0.055],
    ],
  },
  // A beret: a soft disc wider than the head, cocked to one side and a
  // little back. The rings are about the crown; offset and rotation set it
  // there, low enough that its brim meets the hair all round.
  beret: {
    joint: 'neck',
    slot: 'hat',
    sides: 8,
    rings: [
      [-0.02, 0.098, 0.11, 0],
      [0.02, 0.126, 0.132, 0],
      [0.045, 0.12, 0.126, 0],
      [0.062, 0.055, 0.06, 0],
    ],
    offset: [0, 0.27, -0.012],
    rotation: [-0.12, 0, 0.2],
  },
  // A bandana tied round the head: a band over the forehead and round the
  // hair cap, just above the brow line, with the hair spilling over its
  // top. Each ring sits a little proud of the head and the cap.
  bandana: {
    joint: 'neck',
    slot: 'hat',
    sides: 8,
    rings: [
      [0.225, 0.102, 0.118, -0.006],
      [0.268, 0.1, 0.114, -0.006],
    ],
  },
  // The knot at the back of the band.
  'bandana-knot': {
    joint: 'neck',
    slot: 'hat',
    box: [0.04, 0.03, 0.03],
    offset: [0, 0.245, -0.125],
  },
  // Two tails hanging from the knot, down the back of the head.
  'bandana-tails': {
    joint: 'neck',
    slot: 'hat',
    sides: 4,
    rings: [
      [0.01, 0.02, 0.006, 0],
      [-0.1, 0.016, 0.004, 0],
      [-0.17, 0.006, 0.002, 0],
    ],
    offsets: [
      [0.018, 0.235, -0.118],
      [-0.018, 0.235, -0.118],
    ],
  },
  // A hoodie's hood, down: bunched at the nape and drooping over the
  // upper back, behind the torso. In the spine's space, in the shirt's
  // color, so it is the same cloth as the body.
  'hood-down': {
    joint: 'spine',
    slot: 'shirt',
    sides: 8,
    rings: [
      [0.34, 0.09, 0.03, -0.15],
      [0.42, 0.14, 0.055, -0.165],
      [0.49, 0.15, 0.06, -0.15],
      [0.55, 0.11, 0.05, -0.1],
      [0.59, 0.06, 0.035, -0.07],
    ],
  },
  // The kangaroo pocket across the belly, just proud of the torso.
  'kangaroo-pocket': {
    joint: 'spine',
    slot: 'shirt',
    box: [0.24, 0.11, 0.03],
    offset: [0, 0.1, 0.115],
  },
  // Thin, uneven wisps under the chin, in the hair color.
  'chin-wisps': {
    joint: 'neck',
    slot: 'hair',
    sides: 4,
    rings: [
      [0.012, 0.013, 0.011, 0],
      [-0.055, 0.003, 0.003, 0.012],
    ],
    offsets: WISP_SPOTS,
  },
  hood: {
    joint: 'neck',
    slot: 'coat',
    rings: [
      [0.02, 0.1, 0.1, -0.02],
      [0.12, 0.115, 0.125, -0.01],
      [0.24, 0.115, 0.13, 0],
      [0.33, 0.07, 0.085, -0.01],
    ],
  },
  // A hunchback: a lump of cloak over the upper back, behind the torso and
  // highest between the shoulder blades. In the spine's space, so it bends
  // with the stoop.
  hump: {
    joint: 'spine',
    slot: 'coat',
    sides: 8,
    rings: [
      [0.16, 0.09, 0.05, -0.1],
      [0.28, 0.17, 0.13, -0.17],
      [0.4, 0.19, 0.16, -0.2],
      [0.51, 0.16, 0.13, -0.19],
      [0.6, 0.08, 0.06, -0.13],
    ],
  },
  // A cloak's skirt, from the waist to the shins, flaring as it falls.
  'cloak-hem': {
    joint: 'pelvis',
    slot: 'coat',
    sides: 8,
    rings: [
      [0.06, 0.175, 0.125, 0],
      [-0.2, 0.215, 0.155, 0],
      [-0.5, 0.245, 0.175, -0.01],
      [-0.74, 0.27, 0.19, -0.02],
    ],
  },
  // A skull's face, laid on the bone-colored head: two eye sockets, the
  // hole where the nose was, and a mouth of bare teeth.
  'eye-sockets': {
    joint: 'neck',
    slot: 'sockets',
    box: [0.038, 0.034, 0.014],
    offsets: [
      [0.036, 0.198, 0.101],
      [-0.036, 0.198, 0.101],
    ],
  },
  // Over the front of the nose, so the nose reads as a hole.
  'nose-hole': {
    joint: 'neck',
    slot: 'sockets',
    box: [0.03, 0.036, 0.008],
    offset: [0, 0.165, 0.117],
  },
  mouth: {
    joint: 'neck',
    slot: 'sockets',
    box: [0.072, 0.03, 0.012],
    offset: [0, 0.118, 0.1],
  },
  // A row of teeth across the mouth, a little proud of it.
  teeth: {
    joint: 'neck',
    slot: 'skin',
    box: [0.009, 0.024, 0.006],
    offsets: [-0.027, -0.0135, 0, 0.0135, 0.027].map((x): Vec3 => [
      x,
      0.118,
      0.108,
    ]),
  },
  // Straps buckled round the trench at the chest and the ribs, each just
  // proud of the torso through its band.
  'chest-strap-high': {
    joint: 'spine',
    slot: 'straps',
    sides: 8,
    rings: [
      [0.305, 0.207, 0.127, 0.013],
      [0.335, 0.209, 0.128, 0.012],
    ],
  },
  'chest-strap-low': {
    joint: 'spine',
    slot: 'straps',
    sides: 8,
    rings: [
      [0.165, 0.179, 0.119, 0.008],
      [0.195, 0.181, 0.121, 0.008],
    ],
  },
  // An iron buckle on the front of each chest strap.
  'strap-buckles': {
    joint: 'spine',
    slot: 'buckle',
    box: [0.036, 0.032, 0.012],
    offsets: [
      [0, 0.32, 0.141],
      [0, 0.18, 0.13],
    ],
  },
  // Two straps round each sleeve above the elbow, one at each wrist, and
  // one round each thigh.
  'arm-straps-l': {
    joint: 'shoulderL',
    slot: 'straps',
    rings: limbBand(0.06, 0.066),
    offsets: [
      [0, -0.08, 0],
      [0, -0.22, 0],
    ],
  },
  'arm-straps-r': {
    joint: 'shoulderR',
    slot: 'straps',
    rings: limbBand(0.06, 0.066),
    offsets: [
      [0, -0.08, 0],
      [0, -0.22, 0],
    ],
  },
  'cuff-straps-l': {
    joint: 'elbowL',
    slot: 'straps',
    rings: limbBand(0.044, 0.046),
    offset: [0, -0.22, 0],
  },
  'cuff-straps-r': {
    joint: 'elbowR',
    slot: 'straps',
    rings: limbBand(0.044, 0.046),
    offset: [0, -0.22, 0],
  },
  'thigh-straps-l': {
    joint: 'hipL',
    slot: 'straps',
    rings: limbBand(0.092, 0.097),
    offset: [0, -0.12, 0],
  },
  'thigh-straps-r': {
    joint: 'hipR',
    slot: 'straps',
    rings: limbBand(0.092, 0.097),
    offset: [0, -0.12, 0],
  },
  // A strap slung from one shoulder across the chest and back to the
  // other hip: a band round the torso, tipped over.
  bandolier: {
    joint: 'spine',
    slot: 'straps',
    sides: 8,
    rings: [
      [0.017, 0.24, 0.138, 0.012],
      [-0.017, 0.24, 0.138, 0.012],
    ],
    offset: [0, 0.25, 0],
    rotation: [0, 0, 0.6],
  },
  // A strap buckled round the throat, over the bare neck bone.
  'collar-strap': {
    joint: 'neck',
    slot: 'straps',
    rings: limbBand(0.058, 0.058),
    offset: [0, 0.02, 0],
  },
  // Two straps round the skirt, each just proud of the hem through its
  // band, with an iron buckle on the front of each.
  'hem-strap-high': {
    joint: 'pelvis',
    slot: 'straps',
    sides: 8,
    rings: [
      [-0.185, 0.215, 0.16, 0],
      [-0.215, 0.218, 0.162, 0],
    ],
  },
  'hem-strap-low': {
    joint: 'pelvis',
    slot: 'straps',
    sides: 8,
    rings: [
      [-0.435, 0.233, 0.173, -0.009],
      [-0.465, 0.235, 0.175, -0.009],
    ],
  },
  'hem-buckles': {
    joint: 'pelvis',
    slot: 'buckle',
    box: [0.036, 0.032, 0.012],
    offsets: [
      [0, -0.2, 0.169],
      [0, -0.45, 0.172],
    ],
  },
  // Shreds of the hem, long and short, pointed where they tore.
  'tatters-long': {
    joint: 'pelvis',
    slot: 'coat',
    sides: 4,
    rings: [
      [0, 0.035, 0.012, 0],
      [-0.1, 0.014, 0.006, 0],
      [-0.17, 0.002, 0.002, 0],
    ],
    offsets: LONG_TATTER_SPOTS,
  },
  'tatters-short': {
    joint: 'pelvis',
    slot: 'coat',
    sides: 4,
    rings: [
      [0, 0.03, 0.01, 0],
      [-0.08, 0.002, 0.002, 0],
    ],
    offsets: SHORT_TATTER_SPOTS,
  },
  // A trench coat's skirt, from the waist to below the knee, flaring a
  // little as it falls.
  'trench-hem': {
    joint: 'pelvis',
    slot: 'coat',
    sides: 8,
    rings: [
      [0.06, 0.175, 0.125, 0],
      [-0.2, 0.205, 0.15, 0],
      [-0.48, 0.225, 0.165, -0.01],
      [-0.66, 0.24, 0.175, -0.02],
    ],
  },
}

// proportions scale the length of each limb group (1 = the base body).
export const OUTFITS: Record<OutfitId, Outfit> = {
  marx: {
    label: copy('outfits.marx'),
    colors: {
      skin: '#e9c9ad',
      hair: '#2a1f16',
      shirt: '#e8e4da',
      pants: '#9b2a24',
      boots: '#3a2a1e',
      belt: '#0c0c0e',
      glasses: '#16181c',
    },
    addons: [
      'dreadlocks',
      'beard',
      'glasses',
      'glasses-arms',
      'belt',
      'belt-loops',
    ],
  },
  // Androgynous, black on black: the bare body with no add-ons, in three
  // near-blacks that still shade apart from each other.
  player: {
    label: copy('outfits.player'),
    colors: {
      skin: '#f2dccb',
      hair: '#17120f',
      shirt: '#0e0e10',
      pants: '#141416',
      boots: '#060607',
    },
    addons: [],
  },
  shadow: {
    label: copy('outfits.shadow'),
    colors: {
      skin: '#07080c',
      hair: '#07080c',
      shirt: '#07080c',
      pants: '#07080c',
      boots: '#07080c',
      coat: '#07080c',
    },
    addons: ['hood'],
    // "Arms: too long" — the silhouette cards in shadowcards.ts.
    proportions: { arm: 1.4, leg: 1.12 },
  },
  coleman: {
    label: copy('outfits.coleman'),
    colors: {
      skin: '#efcfb4',
      // A buzz cut: the short hair cap, in light brown.
      hair: '#9c7a58',
      shirt: '#ecebe6',
      pants: '#16161a',
      boots: '#060607',
      belt: '#0c0c0e',
      buckle: '#c9a227',
    },
    addons: ['goatee', 'mustache', 'belt', 'belt-loops', 'buckle'],
    sleeves: 'short',
    prints: { torso: ['suicide-silence'] },
  },
  kvistad: {
    label: copy('outfits.kvistad'),
    colors: {
      skin: '#efcfb4',
      hair: '#9c7a58',
      shirt: '#141416',
      pants: '#3f5f8a',
      boots: '#060607',
      belt: '#0c0c0e',
    },
    addons: ['long-hair', 'belt', 'belt-loops'],
    sleeves: 'none',
    prints: {
      torso: ['torn-tank', 'chest-tattoo', 'pantera'],
      thigh: ['torn-jeans'],
      arm: ['sleeve-tattoo'],
    },
  },
  church: {
    label: copy('outfits.church'),
    colors: {
      skin: '#ebc8aa',
      hair: '#3b2a1e',
      shirt: '#141416',
      pants: '#3f5f8a',
      boots: '#2a2018',
      belt: '#0c0c0e',
    },
    addons: ['big-beard', 'belt', 'belt-loops'],
    sleeves: 'short',
    shaved: true,
    onBack: 'guitar',
    prints: { torso: ['guitar-strap'] },
  },
  hanson: {
    label: copy('outfits.hanson'),
    colors: {
      skin: '#f3d9c6',
      hair: '#a8442a',
      shirt: '#141416',
      pants: '#3f5f8a',
      boots: '#141416',
      belt: '#0c0c0e',
      stubble: '#c98266',
    },
    addons: [
      'emo-hair',
      'hair-spikes-long',
      'hair-spikes-short',
      'stubble',
      'fringe',
      'fringe-fill',
      'belt',
      'belt-loops',
    ],
    sleeves: 'short',
    prints: { torso: ['as-i-lay-dying'] },
  },
  // Blonde dreadlocks under a white bandana, a five o'clock shadow, an
  // oversized black NIN hoodie with the hood down, baggy camo pants and
  // black boots.
  halatek: {
    label: copy('outfits.halatek'),
    colors: {
      skin: '#eccaae',
      hair: '#d4b26a',
      shirt: '#141416',
      // The camo's ground; the pattern paints the dark green, brown and
      // black blots.
      pants: '#5e6a44',
      boots: '#0a0a0c',
      hat: '#e8e6e0',
      stubble: '#c4a67c',
    },
    addons: [
      'dreadlocks',
      'bandana',
      'bandana-knot',
      'bandana-tails',
      'stubble',
      'hood-down',
      'kangaroo-pocket',
    ],
    loose: 1.15,
    baggy: 1.25,
    patterns: { pants: 'camo' },
    prints: { torso: ['nin'] },
  },
  // A stoner: greasy hair to the shoulders, glasses, a beard that never
  // filled in, a Baja hoodie with the hood down, and baggy jeans.
  jdogg: {
    label: copy('outfits.jdogg'),
    colors: {
      skin: '#ebcbb0',
      hair: '#5a4630',
      // The Baja's ground; the pattern paints the stripes.
      shirt: '#d9cfb8',
      pants: '#4a6286',
      boots: '#3a3630',
      glasses: '#16181c',
      // Barely darker than the skin: a shadow that never grew in.
      stubble: '#c9a587',
    },
    addons: [
      'long-hair',
      'glasses',
      'glasses-arms',
      'stubble',
      'chin-wisps',
      'hood-down',
      'kangaroo-pocket',
    ],
    loose: 1.2,
    baggy: 1.2,
    patterns: { shirt: 'baja' },
  },
  // The Citgo clerk, behind every counter. Not on the select roster.
  carlsten: {
    label: copy('outfits.carlsten'),
    colors: {
      skin: '#eccaae',
      hair: '#4a3626',
      // The plaid's ground; the pattern paints the white and grey checks.
      shirt: '#dcdad4',
      pants: '#4d6a92',
      boots: '#5a3b24',
      glasses: '#16181c',
      hat: '#1c1c20',
    },
    addons: ['long-hair', 'goatee', 'glasses', 'glasses-arms', 'beret'],
    patterns: { shirt: 'plaid' },
    baggy: 1.3,
    inHand: 'bat',
  },
  // By the berry bush, under his own raincloud: bald, hunched, in a brown
  // cloak with the hood down. He changes who you are. Not on the select
  // roster.
  gron: {
    label: copy('outfits.gron'),
    colors: {
      skin: '#cbb497',
      hair: '#cbb497',
      shirt: '#5b3f26',
      pants: '#4b3420',
      boots: '#2b1f15',
      coat: '#5b3f26',
    },
    addons: ['hood-down', 'hump', 'cloak-hem'],
    shaved: true,
  },
  // Under every Citgo sign, his back to his skeleton horse: a skeleton
  // himself, on fire (figure.ts buildMoab lights him), in a tattered red
  // trench coat with black straps. Not on the select roster.
  moab: {
    label: copy('outfits.moab'),
    colors: {
      skin: '#d8cfb6',
      hair: '#d8cfb6',
      shirt: '#8e1414',
      pants: '#2a2a2e',
      boots: '#0b0b0d',
      coat: '#8e1414',
      belt: '#0a0a0b',
      straps: '#0a0a0b',
      buckle: '#8a8a86',
      sockets: '#050505',
    },
    addons: [
      'eye-sockets',
      'nose-hole',
      'mouth',
      'teeth',
      'chest-strap-high',
      'chest-strap-low',
      'strap-buckles',
      'arm-straps-l',
      'arm-straps-r',
      'cuff-straps-l',
      'cuff-straps-r',
      'thigh-straps-l',
      'thigh-straps-r',
      'belt',
      'trench-hem',
      'bandolier',
      'collar-strap',
      'hem-strap-high',
      'hem-strap-low',
      'hem-buckles',
      'tatters-long',
      'tatters-short',
    ],
    // Scorched, ripped through to the bone, and frayed.
    patterns: { shirt: 'tattered' },
    shaved: true,
  },
}

export const OUTFIT_IDS = Object.keys(OUTFITS) as OutfitId[] // the keys of a Record<OutfitId, …>

export function outfitById(id: string): Outfit {
  const outfit: Outfit | undefined = OUTFITS[id as OutfitId] // checked below
  if (!outfit) throw new Error(`Unknown outfit: ${id}`)
  return outfit
}
