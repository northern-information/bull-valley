// Pure: the cosmetics a raider can wear, in one table, and what each costs.
// A cosmetic is the account's for good once had (worker/packs.ts keeps it
// beside the pack), and everyone in the valley sees it worn
// (protocol.ts PeerWire.cosmetics). Nothing is sold for cash: Moab Coldë
// trades for gold (sharedworld.ts rule 14). Meshes stay in assets.ts.

import { copy } from './copy.ts'
import { itemLabel } from './itemcopy.ts'
import type { Fanfare } from './catchfanfare.ts'
import type { Inventory } from './interfaces.ts'
import type { ItemId } from './items.ts'

export const COSMETICS = [
  {
    id: 'flaming-halo',
    label: copy('cosmetics.flaming-halo.label'),
    // What it takes from the pack: one troy ounce of gold.
    price: { kind: 'gold-bullion', count: 1 },
    offer: copy('moab.offer'),
    traded: copy('moab.traded'),
    worn: copy('log.cosmetic_worn', {
      cosmetic: copy('cosmetics.flaming-halo.label'),
    }),
  },
  {
    // Not worn over a character but a character of its own: David
    // Coleman: #1 joins the account's roster (characters.ts UNLOCKED_BY).
    id: 'coleman-1',
    label: copy('cosmetics.coleman-1.label'),
    price: { kind: 'gold-bullion', count: 10 },
    offer: copy('cosmetics.coleman-1.offer'),
    traded: copy('cosmetics.coleman-1.traded'),
    worn: copy('cosmetics.coleman-1.worn'),
  },
] as const satisfies readonly Cosmetic[]

export interface Cosmetic {
  id: string
  label: string
  price: { kind: ItemId; count: number }
  // What Moab says offering it, and having traded it.
  offer: string
  traded: string
  // The log's line once it is the account's.
  worn: string
}

export type CosmeticId = (typeof COSMETICS)[number]['id']

// Every cosmetic Moab trades for, in the order he offers them: the dearest
// first, so a raider carrying enough for #1 is offered #1, and one carrying
// less the halo.
export const MOAB_OFFERS: readonly CosmeticId[] = ['coleman-1', 'flaming-halo']

export function cosmeticById(id: string): Cosmetic | null {
  return COSMETICS.find((cosmetic) => cosmetic.id === id) ?? null
}

// The known cosmetics in `raw`, each once, in table order; anything else
// is dropped.
export function toCosmetics(raw: unknown): CosmeticId[] {
  const values: unknown[] = Array.isArray(raw) ? raw : []
  return COSMETICS.map((c) => c.id).filter((id) => values.includes(id))
}

// Whether the pack covers `id`'s price.
export function affords(pack: Inventory, id: CosmeticId): boolean {
  const cosmetic = cosmeticById(id)
  if (!cosmetic) return false
  return (pack[cosmetic.price.kind] ?? 0) >= cosmetic.price.count
}

// What Moab offers a raider carrying `pack` and wearing `owned`: the first
// of his cosmetics they do not have and can pay for, or null. He says
// nothing of a trade they cannot make.
export function moabOffer(
  pack: Inventory,
  owned: readonly CosmeticId[]
): CosmeticId | null {
  for (const id of MOAB_OFFERS) {
    if (!owned.includes(id) && affords(pack, id)) return id
  }
  return null
}

// What one unit of `kind` counts for with Moab in his trade window
// (barter.ts): one for anything he prices a cosmetic in, so a cosmetic's
// worth is its price's count; nothing else.
export function moabWorth(kind: string): number {
  return MOAB_OFFERS.some((id) => cosmeticById(id)?.price.kind === kind) ? 1 : 0
}

// What Moab asks of a raider he has no offer for: the first of his
// cosmetics they do not have yet, or null when they have them all.
export function moabWants(owned: readonly CosmeticId[]): CosmeticId | null {
  return MOAB_OFFERS.find((id) => !owned.includes(id)) ?? null
}

// The cosmetics `after` holds that `before` did not: what a trade just
// gave the account to wear.
export function gainedOf(
  before: readonly CosmeticId[],
  after: readonly CosmeticId[]
): CosmeticId[] {
  return after.filter((id) => !before.includes(id))
}

// A trade with Moab made a big deal of, as a fish landed is
// (catchfanfare.ts), the same in both apps: his banner across his trade
// window (tradewindow.ts) with what was had under it, gold, and the gold
// fireflies of a big fish bursting over it. Null for anything not his.
export function moabFanfare(id: string): Fanfare | null {
  const cosmetic = cosmeticById(id)
  if (!cosmetic) return null
  return {
    kind: cosmetic.id,
    tier: 'big',
    kicker: copy('moab.fanfare'),
    headline: cosmetic.label,
    gold: true,
  }
}

// Moab's refusal of a trade for `offer`, as both apps say it: short of
// what it costs, already owned, or anything else.
export function tradeRefusal(reason: string, offer: string | null): string {
  const cosmetic = offer ? cosmeticById(offer) : null
  if (reason === 'short' && cosmetic) {
    return copy('log.trade_short', {
      count: cosmetic.price.count,
      price: itemLabel(cosmetic.price.kind),
    })
  }
  if (reason === 'owned' && cosmetic) {
    return copy('log.trade_owned', { cosmetic: cosmetic.label })
  }
  return copy('log.trade_refused')
}
