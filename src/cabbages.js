// Seeded cabbage placement, pure unit-square math. Wild cabbages grow where
// nobody mows — the wetlands (2:1) and the nature reserves — plus a guaranteed
// cluster near the Cabbage Stand so a short first run is always possible.
// Rendering happens in world.js; this module never touches three.js.

import { CONFIG } from './config.js'
import { pointInPolygon, polygonBounds } from './coords.js'
import { range } from './rng.js'

export const CABBAGE_SEED = 0xcabba6e

// geo: the survey (wetland rings, reserves). stand: the Cabbage Stand in unit
// coords { u, v }. metres: geo.metres, for the cluster radius.
// Returns [{ u, v, src: 'cluster' | 'wetland' | 'reserve' }].
export function placeCabbages(
  geo,
  rng,
  { stand, metres, count, cluster } = {}
) {
  const wild = count ?? CONFIG.cabbage.count
  const clusterCount = cluster ?? 6
  const clusterRadius = 400
  const spots = []

  // The guaranteed patch: within clusterRadius metres of the stand, never
  // right on top of it.
  if (stand && metres) {
    let attempts = 0
    while (spots.length < clusterCount && attempts++ < clusterCount * 40) {
      const angle = rng() * Math.PI * 2
      const r = range(rng, 60, clusterRadius)
      const u = stand.u + (Math.cos(angle) * r) / metres.width
      const v = stand.v + (Math.sin(angle) * r) / metres.height
      if (u < 0 || u > 1 || v < 0 || v > 1) continue
      spots.push({ u, v, src: 'cluster' })
    }
  }

  const wetlands = geo.wetland.filter((w) => w.length >= 3)
  const reserves = geo.reserves.map((r) => r.p).filter((p) => p.length >= 3)
  let guard = 0
  while (spots.length < clusterCount + wild && guard++ < wild * 400) {
    const useWetland =
      wetlands.length && (!reserves.length || rng() < 2 / 3) ? true : false
    const polys = useWetland ? wetlands : reserves
    if (!polys.length) break
    const poly = polys[Math.floor(rng() * polys.length)]
    const b = polygonBounds(poly)
    const u = range(rng, b.minX, b.maxX)
    const v = range(rng, b.minY, b.maxY)
    if (!pointInPolygon(u, v, poly)) continue
    if (u < 0 || u > 1 || v < 0 || v > 1) continue
    spots.push({ u, v, src: useWetland ? 'wetland' : 'reserve' })
  }
  return spots
}
