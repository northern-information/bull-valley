// The stash, pure: each account's locker in the back room of every Citgo
// (store.ts STORE_LAYOUT.lockers). What is stowed there is the account's,
// kept by the valley beside the pack, the same from any station, and a
// strike never touches it (corpses.ts). sharedworld.ts runs these for the
// shared valley (rule 17); the valley played alone has no locker, since
// nothing is kept. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { dropAmount } from './drops.ts'
import type { Inventory, XZ } from './interfaces.ts'

// Whether a raider at `at` stands at a Citgo, close enough to its back
// room for the valley to open their locker: within stationReach of a
// station's pump island (`havens`, one per station).
export function atLocker(
  at: XZ | null,
  havens: readonly XZ[],
  cfg = CONFIG
): boolean {
  if (!at) return false
  return havens.some(
    (h) => Math.hypot(h.x - at.x, h.z - at.z) <= cfg.stash.stationReach
  )
}

// How many of `kind` one move takes out of `held` (the pack's, stowing;
// the locker's, taking out): the open container or one of anything else,
// or with `all` the whole stack, as a drop does.
export const moveAmount = dropAmount

// `count` of `kind` from one side to the other (the pack into the locker,
// or back), or null when `from` holds fewer.
export function move(
  from: Inventory,
  to: Inventory,
  kind: string,
  count: number
): { from: Inventory; to: Inventory } | null {
  const held = from[kind] || 0
  if (count < 1 || held < count) return null
  return {
    from: { ...from, [kind]: held - count },
    to: { ...to, [kind]: (to[kind] || 0) + count },
  }
}
