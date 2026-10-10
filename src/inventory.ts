// Inventory state: pure transforms. The pack itself is the account's, kept
// by the valley (worker/packs.ts, sharedworld.ts rule 10); the client holds
// the copy the valley last sent and applies its own changes in the meantime.
// Kinds and starting counts come from items.ts.

import {
  INVENTORY_KINDS,
  isUsable,
  itemById,
  ITEMS,
  tripSecondsOf,
} from './items.ts'
import type { Effects } from './hotbar.ts'
import type { Inventory } from './interfaces.ts'

// Every kind present, each a non-negative integer; anything else in `raw`
// is dropped.
export function toInventory(raw: unknown): Inventory {
  // Any object can be read by key; missing keys read as undefined -> 0.
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >
  const inv: Inventory = {}
  for (const kind of INVENTORY_KINDS) {
    const n = Math.floor(Number(source[kind]))
    inv[kind] = Number.isFinite(n) && n > 0 ? n : 0
  }
  return inv
}

// A new account's pack.
export const STARTING_INVENTORY = toInventory(
  Object.fromEntries(ITEMS.map((item) => [item.id, item.start]))
)

export function addItem(inv: Inventory, kind: string, count = 1): Inventory {
  return { ...inv, [kind]: (inv[kind] || 0) + count }
}

// One unit of `kind` out of the pack at `time` (game seconds), and the
// effect it starts (hotbar.ts Effects): the pack and the effects after it,
// or why nothing happened. An item with no effect yet is not
// used. A cigarette waits until the one burning is out, then smokes for
// smokeSeconds and smoulders for emberSeconds after; the joint starts
// perception. Each use blurs the view afresh and runs its trails at least
// tripSecondsOf on (trip.ts); a longer trip already going keeps its end.
// What it does to geometrie is the item's `geometrie` dose (geometrie.ts).
export function consume(
  inv: Inventory,
  kind: string,
  effects: Effects,
  time: number
):
  | { used: true; inv: Inventory; effects: Effects }
  | { used: false; reason: 'unusable' | 'smoking' | 'empty' } {
  const item = itemById(kind)
  if (!item || !isUsable(kind)) return { used: false, reason: 'unusable' }
  if (item.category === 'cigarette' && time < effects.smoking.end) {
    return { used: false, reason: 'smoking' }
  }
  const result = useItem(inv, kind)
  if (!result.used) return { used: false, reason: 'empty' }
  // Medicine is swallowed, not smoked or drunk: no trip.
  if (item.category === 'medicine') {
    return { used: true, inv: result.inv, effects }
  }
  const trip = {
    start: time,
    end: Math.max(effects.trip.end, time + tripSecondsOf(kind)),
  }
  if (item.category === 'cigarette') {
    const end = time + item.smokeSeconds
    return {
      used: true,
      inv: result.inv,
      effects: {
        ...effects,
        smoking: { start: time, end },
        ember: { start: end, end: end + item.emberSeconds },
        trip,
      },
    }
  }
  if (item.category === 'joint') {
    return {
      used: true,
      inv: result.inv,
      effects: {
        ...effects,
        perception: { start: time, end: time + item.perceptionSeconds },
        trip,
      },
    }
  }
  return { used: true, inv: result.inv, effects: { ...effects, trip } }
}

export function useItem(
  inv: Inventory,
  kind: string
): { inv: Inventory; used: boolean } {
  if (!inv[kind] || inv[kind] <= 0) return { inv, used: false }
  return { inv: { ...inv, [kind]: inv[kind] - 1 }, used: true }
}
