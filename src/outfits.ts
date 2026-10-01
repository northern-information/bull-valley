// Pure: every character outfit in one table. An outfit colors the shared
// body (figure.ts) by slot, adds optional parts from ADDONS, and can stretch
// limbs with proportions. Edit characters here; the body stays the same.

import type { Vec3 } from './interfaces.ts'
import type { JointName } from './poses.ts'

// Every outfit colors these; add-ons may use more slots (coat, glasses).
export const BODY_SLOTS = ['skin', 'hair', 'shirt', 'pants', 'boots'] as const

export type BodySlot = (typeof BODY_SLOTS)[number]
export type ColorSlot = BodySlot | 'coat' | 'glasses'

// One loft ring: [y, rx, rz, cz] — height, half-width, half-depth and
// forward shift, in metres.
export type LoftRing = [number, number, number, number]

interface AddonBase {
  joint: JointName
  slot: ColorSlot
  offset?: Vec3
  offsets?: Vec3[]
}

export interface LoftAddon extends AddonBase {
  rings: LoftRing[]
  sides?: number
}

export interface BoxAddon extends AddonBase {
  box: Vec3
}

export type Addon = LoftAddon | BoxAddon

export type AddonId =
  'beard' | 'dreadlocks' | 'glasses' | 'glasses-arms' | 'coat-hem' | 'hood'

export type LimbGroup = 'arm' | 'leg'

export interface Outfit {
  label: string
  colors: Record<BodySlot, string> & Partial<Record<ColorSlot, string>>
  addons: AddonId[]
  proportions?: Partial<Record<LimbGroup, number>>
}

export type OutfitId = 'marx' | 'player' | 'shadow'

// Dreadlocks hang from a ring round the back and sides of the head, leaving
// the face clear. Angles are around the head from +X toward +Z (the face).
const LOC_ANGLES = [-20, 0, 20, 160, 180, 200, 220, 245, 270, 295, 320, 340]
const LOC_ROOTS = LOC_ANGLES.map((deg): Vec3 => {
  const a = (deg * Math.PI) / 180
  return [Math.cos(a) * 0.09, 0.27, Math.sin(a) * 0.1 - 0.012]
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
      glasses: '#16181c',
    },
    addons: ['dreadlocks', 'beard', 'glasses', 'glasses-arms'],
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
}

export const OUTFIT_IDS = Object.keys(OUTFITS) as OutfitId[] // the keys of a Record<OutfitId, …>

export function outfitById(id: string): Outfit {
  const outfit: Outfit | undefined = OUTFITS[id as OutfitId] // checked below
  if (!outfit) throw new Error(`Unknown outfit: ${id}`)
  return outfit
}
