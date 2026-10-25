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
//   category  'cigarette' | 'joint' | 'psychedelic' | 'stimulant' |
//             'drink' | 'medicine' | 'forage' | 'valuable' | 'material' |
//             'fish' | 'food' | 'rod' | 'key-item'
//   start     count in a new inventory
//   contents  how many the pack, bottle or box holds (1 when absent); the
//             inventory counts these, and a buy or a pickup adds a full one
// On the shelf items (everything but forage and valuables):
//   price     shelf price at every Citgo, in cents
// By category:
//   wards     how far one use moves each ward's level (wardlevels.ts):
//             a cigarette's, the joint's and a drink's
//   smokeSeconds, emberSeconds  a cigarette burns, then smoulders
//   perceptionSeconds  the joint (and a psychedelic) resolves the shadowmen
//             through the murk
//   container a drink's shape, a key into CONTAINERS in drinks.ts
//   tripSeconds  how long a drink's trip lasts (hotbar.ts Effects.trip,
//             which the card shows as Trails); a cigarette's lasts while
//             it smokes, the joint's while perception does. The view's
//             trails themselves follow the drunk ward (wardview.ts)
//   form      a medicine's packaging (MedicineForm, the shape assets.ts
//             builds)
//   healsPct  the share of whole geometrie one use gives back, in percent
//             (health.ts, sharedworld.ts rule 24): everything smoked,
//             drunk or swallowed gives 15 back, the joint, the
//             psychedelics, Four Loko and the liquor 30; a fish eaten raw
//             5, cooked over the campfire 20 for a small one and 40 for
//             a large (cooking.ts)
//
// Forage is never on a shelf, so it has no price or bought text; the
// valley hands it out (sharedworld.ts rules 4 and 8).

import type { CashKind } from './drops.ts'
import type { ContainerKey, MedicineForm, WardAxis } from './interfaces.ts'

// How far one use moves each ward's level (wardlevels.ts), 0 to 1.
type WardDose = Partial<Record<WardAxis, number>>

interface ItemBase {
  id: string
  // Count in a new inventory.
  start: number
  // How many one container holds (contentsOf); 1 when absent.
  contents?: number
}

// What is on a Citgo shelf: priced in cents, and most of it gives health
// back when used (health.ts, sharedworld.ts rule 24).
interface Shelf {
  price: number
  healsPct?: number
}

export interface Cigarette extends ItemBase, Shelf {
  category: 'cigarette'
  smokeSeconds: number
  emberSeconds: number
  wards: WardDose
}

interface Joint extends ItemBase, Shelf {
  category: 'joint'
  perceptionSeconds: number
  wards: WardDose
}

export interface Drink extends ItemBase, Shelf {
  category: 'drink'
  container: ContainerKey
  tripSeconds: number
  wards: WardDose
}

export interface Medicine extends ItemBase, Shelf {
  category: 'medicine'
  form: MedicineForm
  wards: WardDose
}

// Never on a shelf: Erwin von Dutch deals them (dealer.ts). The
// psychedelics work like the joint, harder and longer; the stimulant like
// a drink, a trip and a dose.
interface Psychedelic extends ItemBase {
  category: 'psychedelic'
  price?: undefined
  perceptionSeconds: number
  wards: WardDose
  healsPct: number
}

interface Stimulant extends ItemBase {
  category: 'stimulant'
  price?: undefined
  tripSeconds: number
  wards: WardDose
  healsPct: number
}

// Never on a shelf: the valley hands it out.
interface Forage extends ItemBase {
  category: 'forage'
  price?: undefined
}

// Never on a shelf and of no use, but Moab takes it in trade.
interface Valuable extends ItemBase {
  category: 'valuable'
  price?: undefined
}

// Never on a shelf and of no use yet: what using something leaves behind
// (recycling.ts emptyOf, sharedworld.ts rule 32), for the Recycling Center
// at the recycling machine to take in.
interface Material extends ItemBase {
  category: 'material'
  price?: undefined
}

// Never on a shelf: what the firefly pond gives up (fishing.ts,
// sharedworld.ts rule 36). Eaten raw it gives a little back; cooked over
// the campfire by the pond it is food (cooking.ts). Erwin von Dutch takes
// it raw in barter at `worth` cents a fish (dealer.ts unitWorth).
interface Fish extends ItemBase {
  category: 'fish'
  price?: undefined
  worth: number
  healsPct: number
}

// Never on a shelf: a fish cooked over the campfire (cooking.ts), eaten
// for what it gives back.
interface Food extends ItemBase {
  category: 'food'
  price?: undefined
  healsPct: number
}

// On the rod rack in every Citgo, and of no use but at the pond: a rod
// better than the tackle box's (fishing.ts RODS holds how much better).
interface Rod extends ItemBase, Shelf {
  category: 'rod'
}

// What a quest gives or asks for (quests.ts), and the keys, which open
// their locks for whoever carries them (keys.ts): never used up, never
// dropped and never stowed in the locker; a strike leaves them in the pack
// (corpses.ts), as Elden Ring keeps its key items through a death.
interface KeyItem extends ItemBase {
  category: 'key-item'
  price?: undefined
}

export type Item =
  | Cigarette
  | Joint
  | Drink
  | Medicine
  | Psychedelic
  | Stimulant
  | Forage
  | Valuable
  | Material
  | Fish
  | Food
  | Rod
  | KeyItem

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
    wards: { stimulated: 0.12 },
    healsPct: 15,
  },
  {
    id: 'camel',
    category: 'cigarette',
    start: 0,
    price: 529,
    contents: 20,
    smokeSeconds: 14,
    emberSeconds: 20,
    wards: { stimulated: 0.12 },
    healsPct: 15,
  },
  {
    id: 'parliament',
    category: 'cigarette',
    start: 0,
    price: 599,
    contents: 20,
    smokeSeconds: 13,
    emberSeconds: 16,
    wards: { stimulated: 0.1 },
    healsPct: 15,
  },
  {
    id: 'newport',
    category: 'cigarette',
    start: 0,
    price: 549,
    contents: 20,
    smokeSeconds: 9,
    emberSeconds: 14,
    wards: { stimulated: 0.1 },
    healsPct: 15,
  },
  {
    id: 'djarum',
    category: 'cigarette',
    start: 0,
    price: 649,
    contents: 20,
    smokeSeconds: 18,
    emberSeconds: 26,
    wards: { stimulated: 0.15 },
    healsPct: 15,
  },
  {
    id: 'joints',
    category: 'joint',
    start: 1,
    price: 1000,
    // Shadowmen resolve through the murk while it lasts.
    perceptionSeconds: 120,
    wards: { high: 0.5 },
    healsPct: 30,
  },
  // Never on a Citgo shelf: Erwin von Dutch in the Golden Wok deals them
  // (dealer.ts). The psychedelics work like the joint, harder and longer:
  // perception, a long trip, and the trip's ward (wards.ts: the Undercroft
  // fears it) with some high besides; the Adderall stimulates. Each gives
  // geometrie back, the psychedelics as much as the joint.
  {
    id: 'lsd',
    category: 'psychedelic',
    start: 0,
    perceptionSeconds: 480,
    wards: { tripping: 1, high: 0.25 },
    healsPct: 30,
  },
  {
    id: 'adderall',
    category: 'stimulant',
    start: 0,
    contents: 10,
    tripSeconds: 20,
    wards: { stimulated: 0.45 },
    healsPct: 15,
  },
  {
    id: 'mushrooms',
    category: 'psychedelic',
    start: 0,
    perceptionSeconds: 300,
    wards: { tripping: 0.7, high: 0.4 },
    healsPct: 30,
  },
  // Drinks, circa 2008. Drinking one moves the wards (wardlevels.ts): the
  // energy drinks stimulate, the beer and the liquor get you drunk, Four
  // Loko does both, and water sobers you a little. Each blurs the view as
  // it goes down (trip.ts); the drunk ward trails it (wardview.ts). Every one
  // gives geometrie back (healsPct). container is a key into
  // CONTAINERS in drinks.ts.
  {
    id: 'monster',
    category: 'drink',
    start: 0,
    price: 219,
    container: 'tall',
    tripSeconds: 30,
    wards: { stimulated: 0.3 },
    healsPct: 15,
  },
  {
    id: 'monster-ultra',
    category: 'drink',
    start: 0,
    price: 219,
    container: 'tall',
    tripSeconds: 30,
    wards: { stimulated: 0.25 },
    healsPct: 15,
  },
  {
    id: 'red-bull',
    category: 'drink',
    start: 0,
    price: 199,
    container: 'slim',
    tripSeconds: 30,
    wards: { stimulated: 0.25 },
    healsPct: 15,
  },
  {
    id: 'rip-it',
    category: 'drink',
    start: 0,
    price: 99,
    container: 'tall',
    tripSeconds: 30,
    wards: { stimulated: 0.3 },
    healsPct: 15,
  },
  {
    id: 'rockstar',
    category: 'drink',
    start: 0,
    price: 199,
    container: 'tall',
    tripSeconds: 30,
    wards: { stimulated: 0.3 },
    healsPct: 15,
  },
  {
    id: 'nos',
    category: 'drink',
    start: 0,
    price: 229,
    container: 'nos',
    tripSeconds: 30,
    wards: { stimulated: 0.35 },
    healsPct: 15,
  },
  {
    id: 'four-loko-blue',
    category: 'drink',
    start: 0,
    price: 249,
    container: 'tall',
    tripSeconds: 120,
    wards: { stimulated: 0.3, drunk: 0.35 },
    healsPct: 30,
  },
  {
    id: 'four-loko-punch',
    category: 'drink',
    start: 0,
    price: 249,
    container: 'tall',
    tripSeconds: 120,
    wards: { stimulated: 0.3, drunk: 0.35 },
    healsPct: 30,
  },
  {
    id: 'four-loko-lemon',
    category: 'drink',
    start: 0,
    price: 249,
    container: 'tall',
    tripSeconds: 120,
    wards: { stimulated: 0.3, drunk: 0.35 },
    healsPct: 30,
  },
  {
    id: 'wild-turkey',
    category: 'drink',
    start: 0,
    price: 2199,
    container: 'bourbon',
    tripSeconds: 90,
    wards: { drunk: 0.5 },
    healsPct: 30,
  },
  {
    id: 'jim-beam',
    category: 'drink',
    start: 0,
    price: 1599,
    container: 'square',
    tripSeconds: 90,
    wards: { drunk: 0.45 },
    healsPct: 30,
  },
  {
    id: 'grey-goose',
    category: 'drink',
    start: 0,
    price: 2999,
    container: 'goose',
    tripSeconds: 90,
    wards: { drunk: 0.45 },
    healsPct: 30,
  },
  {
    id: 'pbr',
    category: 'drink',
    start: 0,
    price: 99,
    container: 'can12',
    tripSeconds: 60,
    wards: { drunk: 0.15 },
    healsPct: 15,
  },
  {
    id: 'high-life',
    category: 'drink',
    start: 0,
    price: 129,
    container: 'longneck',
    tripSeconds: 60,
    wards: { drunk: 0.15 },
    healsPct: 15,
  },
  {
    id: 'modelo',
    category: 'drink',
    start: 0,
    price: 149,
    container: 'can12',
    tripSeconds: 60,
    wards: { drunk: 0.15 },
    healsPct: 15,
  },
  {
    id: 'md-2020',
    category: 'drink',
    start: 0,
    price: 299,
    container: 'flask',
    tripSeconds: 90,
    wards: { drunk: 0.3 },
    healsPct: 15,
  },
  {
    id: 'ice-mountain',
    category: 'drink',
    start: 0,
    price: 119,
    container: 'water',
    tripSeconds: 1,
    wards: { drunk: -0.1 },
    healsPct: 15,
  },
  // Medicine, off the rack by the register. Each one taken gives a health
  // point back and moves the wards: whatever is swallowed as a pill (the
  // aspirin and ibuprofen a little, the Benadryl a lot) lights the pill
  // corner, as the Adderall does, and the eye drops get the red out. form
  // is a MedicineForm (interfaces.ts), the shape assets.ts builds.
  {
    id: 'aspirin',
    category: 'medicine',
    start: 0,
    price: 449,
    contents: 24,
    form: 'pills',
    wards: { stimulated: 0.1 },
    healsPct: 15,
  },
  {
    id: 'ibuprofen',
    category: 'medicine',
    start: 0,
    price: 499,
    contents: 24,
    form: 'pills',
    wards: { stimulated: 0.1 },
    healsPct: 15,
  },
  {
    id: 'benadryl',
    category: 'medicine',
    start: 0,
    price: 699,
    contents: 24,
    form: 'carton',
    wards: { stimulated: 0.3 },
    healsPct: 15,
  },
  {
    id: 'eye-drops',
    category: 'medicine',
    start: 0,
    price: 549,
    form: 'dropper',
    wards: { high: -0.15, tripping: -0.15 },
    healsPct: 15,
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
  // Dug out of the mud bank at the firefly pond, a few at a time: the bait
  // most fish there take (fishing.ts). The berries are the carp's.
  {
    id: 'nightcrawlers',
    category: 'forage',
    start: 0,
  },
  // Caught off a Citgo's lot in Erwin von Dutch's jar before David
  // Carlsten's bat gets to them (sharedworld.ts rule 36): the shadow
  // carp's bait, and nothing else's.
  {
    id: 'slurm',
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
  // Materials (Material above): a drink leaves its can, its glass bottle
  // (empty-bottle) or its plastic one, the last cigarette out of a pack
  // leaves the pack, and the last pill out of a pill bottle the bottle
  // (recycling.ts).
  {
    id: 'empty-can',
    category: 'material',
    start: 0,
  },
  {
    id: 'empty-bottle',
    category: 'material',
    start: 0,
  },
  {
    id: 'empty-plastic',
    category: 'material',
    start: 0,
  },
  {
    id: 'empty-pack',
    category: 'material',
    start: 0,
  },
  {
    id: 'empty-pill-bottle',
    category: 'material',
    start: 0,
  },
  // Fish (Fish above), off the firefly pond (fishing.ts FISH holds each
  // one's level, size and what it bites on), the smallest first. Raw,
  // each gives a little back.
  { id: 'bluegill', category: 'fish', start: 0, worth: 150, healsPct: 5 },
  { id: 'pumpkinseed', category: 'fish', start: 0, worth: 200, healsPct: 5 },
  { id: 'yellow-perch', category: 'fish', start: 0, worth: 300, healsPct: 5 },
  { id: 'black-crappie', category: 'fish', start: 0, worth: 450, healsPct: 5 },
  { id: 'bullhead', category: 'fish', start: 0, worth: 500, healsPct: 5 },
  {
    id: 'largemouth-bass',
    category: 'fish',
    start: 0,
    worth: 900,
    healsPct: 5,
  },
  {
    id: 'channel-catfish',
    category: 'fish',
    start: 0,
    worth: 1200,
    healsPct: 5,
  },
  { id: 'common-carp', category: 'fish', start: 0, worth: 1400, healsPct: 5 },
  { id: 'ghost-catfish', category: 'fish', start: 0, worth: 9000, healsPct: 5 },
  { id: 'shadow-carp', category: 'fish', start: 0, worth: 4000, healsPct: 5 },
  // Food (Food above): a fish cooked over the campfire, a small one fried
  // whole and a large one grilled as a fillet (cooking.ts COOKED).
  { id: 'fried-panfish', category: 'food', start: 0, healsPct: 20 },
  { id: 'grilled-fillet', category: 'food', start: 0, healsPct: 40 },
  // Rods (Rod above), on the rack by the side wall in every Citgo, the
  // cheapest first.
  { id: 'zebco-33', category: 'rod', start: 0, price: 5000 },
  { id: 'ugly-stik', category: 'rod', start: 0, price: 10000 },
  { id: 'g-loomis', category: 'rod', start: 0, price: 100000 },
  // Key items (KeyItem above).
  {
    id: 'rose',
    category: 'key-item',
    start: 0,
  },
  {
    id: 'vault-key',
    category: 'key-item',
    start: 0,
  },
  // Out of the tackle box on the firefly pond's landing, one an account
  // (sharedworld.ts rule 36): nothing bites without it.
  {
    id: 'fishing-rod',
    category: 'key-item',
    start: 0,
  },
  // What every raider carries (sharedworld.ts rule 38): the flashlight and
  // the Citgo phone from the first welcome, and Matthew Marx's whistle
  // from the first time the account meets him. Each sits on the hotbar
  // and is used from the hand (held.ts) as anything else is.
  {
    id: 'flashlight',
    category: 'key-item',
    start: 1,
  },
  {
    id: 'citgo-phone',
    category: 'key-item',
    start: 1,
  },
  {
    id: 'marx-whistle',
    category: 'key-item',
    start: 0,
  },
  // Erwin von Dutch's jar (dealer.ts): a slurm goes in it alive. Each one
  // carried holds CONFIG.fishing.jar.holds of them.
  {
    id: 'slurm-jar',
    category: 'key-item',
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

// Whether `id` is a key item: never dropped, never used up, never stowed,
// and never left on a body.
export function isKeyItem(id: string): boolean {
  return itemById(id)?.category === 'key-item'
}

// Every key item, for the valley's strip (worker/d1packs.ts), which leaves
// them in the pack.
export const KEY_ITEM_IDS: readonly string[] = ITEMS.filter(
  (item) => item.category === 'key-item'
).map((item) => item.id)

export function isRod(id: string): boolean {
  return itemById(id)?.category === 'rod'
}

export function isFish(id: string): boolean {
  return itemById(id)?.category === 'fish'
}

// Whether `id` is a fish cooked over the campfire (cooking.ts).
export function isFood(id: string): boolean {
  return itemById(id)?.category === 'food'
}

// Whether `id` is eaten: a fish, raw, or one cooked over the campfire.
export function isEdible(id: string): boolean {
  const category = itemById(id)?.category
  return category === 'fish' || category === 'food'
}

export function isMedicine(id: string): boolean {
  return itemById(id)?.category === 'medicine'
}

// Whether the player can use a carried item (E in the pack, or its hotbar
// key): anything smoked, drunk, swallowed or eaten.
export function isUsable(id: string): boolean {
  const item = itemById(id)
  if (!item) return false
  switch (item.category) {
    case 'cigarette':
    case 'joint':
    case 'psychedelic':
    case 'stimulant':
    case 'drink':
    case 'fish':
    case 'food':
      return true
    case 'medicine':
      return (item.healsPct ?? 0) > 0
    case 'forage':
    case 'valuable':
    case 'material':
    case 'rod':
    case 'key-item':
      return false
  }
}

// Whether using `id` sharpens perception (the shadowmen resolve through
// the murk): the joint, and the dealer's mushrooms.
export function givesPerception(id: string): boolean {
  const category = itemById(id)?.category
  return category === 'joint' || category === 'psychedelic'
}

// Geometrie one use of `id` gives back to a raider `max` whole (health.ts);
// 0 for anything that does not heal.
export function healsOf(id: string, max: number): number {
  const item = itemById(id)
  const pct = item && 'healsPct' in item ? (item.healsPct ?? 0) : 0
  return Math.round((pct / 100) * max)
}

// How far one use of `id` moves the wards (wardlevels.ts dose): anything
// smoked or drunk has a dose; nothing else moves it.
export function doseOf(id: string): WardDose | undefined {
  const item = itemById(id)
  if (!item) return undefined
  switch (item.category) {
    case 'cigarette':
    case 'joint':
    case 'drink':
    case 'medicine':
    case 'psychedelic':
    case 'stimulant':
      return item.wards
    default:
      return undefined
  }
}

// How long using one unit of `id` runs its trip (hotbar.ts Effects.trip): a
// cigarette while it smokes, the joint while perception lasts, a drink its
// own tripSeconds. Zero for anything else.
export function tripSecondsOf(id: string): number {
  const item = itemById(id)
  if (!item) return 0
  switch (item.category) {
    case 'cigarette':
      return item.smokeSeconds
    case 'joint':
    case 'psychedelic':
      return item.perceptionSeconds
    case 'drink':
    case 'stimulant':
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
