// Pure: the cosmetics a raider can wear, in one table, and what each costs.
// A cosmetic is the account's for good once had (worker/packs.ts keeps it
// beside the pack), and everyone in the valley sees it worn
// (protocol.ts PeerWire.cosmetics). Nothing is sold for cash: Moab Coldë
// trades for gold (sharedworld.ts rule 14). Meshes stay in assets.ts.

import { copy } from './copy.ts'
import type { Inventory } from './interfaces.ts'
import type { ItemId } from './items.ts'

export const COSMETICS = [
  {
    id: 'flaming-halo',
    label: copy('cosmetics.flaming-halo.label'),
    // What it takes from the pack: one troy ounce of gold.
    price: { kind: 'gold-bullion', count: 1 },
  },
] as const satisfies readonly Cosmetic[]

export interface Cosmetic {
  id: string
  label: string
  price: { kind: ItemId; count: number }
}

export type CosmeticId = (typeof COSMETICS)[number]['id']

// Every cosmetic Moab trades for, in the order he offers them.
export const MOAB_OFFERS: readonly CosmeticId[] = ['flaming-halo']

export function isCosmetic(value: unknown): value is CosmeticId {
  return COSMETICS.some((cosmetic) => cosmetic.id === value)
}

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
