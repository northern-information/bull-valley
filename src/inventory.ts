// Inventory state: pure transforms plus a localStorage adapter. The storage
// handle is injected so tests can pass a stub and the browser can pass
// window.localStorage; every touch of real storage is wrapped in try/catch
// (private windows, blocked site data). Kinds and starting counts come
// from items.ts.

import { INVENTORY_KINDS, itemById } from './items.ts'
import type { Inventory } from './interfaces.ts'

// The slice of the Storage API the adapter needs, so tests can stub it.
export type InventoryStorage = Pick<Storage, 'getItem' | 'setItem'>

export const KINDS = INVENTORY_KINDS

export const STARTING_INVENTORY = normalize(
  Object.fromEntries(KINDS.map((kind) => [kind, itemById(kind)?.start ?? 0]))
)

const KEY = 'bull-valley-shadow-wars:v1:inventory'

// Every kind present, each a non-negative integer.
function normalize(raw: unknown): Inventory {
  // Any object can be read by key; missing keys read as undefined -> 0.
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >
  const inv: Inventory = {}
  for (const kind of KINDS) inv[kind] = Math.max(0, Number(source[kind]) | 0)
  return inv
}

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

export function loadInventory(storage: InventoryStorage): Inventory {
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return { ...STARTING_INVENTORY }
    const parsed: unknown = JSON.parse(raw)
    // A saved null is no save at all.
    if (parsed === null) return { ...STARTING_INVENTORY }
    return normalize(parsed)
  } catch {
    return { ...STARTING_INVENTORY }
  }
}

export function saveInventory(storage: InventoryStorage, inv: Inventory): void {
  try {
    storage.setItem(KEY, JSON.stringify(inv))
  } catch {
    // Storage can be unavailable; the raid simply doesn't persist.
  }
}
