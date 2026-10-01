// The six energy drinks of Bull Valley. Each drink is its own inventory
// item: the id is the inventory kind. Identity (names, flavor text, the
// container) lives here; shop caps live in CONFIG. Drinks have no effect
// yet: the player can buy and carry them, not drink them. Pure, no Three.

// Containers, in metres. A 16 oz tall can, the 250 ml slim can, and the
// NOS 22 oz bottle.
export const CONTAINERS = {
  tall: { radius: 0.033, height: 0.168 },
  slim: { radius: 0.0265, height: 0.134 },
  bottle: { radius: 0.037, height: 0.23 },
}

export const DRINKS = [
  {
    id: 'monster',
    label: 'Monster Energy',
    blurb: 'Three green claw marks. Tastes like a battery.',
    container: 'tall',
  },
  {
    id: 'monster-ultra',
    label: 'Monster Ultra',
    blurb: 'White can, zero sugar. A cold, thin buzz.',
    container: 'tall',
  },
  {
    id: 'red-bull',
    label: 'Red Bull',
    blurb: 'Small, silver and blue. Two bulls charge.',
    container: 'slim',
  },
  {
    id: 'rip-it',
    label: 'Rip It',
    blurb: 'Energy fuel. Sold by the case at the base.',
    container: 'tall',
  },
  {
    id: 'rockstar',
    label: 'Rockstar',
    blurb: 'Black can, gold star. Party like one.',
    container: 'tall',
  },
  {
    id: 'nos',
    label: 'NOS',
    blurb: 'A blue plastic bottle, an orange cap. High performance.',
    container: 'bottle',
  },
]

export const DRINK_IDS = DRINKS.map((d) => d.id)

export function isDrink(kind) {
  return DRINK_IDS.includes(kind)
}

export function drinkById(id) {
  return DRINKS.find((d) => d.id === id) || null
}
