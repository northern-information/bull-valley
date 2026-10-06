// Every item in Bull Valley, in one table: identity and tuning, with its
// words from COPY.toml ([items.<id>]). Edit an item here and the pack grid,
// the Citgo shelves, pickups, and chat lines follow.
// Pure, no Three. Meshes stay in assets.ts, keyed by id.
//
// Fields:
//   id        inventory kind and mesh key
//   category  'cigarette' | 'joint' | 'drink' | 'medicine' | 'forage'
//   label     name in the pack, and floating over a pickup or shelf unit
//   blurb     description on the pack's item card
//   used      chat line when the player uses it
//   bought    chat line when the player buys it at a Citgo (shelf items only)
//   collected chat line when the player picks it off the berry bush (forage)
//   empty     chat line when the player tries to use it with none left
//   start     count in a new inventory (counted items only)
//   price     shelf price at every Citgo, in cents (shelf items only)
//
// Drinks and medicine cannot be used yet, so they have no used or empty text. Forage is never
// on a shelf, so it has no price or bought text; the valley hands it out
// (sharedraid.ts rule 9).

import { copy } from './copy.ts'
import type { Item } from './interfaces.ts'

export const ITEMS = [
  {
    id: 'marlboro',
    category: 'cigarette',
    label: copy('items.marlboro.label'),
    blurb: copy('items.marlboro.blurb'),
    used: copy('items.marlboro.used'),
    bought: copy('items.marlboro.bought'),
    empty: copy('items.marlboro.empty'),
    start: 2,
    price: 549,
    smokeSeconds: 12,
    emberSeconds: 20,
  },
  {
    id: 'camel',
    category: 'cigarette',
    label: copy('items.camel.label'),
    blurb: copy('items.camel.blurb'),
    used: copy('items.camel.used'),
    bought: copy('items.camel.bought'),
    empty: copy('items.camel.empty'),
    start: 0,
    price: 529,
    smokeSeconds: 14,
    emberSeconds: 20,
  },
  {
    id: 'parliament',
    category: 'cigarette',
    label: copy('items.parliament.label'),
    blurb: copy('items.parliament.blurb'),
    used: copy('items.parliament.used'),
    bought: copy('items.parliament.bought'),
    empty: copy('items.parliament.empty'),
    start: 0,
    price: 599,
    smokeSeconds: 13,
    emberSeconds: 16,
  },
  {
    id: 'newport',
    category: 'cigarette',
    label: copy('items.newport.label'),
    blurb: copy('items.newport.blurb'),
    used: copy('items.newport.used'),
    bought: copy('items.newport.bought'),
    empty: copy('items.newport.empty'),
    start: 0,
    price: 549,
    smokeSeconds: 9,
    emberSeconds: 14,
  },
  {
    id: 'djarum',
    category: 'cigarette',
    label: copy('items.djarum.label'),
    blurb: copy('items.djarum.blurb'),
    used: copy('items.djarum.used'),
    bought: copy('items.djarum.bought'),
    empty: copy('items.djarum.empty'),
    start: 0,
    price: 649,
    smokeSeconds: 18,
    emberSeconds: 26,
  },
  {
    id: 'joints',
    category: 'joint',
    label: copy('items.joints.label'),
    blurb: copy('items.joints.blurb'),
    used: copy('items.joints.used'),
    bought: copy('items.joints.bought'),
    empty: copy('items.joints.empty'),
    start: 1,
    price: 1000,
    // Shadowmen resolve through the murk while it lasts.
    perceptionSeconds: 120,
  },
  // Drinks, circa 2008. No effect yet: the player can buy and carry them,
  // not drink them. container is a key into CONTAINERS in drinks.ts.
  {
    id: 'monster',
    category: 'drink',
    label: copy('items.monster.label'),
    blurb: copy('items.monster.blurb'),
    bought: copy('items.monster.bought'),
    start: 0,
    price: 219,
    container: 'tall',
  },
  {
    id: 'monster-ultra',
    category: 'drink',
    label: copy('items.monster-ultra.label'),
    blurb: copy('items.monster-ultra.blurb'),
    bought: copy('items.monster-ultra.bought'),
    start: 0,
    price: 219,
    container: 'tall',
  },
  {
    id: 'red-bull',
    category: 'drink',
    label: copy('items.red-bull.label'),
    blurb: copy('items.red-bull.blurb'),
    bought: copy('items.red-bull.bought'),
    start: 0,
    price: 199,
    container: 'slim',
  },
  {
    id: 'rip-it',
    category: 'drink',
    label: copy('items.rip-it.label'),
    blurb: copy('items.rip-it.blurb'),
    bought: copy('items.rip-it.bought'),
    start: 0,
    price: 99,
    container: 'tall',
  },
  {
    id: 'rockstar',
    category: 'drink',
    label: copy('items.rockstar.label'),
    blurb: copy('items.rockstar.blurb'),
    bought: copy('items.rockstar.bought'),
    start: 0,
    price: 199,
    container: 'tall',
  },
  {
    id: 'nos',
    category: 'drink',
    label: copy('items.nos.label'),
    blurb: copy('items.nos.blurb'),
    bought: copy('items.nos.bought'),
    start: 0,
    price: 229,
    container: 'nos',
  },
  {
    id: 'four-loko-blue',
    category: 'drink',
    label: copy('items.four-loko-blue.label'),
    blurb: copy('items.four-loko-blue.blurb'),
    bought: copy('items.four-loko-blue.bought'),
    start: 0,
    price: 249,
    container: 'tall',
  },
  {
    id: 'four-loko-punch',
    category: 'drink',
    label: copy('items.four-loko-punch.label'),
    blurb: copy('items.four-loko-punch.blurb'),
    bought: copy('items.four-loko-punch.bought'),
    start: 0,
    price: 249,
    container: 'tall',
  },
  {
    id: 'four-loko-lemon',
    category: 'drink',
    label: copy('items.four-loko-lemon.label'),
    blurb: copy('items.four-loko-lemon.blurb'),
    bought: copy('items.four-loko-lemon.bought'),
    start: 0,
    price: 249,
    container: 'tall',
  },
  {
    id: 'wild-turkey',
    category: 'drink',
    label: copy('items.wild-turkey.label'),
    blurb: copy('items.wild-turkey.blurb'),
    bought: copy('items.wild-turkey.bought'),
    start: 0,
    price: 2199,
    container: 'bourbon',
  },
  {
    id: 'jim-beam',
    category: 'drink',
    label: copy('items.jim-beam.label'),
    blurb: copy('items.jim-beam.blurb'),
    bought: copy('items.jim-beam.bought'),
    start: 0,
    price: 1599,
    container: 'square',
  },
  {
    id: 'grey-goose',
    category: 'drink',
    label: copy('items.grey-goose.label'),
    blurb: copy('items.grey-goose.blurb'),
    bought: copy('items.grey-goose.bought'),
    start: 0,
    price: 2999,
    container: 'goose',
  },
  {
    id: 'pbr',
    category: 'drink',
    label: copy('items.pbr.label'),
    blurb: copy('items.pbr.blurb'),
    bought: copy('items.pbr.bought'),
    start: 0,
    price: 99,
    container: 'can12',
  },
  {
    id: 'high-life',
    category: 'drink',
    label: copy('items.high-life.label'),
    blurb: copy('items.high-life.blurb'),
    bought: copy('items.high-life.bought'),
    start: 0,
    price: 129,
    container: 'longneck',
  },
  {
    id: 'modelo',
    category: 'drink',
    label: copy('items.modelo.label'),
    blurb: copy('items.modelo.blurb'),
    bought: copy('items.modelo.bought'),
    start: 0,
    price: 149,
    container: 'can12',
  },
  {
    id: 'md-2020',
    category: 'drink',
    label: copy('items.md-2020.label'),
    blurb: copy('items.md-2020.blurb'),
    bought: copy('items.md-2020.bought'),
    start: 0,
    price: 299,
    container: 'flask',
  },
  {
    id: 'ice-mountain',
    category: 'drink',
    label: copy('items.ice-mountain.label'),
    blurb: copy('items.ice-mountain.blurb'),
    bought: copy('items.ice-mountain.bought'),
    start: 0,
    price: 119,
    container: 'water',
  },
  // Medicine, off the rack by the register. No effect yet: the player can
  // buy and carry it, not take it. form is a MedicineForm (interfaces.ts),
  // the shape assets.ts builds.
  {
    id: 'aspirin',
    category: 'medicine',
    label: copy('items.aspirin.label'),
    blurb: copy('items.aspirin.blurb'),
    bought: copy('items.aspirin.bought'),
    start: 0,
    price: 449,
    form: 'pills',
  },
  {
    id: 'ibuprofen',
    category: 'medicine',
    label: copy('items.ibuprofen.label'),
    blurb: copy('items.ibuprofen.blurb'),
    bought: copy('items.ibuprofen.bought'),
    start: 0,
    price: 499,
    form: 'pills',
  },
  {
    id: 'benadryl',
    category: 'medicine',
    label: copy('items.benadryl.label'),
    blurb: copy('items.benadryl.blurb'),
    bought: copy('items.benadryl.bought'),
    start: 0,
    price: 699,
    form: 'carton',
  },
  {
    id: 'eye-drops',
    category: 'medicine',
    label: copy('items.eye-drops.label'),
    blurb: copy('items.eye-drops.blurb'),
    bought: copy('items.eye-drops.bought'),
    start: 0,
    price: 549,
    form: 'dropper',
  },
  // Forage. Not for sale: the berry bush at the spawn Citgo gives every
  // account one a day, the day turning at midnight Central. No effect yet.
  {
    id: 'berries',
    category: 'forage',
    label: copy('items.berries.label'),
    blurb: copy('items.berries.blurb'),
    collected: copy('items.berries.collected'),
    start: 0,
  },
] as const satisfies readonly Item[]

type ItemEntry = (typeof ITEMS)[number]

// Every item id, as a type: a typo in a literal id fails the type check.
export type ItemId = ItemEntry['id']

// What a pickup in the valley can be: a cabbage, or an item.
export type PickupKind = 'cabbage' | ItemId

// ITEMS widened to the plain Item shape, for code that reads optional
// fields (container) across every entry.

const BY_ID = new Map<string, Item>(ITEMS.map((item) => [item.id, item]))

// Look up an id that came from outside the table (saved inventory, a ring
// entry). Null when the id is unknown.
export function itemById(id: string): Item | null {
  return BY_ID.get(id) || null
}

// Look up a literal id. The return type is that exact entry, so its fields
// (a drink's container, say) need no null checks. The cast is safe: K is
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

export function isMedicine(id: string): boolean {
  return itemById(id)?.category === 'medicine'
}

// Whether the player can use a carried item (E in the pack, or its hotbar
// key).
export function isUsable(id: string): boolean {
  const category = itemById(id)?.category
  return category === 'cigarette' || category === 'joint'
}

// The kinds the inventory counts: every item.
export const INVENTORY_KINDS: readonly string[] = ITEMS.map((item) => item.id)
