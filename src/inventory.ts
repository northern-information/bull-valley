// Inventory state: pure transforms. The pack itself is the account's, kept
// by the valley (worker/packs.ts, sharedworld.ts rule 10); the client holds
// the copy the valley last sent and applies its own changes in the meantime.
// Kinds and starting counts come from items.ts.

import { INVENTORY_KINDS, isUsable, itemById } from './items.ts'
import type { Effects } from './hotbar.ts'
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

// What using one unit came to: the pack and the effects after it, or why
// nothing happened.
export type Consumed =
  | { used: true; inv: Inventory; effects: Effects }
  | { used: false; reason: 'unusable' | 'smoking' | 'empty' }

// One unit of `kind` out of the pack at `time` (game seconds), and the
// effect it starts (hotbar.ts Effects). An item with no effect yet is not
// used. A cigarette waits until the one burning is out, then smokes for
// smokeSeconds and smoulders for emberSeconds after; the joint starts
// perception; a drink starts nothing timed. What it does to geometrie is
// the item's `geometrie` dose (geometrie.ts).
export function consume(
  inv: Inventory,
  kind: string,
  effects: Effects,
  time: number
): Consumed {
  const item = itemById(kind)
  if (!item || !isUsable(kind)) return { used: false, reason: 'unusable' }
  const smoke = item.category === 'cigarette'
  if (smoke && time < effects.smoking.end) {
    return { used: false, reason: 'smoking' }
  }
  const result = useItem(inv, kind)
  if (!result.used) return { used: false, reason: 'empty' }
  if (smoke) {
    const end = time + (item.smokeSeconds ?? 0)
    return {
      used: true,
      inv: result.inv,
      effects: {
        ...effects,
        smoking: { start: time, end },
        ember: { start: end, end: end + (item.emberSeconds ?? 0) },
      },
    }
  }
  if (item.category === 'joint') {
    return {
      used: true,
      inv: result.inv,
      effects: {
        ...effects,
        perception: { start: time, end: time + (item.perceptionSeconds ?? 0) },
      },
    }
  }
  return { used: true, inv: result.inv, effects }
}

export function useItem(
  inv: Inventory,
  kind: string
): { inv: Inventory; used: boolean } {
  if (!inv[kind] || inv[kind] <= 0) return { inv, used: false }
  return { inv: { ...inv, [kind]: inv[kind] - 1 }, used: true }
}
