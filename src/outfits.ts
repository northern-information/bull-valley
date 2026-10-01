// Pure: every character outfit in one table. An outfit colors the shared
// body (figure.ts) by slot, adds optional parts from ADDONS, and can stretch
// limbs with proportions. Edit characters here; the body stays the same.

import type { JointName } from './poses.ts'

// Every outfit colors these; add-ons may use more slots (coat, glasses).
export const BODY_SLOTS = ['skin', 'hair', 'shirt', 'pants', 'boots'] as const

export type BodySlot = (typeof BODY_SLOTS)[number]
export type ColorSlot =
  BodySlot | 'coat' | 'glasses' | 'buckle' | 'belt' | 'stubble'

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

// Where an outfit prints a decal over the body: across the torso front,
// across the front of both thighs, or all round both bare arms.
export type PrintPart = 'torso' | 'thigh' | 'arm'

export type Vec3 = [number, number, number]

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

export type Addon = LoftAddon | BoxAddon

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
  | 'fringe-swoop'
  | 'emo-hair'

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
  // Each part's prints, painted in order (decalart.ts paintPrints).
  prints?: Partial<Record<PrintPart, DecalId[]>>
}

export type OutfitId =
  'marx' | 'player' | 'shadow' | 'coleman' | 'kvistad' | 'church' | 'hanson'

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
  // Five o'clock shadow: a thin layer round the jaw and the mouth, close to
  // the face. The rings sit forward, so the back stays inside the head.
  stubble: {
    joint: 'neck',
    slot: 'stubble',
    sides: 8,
    rings: [
      [0.065, 0.052, 0.045, 0.045],
      [0.1, 0.08, 0.07, 0.04],
      [0.15, 0.09, 0.075, 0.03],
    ],
  },
  // An emo fringe: a slab of hair slanted across the forehead, low on the
  // -X side, and a swoop that hangs from it over the -X eye.
  fringe: {
    joint: 'neck',
    slot: 'hair',
    box: [0.17, 0.05, 0.03],
    offset: [-0.005, 0.228, 0.098],
    rotation: [0, 0, 0.3],
  },
  'fringe-swoop': {
    joint: 'neck',
    slot: 'hair',
    box: [0.05, 0.11, 0.022],
    offset: [-0.045, 0.172, 0.103],
    rotation: [0, 0, 0.15],
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
}

// proportions scale the length of each limb group (1 = the base body).
export const OUTFITS: Record<OutfitId, Outfit> = {
  marx: {
    label: 'Matthew Marx',
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
  player: {
    label: 'Player',
    colors: {
      skin: '#f2dccb',
      hair: '#3a2c22',
      shirt: '#1e293b',
      pants: '#2d3340',
      boots: '#1f1a16',
      coat: '#1e293b',
    },
    addons: ['coat-hem'],
  },
  shadow: {
    label: 'Shadowman (parked)',
    colors: {
      skin: '#07080c',
      hair: '#07080c',
      shirt: '#07080c',
      pants: '#07080c',
      boots: '#07080c',
      coat: '#07080c',
    },
    addons: ['hood'],
    // "Arms: too long" — the silhouette cards in shadowmen.ts.
    proportions: { arm: 1.4, leg: 1.12 },
  },
  coleman: {
    label: 'David Coleman',
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
    label: 'David Kvistad',
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
    label: 'Kyle Church',
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
    label: 'Juston Hanson',
    colors: {
      skin: '#f3d9c6',
      hair: '#a8442a',
      shirt: '#141416',
      pants: '#3f5f8a',
      boots: '#141416',
      belt: '#0c0c0e',
      stubble: '#dcae96',
    },
    addons: [
      'emo-hair',
      'stubble',
      'fringe',
      'fringe-swoop',
      'belt',
      'belt-loops',
    ],
    sleeves: 'short',
    prints: { torso: ['as-i-lay-dying'] },
  },
}

export const OUTFIT_IDS = Object.keys(OUTFITS) as OutfitId[] // the keys of a Record<OutfitId, …>

export function outfitById(id: string): Outfit {
  const outfit: Outfit | undefined = OUTFITS[id as OutfitId] // checked below
  if (!outfit) throw new Error(`Unknown outfit: ${id}`)
  return outfit
}
