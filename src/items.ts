// Every item in Bull Valley, in one table: identity and tuning. Its words
// (the label, the blurb and the chat lines, COPY.toml [items.<id>]) are
// itemcopy.ts's, so this table and every pure module that reads it stay
// free of the copy book. Edit an item here and the pack grid, the Citgo
// shelves, pickups, and chat lines follow.
// Pure, no Three. Meshes stay in assets.ts, keyed by id.
//
// An Item is one of a union by category (below), so each category carries
// exactly the fields it uses and a reader narrows on `category` instead of
// checking which fields exist. Common to all:
//   id        inventory kind and mesh key
//   category  'cigarette' | 'joint' | 'drink' | 'medicine' | 'forage' |
//             'valuable'
//   start     count in a new inventory
//   contents  how many the pack, bottle or box holds (1 when absent); the
//             inventory counts these, and a buy or a pickup adds a full one
// On the shelf items (everything but forage and valuables):
//   price     shelf price at every Citgo, in cents
// By category:
//   geometrie how far one use moves each geometrie level (geometrie.ts):
//             a cigarette's, the joint's and a drink's
//   smokeSeconds, emberSeconds  a cigarette burns, then smoulders
//   perceptionSeconds  the joint resolves the shadowmen through the murk
//   container a drink's shape, a key into CONTAINERS in drinks.ts
//   tripSeconds  how long a drink's trails last (trip.ts); a cigarette's
//             last while it smokes, the joint's while perception does
//   form      a medicine's packaging (MedicineForm, the shape assets.ts
//             builds)
//   heals     health points one use of a medicine gives back (health.ts,
//             sharedworld.ts rule 24): one pill of aspirin or ibuprofen
//             gives one back
//
// Medicine that does not heal cannot be used yet. Forage is never on a
// shelf, so it has no price; the valley hands it out (sharedworld.ts rules
// 4 and 8).

import type { CashKind } from './drops.ts'
import type { ContainerKey, GeometrieAxis, MedicineForm } from './interfaces.ts'

// How far one use moves each geometrie level (geometrie.ts), 0 to 1.
export type GeometrieDose = Partial<Record<GeometrieAxis, number>>

interface ItemBase {
  id: string
  // Count in a new inventory.
  start: number
  // How many one container holds (contentsOf); 1 when absent.
  contents?: number
}

// What is on a Citgo shelf: priced in cents.
interface Shelf {
  price: number
}

export interface Cigarette extends ItemBase, Shelf {
  category: 'cigarette'
  smokeSeconds: number
  emberSeconds: number
  geometrie: GeometrieDose
}

export interface Joint extends ItemBase, Shelf {
  category: 'joint'
  perceptionSeconds: number
  geometrie: GeometrieDose
}

export interface Drink extends ItemBase, Shelf {
  category: 'drink'
  container: ContainerKey
  tripSeconds: number
  geometrie: GeometrieDose
}

export interface Medicine extends ItemBase, Shelf {
  category: 'medicine'
  form: MedicineForm
  // Health points one use gives back; medicine without it cannot be used
  // yet.
  heals?: number
}

// Never on a shelf: the valley hands it out.
export interface Forage extends ItemBase {
  category: 'forage'
  price?: undefined
}

// Never on a shelf and of no use, but Moab takes it in trade.
export interface Valuable extends ItemBase {
  category: 'valuable'
  price?: undefined
}

export type Item = Cigarette | Joint | Drink | Medicine | Forage | Valuable

export type ItemCategory = Item['category']

export const ITEMS = [
  {
    id: 'marlboro',
    category: 'cigarette',
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
    start: 0,
    price: 219,
    container: 'tall',
    tripSeconds: 30,
    geometrie: { stimulated: 0.3 },
  },
  {
    id: 'monster-ultra',
    category: 'drink',
    start: 0,
    price: 219,
    container: 'tall',
    tripSeconds: 30,
    geometrie: { stimulated: 0.25 },
  },
  {
    id: 'red-bull',
    category: 'drink',
    start: 0,
    price: 199,
    container: 'slim',
    tripSeconds: 30,
    geometrie: { stimulated: 0.25 },
  },
  {
    id: 'rip-it',
    category: 'drink',
    start: 0,
    price: 99,
    container: 'tall',
    tripSeconds: 30,
    geometrie: { stimulated: 0.3 },
  },
  {
    id: 'rockstar',
    category: 'drink',
    start: 0,
    price: 199,
    container: 'tall',
    tripSeconds: 30,
    geometrie: { stimulated: 0.3 },
  },
  {
    id: 'nos',
    category: 'drink',
    start: 0,
    price: 229,
    container: 'nos',
    tripSeconds: 30,
    geometrie: { stimulated: 0.35 },
  },
  {
    id: 'four-loko-blue',
    category: 'drink',
    start: 0,
    price: 249,
    container: 'tall',
    tripSeconds: 120,
    geometrie: { stimulated: 0.3, drunk: 0.35 },
  },
  {
    id: 'four-loko-punch',
    category: 'drink',
    start: 0,
    price: 249,
    container: 'tall',
    tripSeconds: 120,
    geometrie: { stimulated: 0.3, drunk: 0.35 },
  },
  {
    id: 'four-loko-lemon',
    category: 'drink',
    start: 0,
    price: 249,
    container: 'tall',
    tripSeconds: 120,
    geometrie: { stimulated: 0.3, drunk: 0.35 },
  },
  {
    id: 'wild-turkey',
    category: 'drink',
    start: 0,
    price: 2199,
    container: 'bourbon',
    tripSeconds: 90,
    geometrie: { drunk: 0.5 },
  },
  {
    id: 'jim-beam',
    category: 'drink',
    start: 0,
    price: 1599,
    container: 'square',
    tripSeconds: 90,
    geometrie: { drunk: 0.45 },
  },
  {
    id: 'grey-goose',
    category: 'drink',
    start: 0,
    price: 2999,
    container: 'goose',
    tripSeconds: 90,
    geometrie: { drunk: 0.45 },
  },
  {
    id: 'pbr',
    category: 'drink',
    start: 0,
    price: 99,
    container: 'can12',
    tripSeconds: 60,
    geometrie: { drunk: 0.15 },
  },
  {
    id: 'high-life',
    category: 'drink',
    start: 0,
    price: 129,
    container: 'longneck',
    tripSeconds: 60,
    geometrie: { drunk: 0.15 },
  },
  {
    id: 'modelo',
    category: 'drink',
    start: 0,
    price: 149,
    container: 'can12',
    tripSeconds: 60,
    geometrie: { drunk: 0.15 },
  },
  {
    id: 'md-2020',
    category: 'drink',
    start: 0,
    price: 299,
    container: 'flask',
    tripSeconds: 90,
    geometrie: { drunk: 0.3 },
  },
  {
    id: 'ice-mountain',
    category: 'drink',
    start: 0,
    price: 119,
    container: 'water',
    tripSeconds: 1,
    geometrie: { drunk: -0.1 },
  },
  // Medicine, off the rack by the register. A pill of aspirin or
  // ibuprofen gives a health point back; the rest has no effect yet: the
  // player can buy and carry it, not take it. form is a MedicineForm
  // (interfaces.ts), the shape assets.ts builds.
  {
    id: 'aspirin',
    category: 'medicine',
    start: 0,
    price: 449,
    contents: 24,
    form: 'pills',
    heals: 1,
  },
  {
    id: 'ibuprofen',
    category: 'medicine',
    start: 0,
    price: 499,
    contents: 24,
    form: 'pills',
    heals: 1,
  },
  {
    id: 'benadryl',
    category: 'medicine',
    start: 0,
    price: 699,
    contents: 24,
    form: 'carton',
  },
  {
    id: 'eye-drops',
    category: 'medicine',
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
    start: 0,
  },
  {
    id: 'berries',
    category: 'forage',
    start: 0,
  },
  // Valuables. Not for sale and of no use, but Moab Coldë takes them in
  // trade (cosmetics.ts). One unit is one troy ounce.
  {
    id: 'gold-bullion',
    category: 'valuable',
    start: 0,
  },
] as const satisfies readonly Item[]

type ItemEntry = (typeof ITEMS)[number]

// Every item id, as a type: a typo in a literal id fails the type check.
export type ItemId = ItemEntry['id']

// What a pickup in the valley can be: an item, or the cash a shadow bursts
// into (drops.ts CashKind: dimes, a spider's $20), never an item.
export type PickupKind = ItemId | CashKind

const BY_ID = new Map<string, Item>(ITEMS.map((item) => [item.id, item]))

// Whether an id that came from outside the table is an item's.
export function isItemId(id: string): id is ItemId {
  return BY_ID.has(id)
}

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
// key): anything smoked or drunk, and medicine that heals.
export function isUsable(id: string): boolean {
  const item = itemById(id)
  if (!item) return false
  switch (item.category) {
    case 'cigarette':
    case 'joint':
    case 'drink':
      return true
    case 'medicine':
      return (item.heals ?? 0) > 0
    case 'forage':
    case 'valuable':
      return false
  }
}

// Health points one use of `id` gives back (health.ts); 0 for anything
// that does not heal.
export function healsOf(id: string): number {
  const item = itemById(id)
  return item?.category === 'medicine' ? (item.heals ?? 0) : 0
}

// How far one use of `id` moves geometrie (geometrie.ts dose): anything
// smoked or drunk has a dose; nothing else moves it.
export function geometrieOf(id: string): GeometrieDose | undefined {
  const item = itemById(id)
  if (!item) return undefined
  switch (item.category) {
    case 'cigarette':
    case 'joint':
    case 'drink':
      return item.geometrie
    default:
      return undefined
  }
}

// How long using one unit of `id` puts trails on the view (trip.ts): a
// cigarette while it smokes, the joint while perception lasts, a drink its
// own tripSeconds. Zero for anything else.
export function tripSecondsOf(id: string): number {
  const item = itemById(id)
  if (!item) return 0
  switch (item.category) {
    case 'cigarette':
      return item.smokeSeconds
    case 'joint':
      return item.perceptionSeconds
    case 'drink':
      return item.tripSeconds
    default:
      return 0
  }
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
