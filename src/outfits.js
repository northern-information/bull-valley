// Pure: every character outfit in one table. An outfit colors the shared
// body (figure.js) by slot, adds optional parts from ADDONS, and can stretch
// limbs with proportions. Edit characters here; the body stays the same.

// Every outfit colors these; add-ons may use more slots (hat, coat).
export const BODY_SLOTS = ['skin', 'hair', 'shirt', 'pants', 'boots']

// Extra boxes on the body. joint names a pivot from poses.js JOINTS; size
// and offset are metres in that joint's space; slot picks the color.
export const ADDONS = {
  cap: {
    joint: 'neck',
    size: [0.25, 0.08, 0.27],
    offset: [0, 0.3, 0],
    slot: 'hat',
  },
  brim: {
    joint: 'neck',
    size: [0.22, 0.03, 0.13],
    offset: [0, 0.28, 0.17],
    slot: 'hat',
  },
  beard: {
    joint: 'neck',
    size: [0.2, 0.1, 0.06],
    offset: [0, 0.07, 0.11],
    slot: 'hair',
  },
  'coat-hem': {
    joint: 'pelvis',
    size: [0.38, 0.24, 0.27],
    offset: [0, -0.06, 0],
    slot: 'coat',
  },
  hood: {
    joint: 'neck',
    size: [0.27, 0.32, 0.3],
    offset: [0, 0.15, -0.02],
    slot: 'coat',
  },
}

// proportions scale the length of each limb group (1 = the base body).
export const OUTFITS = {
  marx: {
    label: 'Matthew Marx',
    colors: {
      skin: '#e9c9ad',
      hair: '#7d6d5c',
      shirt: '#7a2f2a',
      pants: '#3b4a63',
      boots: '#3a2a1e',
      hat: '#2f4a36',
    },
    addons: ['cap', 'brim', 'beard'],
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
    // "Arms: too long" — the silhouette cards in shadowmen.js.
    proportions: { arm: 1.4, leg: 1.12 },
  },
}

export const OUTFIT_IDS = Object.keys(OUTFITS)

export function outfitById(id) {
  const outfit = OUTFITS[id]
  if (!outfit) throw new Error(`Unknown outfit: ${id}`)
  return outfit
}
