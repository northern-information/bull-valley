// The campfire by the firefly pond, pure (sharedworld.ts rule 40): where
// it burns beside each pond's landing, whether a raider stands at one, and
// what a fish cooks into: a small one fried whole, a large one grilled as
// a fillet, each giving far more back than the fish raw (items.ts
// healsPct). No three.js, no DOM.

import { CONFIG } from './config.ts'
import { catchableOf } from './fishing.ts'
import { isFish } from './items.ts'
import type { PondPlace } from './fishing.ts'
import type { XZ } from './interfaces.ts'
import type { ItemId } from './items.ts'

// What each size of fish cooks into (fishing.ts FISH `size`).
export const COOKED = {
  small: 'fried-panfish',
  large: 'grilled-fillet',
} as const satisfies Record<string, ItemId>

// What `kind` cooks into over the campfire; null for anything that is not
// a fish.
export function cookedOf(kind: string): ItemId | null {
  if (!isFish(kind)) return null
  const fish = catchableOf(kind)
  return fish ? COOKED[fish.size] : null
}

// Where the campfire burns by `pond`: back from its landing, away from
// the water, and to the landing's side.
export function campfireOf(
  pond: Pick<PondPlace, 'x' | 'z' | 'landing'>,
  cfg = CONFIG
): XZ {
  const { back, aside } = cfg.fishing.campfire
  const { landing } = pond
  const dx = landing.x - pond.x
  const dz = landing.z - pond.z
  const d = Math.hypot(dx, dz) || 1
  const ox = dx / d
  const oz = dz / d
  return {
    x: landing.x + ox * back - oz * aside,
    z: landing.z + oz * back + ox * aside,
  }
}

// Whether a raider whose last state frame put them `at` is beside one of
// the ponds' campfires, for the valley to cook their fish.
export function atCampfire(
  at: XZ | null,
  ponds: readonly Pick<PondPlace, 'x' | 'z' | 'landing'>[],
  cfg = CONFIG
): boolean {
  if (!at) return false
  return ponds.some((pond) => {
    const fire = campfireOf(pond, cfg)
    return (
      Math.hypot(at.x - fire.x, at.z - fire.z) <= cfg.fishing.campfire.tendReach
    )
  })
}
