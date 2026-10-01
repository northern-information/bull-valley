// The five cigarette brands of Bull Valley. Each brand is its own inventory
// item: the id is the inventory kind. Identity (names, flavor text) lives
// here; tuning (burn time, ember, shop caps) lives in CONFIG. Pure, no Three.

export const BRANDS = [
  {
    id: 'marlboro',
    label: 'Marlboro Reds',
    blurb: 'The red roof. What Marx smokes.',
    lit: 'You light a Red. The roof of the world.',
  },
  {
    id: 'camel',
    label: 'Camel Turkish Royals',
    blurb: 'Rich and mellow. Pyramids on the pack.',
    lit: 'You light a Turkish Royal. Rich, mellow, far from here.',
  },
  {
    id: 'parliament',
    label: 'Parliaments',
    blurb: 'Recessed filter. Long, clean draw.',
    lit: 'You light a Parliament. The recessed filter, the long draw.',
  },
  {
    id: 'newport',
    label: 'Newports',
    blurb: 'Menthol. Quick and cold.',
    lit: 'You light a Newport. Cold in the chest.',
  },
  {
    id: 'djarum',
    label: 'Djarum Blacks',
    blurb: 'Clove kretek. Burns long, crackles loud.',
    lit: 'You light a Djarum. The clove crackles in the dark.',
  },
]

export const BRAND_IDS = BRANDS.map((b) => b.id)

export function isBrand(kind) {
  return BRAND_IDS.includes(kind)
}

export function brandById(id) {
  return BRANDS.find((b) => b.id === id) || null
}

// The brand that a bare "smoke" press lights: the selected brand when the
// player still carries it, else the first brand in BRANDS order they carry.
// Null when they carry none.
export function brandToSmoke(inv, selected) {
  if (selected && inv[selected] > 0) return selected
  return BRAND_IDS.find((id) => inv[id] > 0) || null
}
