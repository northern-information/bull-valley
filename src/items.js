// Every item in Bull Valley, in one table: identity, text, and tuning. Edit
// an item here and the carousel, the tailgate, pickups, and toasts follow.
// Pure, no Three. Meshes stay in assets.js, keyed by id.
//
// Fields:
//   id        inventory kind and mesh key
//   category  'cigarette' | 'joint' | 'drink' | 'gear'
//   label     name in the carousel and pickup prompts
//   blurb     description in the carousel
//   used      toast when the player uses it
//   bought    toast when the player buys it at the tailgate
//   empty     toast when the player tries to use it with none left
//   start     count in a new inventory (counted items only)
//   shopCap   tailgate stock per raid; 0 or missing means not for sale
//
// Gear is not counted in the inventory: the sack is raid state
// (raid.sack), so it has no start, used, or empty text. Drinks cannot be
// used yet, so they have no used or empty text.

export const ITEMS = [
  {
    id: 'marlboro',
    category: 'cigarette',
    label: 'Marlboro Reds',
    blurb: 'The red roof. What Marx smokes.',
    used: 'You light a Red. The roof of the world.',
    bought: 'One pack of Marlboro Reds, pocketed.',
    empty: 'No Marlboro Reds left.',
    start: 2,
    shopCap: 2,
    smokeSeconds: 12,
    emberSeconds: 20,
  },
  {
    id: 'camel',
    category: 'cigarette',
    label: 'Camel Turkish Royals',
    blurb: 'Rich and mellow. Pyramids on the pack.',
    used: 'You light a Turkish Royal. Rich, mellow, far from here.',
    bought: 'One pack of Camel Turkish Royals, pocketed.',
    empty: 'No Camel Turkish Royals left.',
    start: 0,
    shopCap: 2,
    smokeSeconds: 14,
    emberSeconds: 20,
  },
  {
    id: 'parliament',
    category: 'cigarette',
    label: 'Parliaments',
    blurb: 'Recessed filter. Long, clean draw.',
    used: 'You light a Parliament. The recessed filter, the long draw.',
    bought: 'One pack of Parliaments, pocketed.',
    empty: 'No Parliaments left.',
    start: 0,
    shopCap: 2,
    smokeSeconds: 13,
    emberSeconds: 16,
  },
  {
    id: 'newport',
    category: 'cigarette',
    label: 'Newports',
    blurb: 'Menthol. Quick and cold.',
    used: 'You light a Newport. Cold in the chest.',
    bought: 'One pack of Newports, pocketed.',
    empty: 'No Newports left.',
    start: 0,
    shopCap: 2,
    smokeSeconds: 9,
    emberSeconds: 14,
  },
  {
    id: 'djarum',
    category: 'cigarette',
    label: 'Djarum Blacks',
    blurb: 'Clove kretek. Burns long, crackles loud.',
    used: 'You light a Djarum. The clove crackles in the dark.',
    bought: 'One pack of Djarum Blacks, pocketed.',
    empty: 'No Djarum Blacks left.',
    start: 0,
    shopCap: 2,
    smokeSeconds: 18,
    emberSeconds: 26,
    // The kretek's clove pop, for when sound effects return.
    crackle: true,
  },
  {
    id: 'joints',
    category: 'joint',
    label: 'Joints',
    blurb: 'You will see them. You will feel less.',
    used: 'You spark the joint. The valley sharpens.',
    bought: 'One joint, pocketed.',
    empty: 'No joints left.',
    start: 1,
    shopCap: 2,
    // Shadowmen resolve through the murk, but the nerves meter reads soft
    // and slow the whole time.
    perceptionSeconds: 120,
  },
  // Drinks, circa 2008. No effect yet: the player can buy and carry them,
  // not drink them. container is a key into CONTAINERS in drinks.js.
  {
    id: 'monster',
    category: 'drink',
    label: 'Monster Energy',
    blurb: 'Three green claw marks. Tastes like a battery.',
    bought: 'One Monster Energy, pocketed.',
    start: 0,
    shopCap: 2,
    container: 'tall',
  },
  {
    id: 'monster-ultra',
    category: 'drink',
    label: 'Monster Ultra',
    blurb: 'White can, zero sugar. A cold, thin buzz.',
    bought: 'One Monster Ultra, pocketed.',
    start: 0,
    shopCap: 2,
    container: 'tall',
  },
  {
    id: 'red-bull',
    category: 'drink',
    label: 'Red Bull',
    blurb: 'Small, silver and blue. Two bulls charge.',
    bought: 'One Red Bull, pocketed.',
    start: 0,
    shopCap: 2,
    container: 'slim',
  },
  {
    id: 'rip-it',
    category: 'drink',
    label: 'Rip It',
    blurb: 'Energy fuel. Sold by the case at the base.',
    bought: 'One Rip It, pocketed.',
    start: 0,
    shopCap: 2,
    container: 'tall',
  },
  {
    id: 'rockstar',
    category: 'drink',
    label: 'Rockstar',
    blurb: 'Black can, gold star. Party like one.',
    bought: 'One Rockstar, pocketed.',
    start: 0,
    shopCap: 2,
    container: 'tall',
  },
  {
    id: 'nos',
    category: 'drink',
    label: 'NOS',
    blurb: 'A blue plastic bottle, an orange cap. High performance.',
    bought: 'One NOS, pocketed.',
    start: 0,
    shopCap: 1,
    container: 'nos',
  },
  {
    id: 'four-loko-blue',
    category: 'drink',
    label: 'Four Loko Blue Raspberry',
    blurb: 'Blue camo, 23.5 oz. Caffeine and twelve percent.',
    bought: 'One Four Loko Blue Raspberry, pocketed.',
    start: 0,
    shopCap: 1,
    container: 'tall',
  },
  {
    id: 'four-loko-punch',
    category: 'drink',
    label: 'Four Loko Fruit Punch',
    blurb: 'Red camo. Blackout in a can.',
    bought: 'One Four Loko Fruit Punch, pocketed.',
    start: 0,
    shopCap: 1,
    container: 'tall',
  },
  {
    id: 'four-loko-lemon',
    category: 'drink',
    label: 'Four Loko Lemon Lime',
    blurb: 'Nuclear green camo. It glows a little.',
    bought: 'One Four Loko Lemon Lime, pocketed.',
    start: 0,
    shopCap: 1,
    container: 'tall',
  },
  {
    id: 'wild-turkey',
    category: 'drink',
    label: 'Wild Turkey 101',
    blurb: 'Austin Nichols. A hundred and one proof.',
    bought: 'One Wild Turkey 101, pocketed.',
    start: 0,
    shopCap: 1,
    container: 'bourbon',
  },
  {
    id: 'jim-beam',
    category: 'drink',
    label: 'Jim Beam',
    blurb: 'White label, red seal. Kentucky straight bourbon.',
    bought: 'One Jim Beam, pocketed.',
    start: 0,
    shopCap: 1,
    container: 'square',
  },
  {
    id: 'grey-goose',
    category: 'drink',
    label: 'Grey Goose',
    blurb: 'Frosted glass, geese over the Alps. Too nice for here.',
    bought: 'One Grey Goose, pocketed.',
    start: 0,
    shopCap: 1,
    container: 'goose',
  },
  {
    id: 'pbr',
    category: 'drink',
    label: 'Pabst Blue Ribbon',
    blurb: 'Milwaukee, 1844. The blue ribbon, the red sash. Cheap.',
    bought: 'One Pabst Blue Ribbon, pocketed.',
    start: 0,
    shopCap: 3,
    container: 'can12',
  },
  {
    id: 'modelo',
    category: 'drink',
    label: 'Modelo Especial',
    blurb: 'Cream and gold, two lions. Cold, if you are lucky.',
    bought: 'One Modelo Especial, pocketed.',
    start: 0,
    shopCap: 3,
    container: 'can12',
  },
  {
    id: 'md-2020',
    category: 'drink',
    label: 'MD 20/20 Banana Red',
    blurb: 'Mad Dog. A flat red flask. Tastes like a candle.',
    bought: 'One MD 20/20 Banana Red, pocketed.',
    start: 0,
    shopCap: 1,
    container: 'flask',
  },
  {
    id: 'ice-mountain',
    category: 'drink',
    label: 'Ice Mountain',
    blurb: 'Michigan spring water. The only clean thing for miles.',
    bought: 'One Ice Mountain, pocketed.',
    start: 0,
    shopCap: 3,
    container: 'water',
  },
  {
    id: 'sack',
    category: 'gear',
    label: 'Burlap Sack',
    // The blurb and toast name carryLimit and CONFIG.cabbage.carryLimit in
    // words; change them together.
    blurb: 'Carries five cabbages instead of three.',
    bought: 'The burlap sack. Room for five.',
    shopCap: 1,
    carryLimit: 5,
  },
]

export const ITEM_IDS = ITEMS.map((item) => item.id)

const BY_ID = new Map(ITEMS.map((item) => [item.id, item]))

export function itemById(id) {
  return BY_ID.get(id) || null
}

export const CIGARETTE_IDS = ITEMS.filter(
  (item) => item.category === 'cigarette'
).map((item) => item.id)

export function isCigarette(id) {
  return itemById(id)?.category === 'cigarette'
}

export function isDrink(id) {
  return itemById(id)?.category === 'drink'
}

// Whether the player can use a carried item (E in the carousel).
export function isUsable(id) {
  const category = itemById(id)?.category
  return category === 'cigarette' || category === 'joint'
}

// The kinds the inventory counts: everything except gear.
export const INVENTORY_KINDS = ITEMS.filter(
  (item) => item.category !== 'gear'
).map((item) => item.id)

// A fresh tailgate: each for-sale item at its cap, keyed by id.
export function shopStock() {
  return Object.fromEntries(
    ITEMS.filter((item) => item.shopCap > 0).map((item) => [
      item.id,
      item.shopCap,
    ])
  )
}

// The cigarette that a bare "smoke" press lights: the selected one when the
// player still carries it, else the first one in ITEMS order they carry.
// Null when they carry none.
export function cigaretteToSmoke(inv, selected) {
  if (selected && isCigarette(selected) && inv[selected] > 0) return selected
  return CIGARETTE_IDS.find((id) => inv[id] > 0) || null
}
