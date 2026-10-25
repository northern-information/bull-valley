// Corpse runs, pure: what a raider struck leaves where they fell, and
// taking it back. A strike leaves everything the pack held but its key
// items (items.ts isKeyItem, which stay in the pack) on the raider's
// body, lying where their last state frame put them; they come to at the
// spawn Citgo with an empty pack and their wallet, and run back for it.
// Only the account that fell can take its things back, and a body lies
// until it does, whatever the day. sharedworld.ts runs these (rule 18).
// No three.js, no DOM.

import { CONFIG } from './config.ts'
import { DIME_CENTS } from './drops.ts'
import { INVENTORY_KINDS, isKeyItem } from './items.ts'
import type { Inventory, XZ } from './interfaces.ts'
import type { OutfitId } from './outfits.ts'

// A body as everyone sees it: where it lies and which way it faced, and
// who it was, by name and outfit. What it holds is its owner's business.
// The id is the valley's, never reused.
export interface CorpseWire extends XZ {
  id: number
  yaw: number
  // The height of the feet where the raider fell (drops.ts Drop.y): the
  // body lies on the deck under them (ground.ts lieAt). Missing on bodies
  // from before it was kept.
  y?: number
  name: string
  outfit: OutfitId
}

// A body with what it holds.
export interface Corpse extends CorpseWire {
  items: Inventory
}

// What a fall leaves on the body: every kind the pack holds at least one
// of but the key items, in items.ts order; anything else in the pack is
// dropped.
export function fallen(pack: Inventory): Inventory {
  const items: Inventory = {}
  for (const kind of INVENTORY_KINDS) {
    if (isKeyItem(kind)) continue
    const count = Math.max(0, Math.floor(pack[kind] || 0))
    if (count > 0) items[kind] = count
  }
  return items
}

// A body's items split into what stays on it and its key items, which go
// back to the pack: a body laid before key items were kept through a
// strike (sharedworld.ts rule 18).
export function keysOff(items: Inventory): {
  kept: Inventory
  keys: Inventory
} {
  const kept: Inventory = {}
  const keys: Inventory = {}
  for (const [kind, count] of Object.entries(items)) {
    if (!(count > 0)) continue
    if (isKeyItem(kind)) keys[kind] = count
    else kept[kind] = count
  }
  return { kept, keys }
}

// Whether the body holds nothing, so a fall with an empty pack leaves none.
export function isEmpty(items: Inventory): boolean {
  return Object.values(items).every((count) => !(count > 0))
}

// The pack once the body's things are back in it.
export function recover(pack: Inventory, items: Inventory): Inventory {
  const next = { ...pack }
  for (const [kind, count] of Object.entries(items)) {
    if (count > 0) next[kind] = (next[kind] || 0) + count
  }
  return next
}

// The pack a strike leaves: every kind at zero but the key items, kept.
export function emptied(pack: Inventory): Inventory {
  return Object.fromEntries(
    Object.entries(pack).map(([kind, count]) => [
      kind,
      isKeyItem(kind) ? count : 0,
    ])
  )
}

// A body without its contents, for the wire.
export function corpseWire({
  id,
  x,
  y,
  z,
  yaw,
  name,
  outfit,
}: Corpse): CorpseWire {
  return y === undefined
    ? { id, x, z, yaw, name, outfit }
    : { id, x, y, z, yaw, name, outfit }
}

// The nearest of `mine` (body ids) within `reach` of `at`, or null: the
// one E takes back.
export function nearestCorpse<C extends CorpseWire>(
  corpses: readonly C[],
  mine: readonly number[],
  at: XZ,
  reach: number
): C | null {
  let best = reach
  let near: C | null = null
  for (const corpse of corpses) {
    if (!mine.includes(corpse.id)) continue
    const d = Math.hypot(corpse.x - at.x, corpse.z - at.z)
    if (d < best) {
      best = d
      near = corpse
    }
  }
  return near
}

// How many dimes a strike spills out of a wallet of `cash` cents: its
// share (CONFIG.corpses.walletShare), in whole dimes.
export function spilledDimes(cash: number, cfg = CONFIG.corpses): number {
  return Math.floor((Math.max(0, cash) * cfg.walletShare) / DIME_CENTS)
}
