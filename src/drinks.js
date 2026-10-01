// Drink containers and how views size them. The drinks themselves (names,
// flavor text, shop caps, which container) are entries in items.js.
// Pure, no Three.

import { itemById } from './items.js'

// Containers, in metres. radius is half the width; depth, when present, is
// half the front-to-back size of a flat or square bottle.
export const CONTAINERS = {
  tall: { radius: 0.033, height: 0.168 }, // 16 oz can
  slim: { radius: 0.0265, height: 0.134 }, // 250 ml can
  can12: { radius: 0.033, height: 0.122 }, // 12 oz can
  nos: { radius: 0.037, height: 0.23 }, // NOS 22 oz plastic bottle
  bourbon: { radius: 0.04, height: 0.29 }, // Wild Turkey 750 ml
  square: { radius: 0.04, depth: 0.034, height: 0.28 }, // Jim Beam 750 ml
  goose: { radius: 0.042, height: 0.33 }, // Grey Goose 750 ml
  flask: { radius: 0.048, depth: 0.027, height: 0.27 }, // MD 20/20 750 ml
  water: { radius: 0.033, height: 0.205 }, // Ice Mountain 500 ml
}

// Cans and bottles each share one scale in a view, set by the tallest of
// their family, so sizes stay true within a family. One scale for all
// would shrink a 16 oz can to half a Grey Goose bottle.
const CANS = ['tall', 'slim', 'can12']

function familyOf(container) {
  return CANS.includes(container) ? 'can' : 'bottle'
}

// The height a view fits this drink's family to.
export function drinkFitHeight(id) {
  const family = familyOf(itemById(id).container)
  return Math.max(
    ...Object.entries(CONTAINERS)
      .filter(([name]) => familyOf(name) === family)
      .map(([, c]) => c.height)
  )
}
