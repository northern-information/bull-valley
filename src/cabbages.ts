// Seeded cabbage placement, pure unit-square math. Wild cabbages grow where
// nobody mows — the wetlands (2:1) and the nature reserves — plus a guaranteed
// cluster round the cabbage patch (landmarks.ts CABBAGE_PATCH) so a short
// first walk always finds some.
// Rendering happens in world.ts; this module never touches three.js.

import { CONFIG } from './config.ts'
import { pointInPolygon, polygonBounds } from './coords.ts'
import { range } from './rng.ts'
import type { Geo, Metres, XZ } from './interfaces.ts'
import type { Rng } from './rng.ts'

export type CabbageSource = 'cluster' | 'wetland' | 'reserve'

export interface CabbageSpot {
  u: number
  v: number
  src: CabbageSource
}

export interface CabbageOptions {
  patch?: { u: number; v: number }
  metres?: Metres
  count?: number
  cluster?: number
}

export const CABBAGE_SEED = 0xcabba6e
// The cabbages under the dishes draw from their own seed, so moving the
// array never reshuffles the wild ones.
export const DISH_CABBAGE_SEED = 0xd15ca6e
// And the patch under the lone pine among them, its own seed again.
export const PINE_CABBAGE_SEED = 0x5b0c4ab

// geo: the survey (wetland rings, reserves). patch: the cabbage patch in
// unit coords { u, v }. metres: geo.metres, for the cluster radius.
// Returns [{ u, v, src: 'cluster' | 'wetland' | 'reserve' }].
export function placeCabbages(
  geo: Pick<Geo, 'wetland' | 'reserves'>,
  rng: Rng,
  { patch, metres, count, cluster }: CabbageOptions = {}
): CabbageSpot[] {
  const wild = count ?? CONFIG.cabbage.count
  const clusterCount = cluster ?? 6
  const clusterRadius = 400
  const spots: CabbageSpot[] = []

  // The guaranteed cluster: within clusterRadius metres of the patch,
  // never right on top of it.
  if (patch && metres) {
    let attempts = 0
    while (spots.length < clusterCount && attempts++ < clusterCount * 40) {
      const angle = rng() * Math.PI * 2
      const r = range(rng, 60, clusterRadius)
      const u = patch.u + (Math.cos(angle) * r) / metres.width
      const v = patch.v + (Math.sin(angle) * r) / metres.height
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

// Cabbages growing in the shade under the dish array behind the spawn
// Citgo (CONFIG.cabbage.underDishes): each under its own dish, drawn at
// random, a seeded step off the pedestal, past its pad and still under the
// reflector. dishes: where each pedestal stands, in world metres.
export function placeDishCabbages(
  dishes: readonly XZ[],
  rng: Rng,
  { count, near, far } = CONFIG.cabbage.underDishes
): XZ[] {
  const pool = dishes.map((_, i) => i)
  const spots: XZ[] = []
  while (spots.length < count && pool.length > 0) {
    const [i] = pool.splice(Math.floor(rng() * pool.length), 1)
    const angle = rng() * Math.PI * 2
    const r = range(rng, near, far)
    spots.push({
      x: dishes[i].x + Math.cos(angle) * r,
      z: dishes[i].z + Math.sin(angle) * r,
    })
  }
  return spots
}

// A patch of cabbages round `centre` (the lone pine among the dishes,
// CONFIG.lonePine.cabbages): `count` of them between `near` and `far`
// metres off it, none within its own `r` of anything in `avoid` (the dish
// pedestals, Spunky's grave). Fewer if the room runs out.
export function placeCabbagesAround(
  centre: XZ,
  rng: Rng,
  { count, near, far }: { count: number; near: number; far: number },
  avoid: readonly (XZ & { r: number })[] = []
): XZ[] {
  const spots: XZ[] = []
  let attempts = 0
  while (spots.length < count && attempts++ < count * 40) {
    const angle = rng() * Math.PI * 2
    const r = range(rng, near, far)
    const x = centre.x + Math.cos(angle) * r
    const z = centre.z + Math.sin(angle) * r
    if (avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue
    spots.push({ x, z })
  }
  return spots
}
