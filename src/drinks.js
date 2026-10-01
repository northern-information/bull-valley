// The drinks of Bull Valley, circa 2008: energy drinks, liquor, beer, and
// water. Each drink is its own inventory item: the id is the inventory
// kind. Identity (names, flavor text, the container) lives here; shop caps
// live in CONFIG. Drinks have no effect yet: the player can buy and carry
// them, not drink them. Pure, no Three.

// Containers, in metres. radius is half the width; depth, when present, is
// half the front-to-back size of a flat or square bottle.
export const CONTAINERS = {
  tall: { radius: 0.033, height: 0.168 }, // 16 oz can
  slim: { radius: 0.0265, height: 0.134 }, // 250 ml can
  can12: { radius: 0.033, height: 0.122 }, // 12 oz can
  nos: { radius: 0.037, height: 0.23 }, // NOS 22 oz plastic bottle
  bourbon: { radius: 0.04, height: 0.29 }, // Wild Turkey 750 ml
  square: { radius: 0.04, depth: 0.034, height: 0.28 }, // Jim Beam 750 ml
  goose: { radius: 0.042, height: 0.33 }, // Grey Goose 750 ml
  flask: { radius: 0.048, depth: 0.027, height: 0.27 }, // MD 20/20 750 ml
  water: { radius: 0.033, height: 0.205 }, // Ice Mountain 500 ml
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
    container: 'nos',
  },
  {
    id: 'four-loko-blue',
    label: 'Four Loko Blue Raspberry',
    blurb: 'Blue camo, 23.5 oz. Caffeine and twelve percent.',
    container: 'tall',
  },
  {
    id: 'four-loko-punch',
    label: 'Four Loko Fruit Punch',
    blurb: 'Red camo. Blackout in a can.',
    container: 'tall',
  },
  {
    id: 'four-loko-lemon',
    label: 'Four Loko Lemon Lime',
    blurb: 'Nuclear green camo. It glows a little.',
    container: 'tall',
  },
  {
    id: 'wild-turkey',
    label: 'Wild Turkey 101',
    blurb: 'Austin Nichols. A hundred and one proof.',
    container: 'bourbon',
  },
  {
    id: 'jim-beam',
    label: 'Jim Beam',
    blurb: 'White label, red seal. Kentucky straight bourbon.',
    container: 'square',
  },
  {
    id: 'grey-goose',
    label: 'Grey Goose',
    blurb: 'Frosted glass, geese over the Alps. Too nice for here.',
    container: 'goose',
  },
  {
    id: 'pbr',
    label: 'Pabst Blue Ribbon',
    blurb: 'Milwaukee, 1844. The blue ribbon, the red sash. Cheap.',
    container: 'can12',
  },
  {
    id: 'modelo',
    label: 'Modelo Especial',
    blurb: 'Cream and gold, two lions. Cold, if you are lucky.',
    container: 'can12',
  },
  {
    id: 'md-2020',
    label: 'MD 20/20 Banana Red',
    blurb: 'Mad Dog. A flat red flask. Tastes like a candle.',
    container: 'flask',
  },
  {
    id: 'ice-mountain',
    label: 'Ice Mountain',
    blurb: 'Michigan spring water. The only clean thing for miles.',
    container: 'water',
  },
]

// Cans and bottles each share one scale in a view, set by the tallest of
// their family, so sizes stay true within a family. One scale for all
// would shrink a 16 oz can to half a Grey Goose bottle.
const CANS = ['tall', 'slim', 'can12']

function familyOf(container) {
  return CANS.includes(container) ? 'can' : 'bottle'
}

// The height a view fits this drink's family to.
export function drinkFitHeight(id) {
  const family = familyOf(drinkById(id).container)
  return Math.max(
    ...Object.entries(CONTAINERS)
      .filter(([name]) => familyOf(name) === family)
      .map(([, c]) => c.height)
  )
}

export const DRINK_IDS = DRINKS.map((d) => d.id)

export function isDrink(kind) {
  return DRINK_IDS.includes(kind)
}

export function drinkById(id) {
  return DRINKS.find((d) => d.id === id) || null
}
