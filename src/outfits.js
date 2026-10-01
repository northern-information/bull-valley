// Pure: every character outfit in one table. An outfit colors the shared
// body (figure.js) by slot, adds optional parts from ADDONS, and can stretch
// limbs with proportions. Edit characters here; the body stays the same.

// Every outfit colors these; add-ons may use more slots (hat, coat).
export const BODY_SLOTS = ['skin', 'hair', 'shirt', 'pants', 'boots']

// Extra parts on the body. joint names a pivot from poses.js JOINTS; slot
// picks the color. A part is either a loft (rings of [y, rx, rz, cz]: height,
// half-width, half-depth and forward shift, in metres in the joint's space,
// the same shape language as the body in figure.js) or a box (size and
// offset).
export const ADDONS = {
  cap: {
    joint: 'neck',
    slot: 'hat',
    rings: [
      [0.24, 0.1, 0.118, 0.005],
      [0.29, 0.098, 0.112, 0],
      [0.33, 0.06, 0.07, -0.005],
    ],
  },
  brim: {
    joint: 'neck',
    slot: 'hat',
    box: [0.17, 0.02, 0.1],
    offset: [0, 0.245, 0.15],
  },
  beard: {
    joint: 'neck',
    slot: 'hair',
    rings: [
      [0.06, 0.045, 0.05, 0.045],
      [0.1, 0.085, 0.095, 0.02],
      [0.16, 0.093, 0.108, 0.005],
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
