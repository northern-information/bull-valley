// Every item in Bull Valley, in one table: identity, text, and tuning. Edit
// an item here and the carousel, the Citgo shelves, pickups, and toasts
// follow.
// Pure, no Three. Meshes stay in assets.ts, keyed by id.
//
// Fields:
//   id        inventory kind and mesh key
//   category  'cigarette' | 'joint' | 'drink' | 'forage' | 'gear'
//   label     name in the carousel and pickup prompts
//   blurb     description in the carousel
//   used      toast when the player uses it
//   bought    toast when the player buys it at a Citgo (shelf items only)
//   collected toast when the player picks it off the berry bush (forage)
//   empty     toast when the player tries to use it with none left
//   start     count in a new inventory (counted items only)
//   price     shelf price at every Citgo, in cents (shelf items only)
//
// Gear is not counted in the inventory: the sack is raid state
// (raid.sack), so it has no start, used, or empty text. Drinks cannot be
// used yet, so they have no used or empty text. Forage is never on a
// shelf, so it has no price or bought text; the valley hands it out
// (sharedraid.ts rule 9).

import type { Inventory, Item } from './interfaces.ts'

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
    price: 549,
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
    price: 529,
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
    price: 599,
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
    price: 549,
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
    price: 649,
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
    price: 1000,
    // Shadowmen resolve through the murk, but the nerves meter reads soft
    // and slow the whole time.
    perceptionSeconds: 120,
  },
  // Drinks, circa 2008. No effect yet: the player can buy and carry them,
  // not drink them. container is a key into CONTAINERS in drinks.ts.
  {
    id: 'monster',
    category: 'drink',
    label: 'Monster Energy',
    blurb: 'Three green claw marks. Tastes like a battery.',
    bought: 'One Monster Energy, pocketed.',
    start: 0,
    price: 219,
    container: 'tall',
  },
  {
    id: 'monster-ultra',
    category: 'drink',
    label: 'Monster Ultra',
    blurb: 'White can, zero sugar. A cold, thin buzz.',
    bought: 'One Monster Ultra, pocketed.',
    start: 0,
    price: 219,
    container: 'tall',
  },
  {
    id: 'red-bull',
    category: 'drink',
    label: 'Red Bull',
    blurb: 'Small, silver and blue. Two bulls charge.',
    bought: 'One Red Bull, pocketed.',
    start: 0,
    price: 199,
    container: 'slim',
  },
  {
    id: 'rip-it',
    category: 'drink',
    label: 'Rip It',
    blurb: 'Energy fuel. Sold by the case at the base.',
    bought: 'One Rip It, pocketed.',
    start: 0,
    price: 99,
    container: 'tall',
  },
  {
    id: 'rockstar',
    category: 'drink',
    label: 'Rockstar',
    blurb: 'Black can, gold star. Party like one.',
    bought: 'One Rockstar, pocketed.',
    start: 0,
    price: 199,
    container: 'tall',
  },
  {
    id: 'nos',
    category: 'drink',
    label: 'NOS',
    blurb: 'A blue plastic bottle, an orange cap. High performance.',
    bought: 'One NOS, pocketed.',
    start: 0,
    price: 229,
    container: 'nos',
  },
  {
    id: 'four-loko-blue',
    category: 'drink',
    label: 'Four Loko Blue Raspberry',
    blurb: 'Blue camo, 23.5 oz. Caffeine and twelve percent.',
    bought: 'One Four Loko Blue Raspberry, pocketed.',
    start: 0,
    price: 249,
    container: 'tall',
  },
  {
    id: 'four-loko-punch',
    category: 'drink',
    label: 'Four Loko Fruit Punch',
    blurb: 'Red camo. Blackout in a can.',
    bought: 'One Four Loko Fruit Punch, pocketed.',
    start: 0,
    price: 249,
    container: 'tall',
  },
  {
    id: 'four-loko-lemon',
    category: 'drink',
    label: 'Four Loko Lemon Lime',
    blurb: 'Nuclear green camo. It glows a little.',
    bought: 'One Four Loko Lemon Lime, pocketed.',
    start: 0,
    price: 249,
    container: 'tall',
  },
  {
    id: 'wild-turkey',
    category: 'drink',
    label: 'Wild Turkey 101',
    blurb: 'Austin Nichols. A hundred and one proof.',
    bought: 'One Wild Turkey 101, pocketed.',
    start: 0,
    price: 2199,
    container: 'bourbon',
  },
  {
    id: 'jim-beam',
    category: 'drink',
    label: 'Jim Beam',
    blurb: 'White label, red seal. Kentucky straight bourbon.',
    bought: 'One Jim Beam, pocketed.',
    start: 0,
    price: 1599,
    container: 'square',
  },
  {
    id: 'grey-goose',
    category: 'drink',
    label: 'Grey Goose',
    blurb: 'Frosted glass, geese over the Alps. Too nice for here.',
    bought: 'One Grey Goose, pocketed.',
    start: 0,
    price: 2999,
    container: 'goose',
  },
  {
    id: 'pbr',
    category: 'drink',
    label: 'Pabst Blue Ribbon',
    blurb: 'Milwaukee, 1844. The blue ribbon, the red sash. Cheap.',
    bought: 'One Pabst Blue Ribbon, pocketed.',
    start: 0,
    price: 99,
    container: 'can12',
  },
  {
    id: 'high-life',
    category: 'drink',
    label: 'Miller High Life',
    blurb: 'The Champagne of Beers. Clear glass, the girl in the moon.',
    bought: 'One Miller High Life, pocketed.',
    start: 0,
    price: 129,
    container: 'longneck',
  },
  {
    id: 'modelo',
    category: 'drink',
    label: 'Modelo Especial',
    blurb: 'Cream and gold, two lions. Cold, if you are lucky.',
    bought: 'One Modelo Especial, pocketed.',
    start: 0,
    price: 149,
    container: 'can12',
  },
  {
    id: 'md-2020',
    category: 'drink',
    label: 'MD 20/20 Banana Red',
    blurb: 'Mad Dog. A flat red flask. Tastes like a candle.',
    bought: 'One MD 20/20 Banana Red, pocketed.',
    start: 0,
    price: 299,
    container: 'flask',
  },
  {
    id: 'ice-mountain',
    category: 'drink',
    label: 'Ice Mountain',
    blurb: 'Michigan spring water. The only clean thing for miles.',
    bought: 'One Ice Mountain, pocketed.',
    start: 0,
    price: 119,
    container: 'water',
  },
  // Forage. Not for sale: the berry bush at the spawn Citgo gives every
  // name one a day, the day turning at midnight Central. No effect yet.
  {
    id: 'berries',
    category: 'forage',
    label: 'Berries',
    blurb: 'Dark and cold, off the bush by the Citgo. One a day.',
    collected: 'A berry off the bush. The rest are for tomorrow.',
    start: 0,
  },
  {
    id: 'sack',
    category: 'gear',
    label: 'Burlap Sack',
    // The blurb and toast name carryLimit and CONFIG.cabbage.carryLimit in
    // words; change them together.
    blurb: 'Carries five cabbages instead of three.',
    bought: 'The burlap sack. Room for five.',
    price: 300,
    carryLimit: 5,
  },
] as const satisfies readonly Item[]

type ItemEntry = (typeof ITEMS)[number]

// Every item id, as a type: a typo in a literal id fails the type check.
export type ItemId = ItemEntry['id']

// What a pickup in the valley can be: a cabbage, or an item.
export type PickupKind = 'cabbage' | ItemId

// ITEMS widened to the plain Item shape, for code that reads optional
// fields (container, carryLimit) across every entry.
export const ITEM_LIST: readonly Item[] = ITEMS

const BY_ID = new Map<string, Item>(ITEMS.map((item) => [item.id, item]))

// Look up an id that came from outside the table (saved inventory, a ring
// entry). Null when the id is unknown.
export function itemById(id: string): Item | null {
  return BY_ID.get(id) || null
}

// Look up a literal id. The return type is that exact entry, so its fields
// (the sack's carryLimit, say) need no null checks. The cast is safe: K is
// an id in ITEMS, so find() always matches that entry.
export function getItem<K extends ItemId>(
  id: K
): Extract<ItemEntry, { id: K }> {
  return ITEMS.find((item) => item.id === id) as Extract<ItemEntry, { id: K }>
}

export const CIGARETTE_IDS: readonly ItemId[] = ITEMS.filter(
  (item) => item.category === 'cigarette'
).map((item) => item.id)

export function isCigarette(id: string): boolean {
  return itemById(id)?.category === 'cigarette'
}

export function isDrink(id: string): boolean {
  return itemById(id)?.category === 'drink'
}

export function isForage(id: string): boolean {
  return itemById(id)?.category === 'forage'
}

// Whether a Citgo shelf carries the item: everything with a price.
export function isForSale(id: string): boolean {
  return itemById(id)?.price !== undefined
}

// Whether the player can use a carried item (E in the carousel).
export function isUsable(id: string): boolean {
  const category = itemById(id)?.category
  return category === 'cigarette' || category === 'joint'
}

// The kinds the inventory counts: everything except gear.
export const INVENTORY_KINDS: readonly string[] = ITEMS.filter(
  (item) => item.category !== 'gear'
).map((item) => item.id)

// The cigarette that a bare "smoke" press lights: the selected one when the
// player still carries it, else the first one in ITEMS order they carry.
// Null when they carry none.
export function cigaretteToSmoke(
  inv: Inventory,
  selected: string | null
): string | null {
  if (selected && isCigarette(selected) && inv[selected] > 0) return selected
  return CIGARETTE_IDS.find((id) => inv[id] > 0) || null
}
