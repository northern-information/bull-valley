// Inventory state: pure transforms. The pack itself is the account's, kept
// by the valley (worker/packs.ts, sharedraid.ts rule 11); the client holds
// the copy the valley last sent and applies its own changes in the meantime.
// Kinds and starting counts come from items.ts.

import { INVENTORY_KINDS, itemById } from './items.ts'
import type { Inventory } from './interfaces.ts'

export const KINDS = INVENTORY_KINDS

// Every kind present, each a non-negative integer; anything else in `raw`
// is dropped.
export function toInventory(raw: unknown): Inventory {
  // Any object can be read by key; missing keys read as undefined -> 0.
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >
  const inv: Inventory = {}
  for (const kind of KINDS) inv[kind] = Math.max(0, Number(source[kind]) | 0)
  return inv
}

// A new account's pack.
export const STARTING_INVENTORY = toInventory(
  Object.fromEntries(KINDS.map((kind) => [kind, itemById(kind)?.start ?? 0]))
)

export function addItem(inv: Inventory, kind: string, count = 1): Inventory {
  return { ...inv, [kind]: (inv[kind] || 0) + count }
}

export function useItem(
  inv: Inventory,
  kind: string
): { inv: Inventory; used: boolean } {
  if (!inv[kind] || inv[kind] <= 0) return { inv, used: false }
  return { inv: { ...inv, [kind]: inv[kind] - 1 }, used: true }
}
