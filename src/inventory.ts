// Inventory state: pure transforms plus a localStorage adapter. The storage
// handle is injected so tests can pass a stub and the browser can pass
// window.localStorage; every touch of real storage is wrapped in try/catch
// (private windows, blocked site data). Kinds and starting counts come
// from items.js.

import { INVENTORY_KINDS, itemById } from './items.js'

export const KINDS = INVENTORY_KINDS

export const STARTING_INVENTORY = normalize(
  Object.fromEntries(KINDS.map((kind) => [kind, itemById(kind).start]))
)

const KEY = 'bull-valley-shadow-wars:v1:inventory'

// Every kind present, each a non-negative integer.
function normalize(raw) {
  const inv = {}
  for (const kind of KINDS) inv[kind] = Math.max(0, raw[kind] | 0)
  return inv
}

export function addItem(inv, kind, count = 1) {
  return { ...inv, [kind]: (inv[kind] || 0) + count }
}

export function useItem(inv, kind) {
  if (!inv[kind] || inv[kind] <= 0) return { inv, used: false }
  return { inv: { ...inv, [kind]: inv[kind] - 1 }, used: true }
}

export function loadInventory(storage) {
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return { ...STARTING_INVENTORY }
    return normalize(JSON.parse(raw))
  } catch {
    return { ...STARTING_INVENTORY }
  }
}

export function saveInventory(storage, inv) {
  try {
    storage.setItem(KEY, JSON.stringify(inv))
  } catch {
    // Storage can be unavailable; the raid simply doesn't persist.
  }
}
