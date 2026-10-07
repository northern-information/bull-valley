// Every item in Bull Valley, in one table: identity and tuning, with its
// words from COPY.toml ([items.<id>]). Edit an item here and the pack grid,
// the Citgo shelves, pickups, and chat lines follow.
// Pure, no Three. Meshes stay in assets.ts, keyed by id.
//
// Fields:
//   id        inventory kind and mesh key
//   category  'cigarette' | 'joint' | 'drink' | 'medicine' | 'forage' |
//             'material'
//   label     name in the pack, and floating over a pickup or shelf unit
//   blurb     description on the pack's item card
//   used      chat line when the player uses it
//   bought    chat line when the player buys it at a Citgo (shelf items only)
//   collected chat line when the player picks it off a berry bush
//   empty     chat line when the player tries to use it with none left
//   start     count in a new inventory (counted items only)
//   price     shelf price at every Citgo, in cents (shelf items only)
//   contents  how many the pack, bottle or box holds (1 when absent); the
//             inventory counts these, and a buy or a pickup adds a full one
//   geometrie how far one use moves each geometrie level (geometrie.ts)
//   tripSeconds  how long a drink's trails last (trip.ts); a cigarette's
//             last while it smokes, the joint's while perception does
//
// Medicine cannot be used yet, so it has no used or empty text. Forage is
// never on a shelf, so it has no price or bought text; the valley hands it out
// (sharedworld.ts rules 4 and 8).

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
    contents: 20,
    smokeSeconds: 12,
    emberSeconds: 20,
    geometrie: { stimulated: 0.12 },
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
    contents: 20,
    smokeSeconds: 14,
    emberSeconds: 20,
    geometrie: { stimulated: 0.12 },
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
    contents: 20,
    smokeSeconds: 13,
    emberSeconds: 16,
    geometrie: { stimulated: 0.1 },
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
    contents: 20,
    smokeSeconds: 9,
    emberSeconds: 14,
    geometrie: { stimulated: 0.1 },
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
    contents: 20,
    smokeSeconds: 18,
    emberSeconds: 26,
    geometrie: { stimulated: 0.15 },
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
    geometrie: { high: 0.5 },
  },
  // Drinks, circa 2008. Drinking one moves geometrie (geometrie.ts): the
  // energy drinks stimulate, the beer and the liquor get you drunk, Four
  // Loko does both, and water sobers you a little. Each blurs the view and
  // trails it for tripSeconds (trip.ts); the water only blurs. container is a key into
  // CONTAINERS in drinks.ts.
  {
    id: 'monster',
    category: 'drink',
    label: copy('items.monster.label'),
    blurb: copy('items.monster.blurb'),
    used: copy('items.monster.used'),
    bought: copy('items.monster.bought'),
    empty: copy('items.monster.empty'),
    start: 0,
    price: 219,
    container: 'tall',
    tripSeconds: 30,
    geometrie: { stimulated: 0.3 },
  },
  {
    id: 'monster-ultra',
    category: 'drink',
    label: copy('items.monster-ultra.label'),
    blurb: copy('items.monster-ultra.blurb'),
    used: copy('items.monster-ultra.used'),
    bought: copy('items.monster-ultra.bought'),
    empty: copy('items.monster-ultra.empty'),
    start: 0,
    price: 219,
    container: 'tall',
    tripSeconds: 30,
    geometrie: { stimulated: 0.25 },
  },
  {
    id: 'red-bull',
    category: 'drink',
    label: copy('items.red-bull.label'),
    blurb: copy('items.red-bull.blurb'),
    used: copy('items.red-bull.used'),
    bought: copy('items.red-bull.bought'),
    empty: copy('items.red-bull.empty'),
    start: 0,
    price: 199,
    container: 'slim',
    tripSeconds: 30,
    geometrie: { stimulated: 0.25 },
  },
  {
    id: 'rip-it',
    category: 'drink',
    label: copy('items.rip-it.label'),
    blurb: copy('items.rip-it.blurb'),
    used: copy('items.rip-it.used'),
    bought: copy('items.rip-it.bought'),
    empty: copy('items.rip-it.empty'),
    start: 0,
    price: 99,
    container: 'tall',
    tripSeconds: 30,
    geometrie: { stimulated: 0.3 },
  },
  {
    id: 'rockstar',
    category: 'drink',
    label: copy('items.rockstar.label'),
    blurb: copy('items.rockstar.blurb'),
    used: copy('items.rockstar.used'),
    bought: copy('items.rockstar.bought'),
    empty: copy('items.rockstar.empty'),
    start: 0,
    price: 199,
    container: 'tall',
    tripSeconds: 30,
    geometrie: { stimulated: 0.3 },
  },
  {
    id: 'nos',
    category: 'drink',
    label: copy('items.nos.label'),
    blurb: copy('items.nos.blurb'),
    used: copy('items.nos.used'),
    bought: copy('items.nos.bought'),
    empty: copy('items.nos.empty'),
    start: 0,
    price: 229,
    container: 'nos',
    tripSeconds: 30,
    geometrie: { stimulated: 0.35 },
  },
  {
    id: 'four-loko-blue',
    category: 'drink',
    label: copy('items.four-loko-blue.label'),
    blurb: copy('items.four-loko-blue.blurb'),
    used: copy('items.four-loko-blue.used'),
    bought: copy('items.four-loko-blue.bought'),
    empty: copy('items.four-loko-blue.empty'),
    start: 0,
    price: 249,
    container: 'tall',
    tripSeconds: 120,
    geometrie: { stimulated: 0.3, drunk: 0.35 },
  },
  {
    id: 'four-loko-punch',
    category: 'drink',
    label: copy('items.four-loko-punch.label'),
    blurb: copy('items.four-loko-punch.blurb'),
    used: copy('items.four-loko-punch.used'),
    bought: copy('items.four-loko-punch.bought'),
    empty: copy('items.four-loko-punch.empty'),
    start: 0,
    price: 249,
    container: 'tall',
    tripSeconds: 120,
    geometrie: { stimulated: 0.3, drunk: 0.35 },
  },
  {
    id: 'four-loko-lemon',
    category: 'drink',
    label: copy('items.four-loko-lemon.label'),
    blurb: copy('items.four-loko-lemon.blurb'),
    used: copy('items.four-loko-lemon.used'),
    bought: copy('items.four-loko-lemon.bought'),
    empty: copy('items.four-loko-lemon.empty'),
    start: 0,
    price: 249,
    container: 'tall',
    tripSeconds: 120,
    geometrie: { stimulated: 0.3, drunk: 0.35 },
  },
  {
    id: 'wild-turkey',
    category: 'drink',
    label: copy('items.wild-turkey.label'),
    blurb: copy('items.wild-turkey.blurb'),
    used: copy('items.wild-turkey.used'),
    bought: copy('items.wild-turkey.bought'),
    empty: copy('items.wild-turkey.empty'),
    start: 0,
    price: 2199,
    container: 'bourbon',
    tripSeconds: 90,
    geometrie: { drunk: 0.5 },
  },
  {
    id: 'jim-beam',
    category: 'drink',
    label: copy('items.jim-beam.label'),
    blurb: copy('items.jim-beam.blurb'),
    used: copy('items.jim-beam.used'),
    bought: copy('items.jim-beam.bought'),
    empty: copy('items.jim-beam.empty'),
    start: 0,
    price: 1599,
    container: 'square',
    tripSeconds: 90,
    geometrie: { drunk: 0.45 },
  },
  {
    id: 'grey-goose',
    category: 'drink',
    label: copy('items.grey-goose.label'),
    blurb: copy('items.grey-goose.blurb'),
    used: copy('items.grey-goose.used'),
    bought: copy('items.grey-goose.bought'),
    empty: copy('items.grey-goose.empty'),
    start: 0,
    price: 2999,
    container: 'goose',
    tripSeconds: 90,
    geometrie: { drunk: 0.45 },
  },
  {
    id: 'pbr',
    category: 'drink',
    label: copy('items.pbr.label'),
    blurb: copy('items.pbr.blurb'),
    used: copy('items.pbr.used'),
    bought: copy('items.pbr.bought'),
    empty: copy('items.pbr.empty'),
    start: 0,
    price: 99,
    container: 'can12',
    tripSeconds: 60,
    geometrie: { drunk: 0.15 },
  },
  {
    id: 'high-life',
    category: 'drink',
    label: copy('items.high-life.label'),
    blurb: copy('items.high-life.blurb'),
    used: copy('items.high-life.used'),
    bought: copy('items.high-life.bought'),
    empty: copy('items.high-life.empty'),
    start: 0,
    price: 129,
    container: 'longneck',
    tripSeconds: 60,
    geometrie: { drunk: 0.15 },
  },
  {
    id: 'modelo',
    category: 'drink',
    label: copy('items.modelo.label'),
    blurb: copy('items.modelo.blurb'),
    used: copy('items.modelo.used'),
    bought: copy('items.modelo.bought'),
    empty: copy('items.modelo.empty'),
    start: 0,
    price: 149,
    container: 'can12',
    tripSeconds: 60,
    geometrie: { drunk: 0.15 },
  },
  {
    id: 'md-2020',
    category: 'drink',
    label: copy('items.md-2020.label'),
    blurb: copy('items.md-2020.blurb'),
    used: copy('items.md-2020.used'),
    bought: copy('items.md-2020.bought'),
    empty: copy('items.md-2020.empty'),
    start: 0,
    price: 299,
    container: 'flask',
    tripSeconds: 90,
    geometrie: { drunk: 0.3 },
  },
  {
    id: 'ice-mountain',
    category: 'drink',
    label: copy('items.ice-mountain.label'),
    blurb: copy('items.ice-mountain.blurb'),
    used: copy('items.ice-mountain.used'),
    bought: copy('items.ice-mountain.bought'),
    empty: copy('items.ice-mountain.empty'),
    start: 0,
    price: 119,
    container: 'water',
    tripSeconds: 1,
    geometrie: { drunk: -0.1 },
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
    contents: 24,
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
    contents: 24,
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
    contents: 24,
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
  // Forage. Not for sale: cabbages grow wild across the valley and come
  // back with the day, and the berry bushes give every account one berry
  // each a day, the day turning at midnight Central. No effect yet.
  {
    id: 'cabbage',
    category: 'forage',
    label: copy('items.cabbage.label'),
    blurb: copy('items.cabbage.blurb'),
    start: 0,
  },
  {
    id: 'berries',
    category: 'forage',
    label: copy('items.berries.label'),
    blurb: copy('items.berries.blurb'),
    collected: copy('items.berries.collected'),
    start: 0,
  },
  // Materials. Not for sale: the Caretaker leaves gold bullion where two
  // beams unmade it (sharedworld.ts rule 13). One is a 1 troy ounce bar.
  // No use yet.
  {
    id: 'gold-bullion',
    category: 'material',
    label: copy('items.gold-bullion.label'),
    blurb: copy('items.gold-bullion.blurb'),
    start: 0,
  },
] as const satisfies readonly Item[]

type ItemEntry = (typeof ITEMS)[number]

// Every item id, as a type: a typo in a literal id fails the type check.
export type ItemId = ItemEntry['id']

// What a pickup in the valley can be: an item, or the dimes a shadowman
// bursts into (drops.ts DIMES), which are cash and never an item.
export type PickupKind = ItemId | 'dimes'

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
  return (
    category === 'cigarette' || category === 'joint' || category === 'drink'
  )
}

// How long using one unit of `id` puts trails on the view (trip.ts): a
// cigarette while it smokes, the joint while perception lasts, a drink its
// own tripSeconds. Zero for anything else.
export function tripSecondsOf(id: string): number {
  const item = itemById(id)
  if (!item) return 0
  if (item.category === 'cigarette') return item.smokeSeconds ?? 0
  if (item.category === 'joint') return item.perceptionSeconds ?? 0
  return item.tripSeconds ?? 0
}

// The kinds the inventory counts: every item.
export const INVENTORY_KINDS: readonly string[] = ITEMS.map((item) => item.id)

// How many one container of `id` holds: a pack of cigarettes, a bottle or
// box of pills. The inventory counts what is inside; everything else is
// one to a container.
export function contentsOf(id: string): number {
  return itemById(id)?.contents ?? 1
}

// The containers `units` of `id` fill: every one full but the open one.
export function containersOf(id: string, units: number): number {
  return units > 0 ? Math.ceil(units / contentsOf(id)) : 0
}

// What is left in the open container, or null for an item that comes one
// to a container.
export function leftInOpen(id: string, units: number): number | null {
  const contents = contentsOf(id)
  if (contents === 1) return null
  if (units < 1) return 0
  return units - (containersOf(id, units) - 1) * contents
}
