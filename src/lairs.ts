// Pure: the spiders' lairs (sharedworld.ts rule 11), the valley's works
// gone to rust and concrete: the dish array behind the spawn Citgo, Castle
// Entropy and its moat with the cranes over it, and Bull Valley Plaza, the
// dead strip mall. A shadow spider comes far more often round a raider
// near one, or where it comes in near one (shadowmen.ts spiderComes). Each
// is a circle round the whole of what stands there, placed from the spawn
// Citgo as the things themselves are; the hello carries them and the
// valley keeps them in the world. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { MOAT } from './moat.ts'
import { toWorld } from './store.ts'
import { STRIP_MALL } from './stripmall.ts'
import type { XZ } from './interfaces.ts'
import type { StoreOrigin } from './store.ts'

export interface Lair extends XZ {
  // How far out from its middle what stands there reaches, metres.
  radius: number
}

// The lairs round the spawn Citgo `station`: the dish array, the castle's
// moat, and the plaza.
export function lairsOf(station: StoreOrigin): Lair[] {
  const at = (x: number, z: number): XZ => {
    const [wx, , wz] = toWorld(station, [x, 0, z])
    return { x: wx, z: wz }
  }
  // The dish array: rows back from `first`, cols centred on the store's
  // line (spawnlot.ts dishSpotsOf), out to the corner pedestals.
  const { rows, cols, first, spacing } = CONFIG.dishes
  const deep = ((rows - 1) * spacing) / 2
  const wide = ((cols - 1) * spacing) / 2
  const dishes = {
    ...at(first - deep, 0),
    radius: Math.hypot(deep, wide),
  }
  // The castle's moat, out to the farthest corner of its outer edge.
  const castle = {
    ...at(CONFIG.castle.at.x, CONFIG.castle.at.z),
    radius: Math.max(...MOAT.outer.map((p) => Math.hypot(p.x, p.z))),
  }
  // The plaza: its front wall's middle at `at`, the building back from it
  // away from the road (stripmall.ts), to its far corners.
  const { depth, length } = STRIP_MALL
  const mall = CONFIG.stripMall.at
  const plaza = {
    ...at(mall.x - depth / 2, mall.z),
    radius: Math.hypot(depth / 2, length / 2),
  }
  return [dishes, castle, plaza]
}

// Whether `p` is within `reach` metres of a lair's edge.
export function nearLair(
  lairs: readonly Lair[],
  p: XZ,
  reach: number
): boolean {
  return lairs.some(
    (lair) => Math.hypot(p.x - lair.x, p.z - lair.z) <= lair.radius + reach
  )
}
