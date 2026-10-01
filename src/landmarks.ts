// Hand-placed landmarks that are not part of the public-infrastructure survey
// (scripts/fetch_bull_valley.cjs), so they live here rather than in geo.json,
// which every survey refresh rewrites. Ported from the Scaduscope.
//
// Keep the list to places meant to be found (a roadside stand) or whose owners
// have agreed to be on a public map (a private home).

import { unitToWorld } from './coords.ts'
import type { Bbox, Metres, UnitPoint } from './interfaces.ts'

export interface Landmark {
  n: string
  lat: number
  lon: number
}

export interface LandmarkWorld {
  n: string
  x: number
  z: number
  u: number
  v: number
}

export const LANDMARKS: readonly Landmark[] = [
  // Dave Coleman's house in Wonder Lake. A private home, placed with his
  // consent.
  { n: "Mt. Coleman's Keep", lat: 42.3839451, lon: -88.3479778 },
  // The roadside cabbage stand on the southeast corner where Mason Hill Road
  // ends at Crystal Lake Road South. Approximate: offset ~30 m southeast of the
  // surveyed intersection (42.30627, -88.31599), since the survey has no
  // buildings to snap to.
  { n: 'Bull Valley Cabbage Stand', lat: 42.306, lon: -88.3156 },
]

export const KEEP = "Mt. Coleman's Keep"
export const CABBAGE_STAND = 'Bull Valley Cabbage Stand'

// Project into the survey's unit square (x right, y down), the same
// equirectangular mapping the fetch script uses. Points outside the frame keep
// their out-of-range coordinates.
export function projectLandmarks(
  bbox: Bbox,
  list: readonly Landmark[] = LANDMARKS
): { n: string; p: UnitPoint }[] {
  return list.map((l) => ({
    n: l.n,
    p: [
      (l.lon - bbox.west) / (bbox.east - bbox.west),
      (bbox.north - l.lat) / (bbox.north - bbox.south),
    ],
  }))
}

// The same landmarks in world metres: [{ n, x, z, u, v }].
export function landmarkWorldPositions(
  bbox: Bbox,
  metres: Metres,
  list: readonly Landmark[] = LANDMARKS
): LandmarkWorld[] {
  return projectLandmarks(bbox, list).map((l) => {
    const { x, z } = unitToWorld(l.p[0], l.p[1], metres)
    return { n: l.n, x, z, u: l.p[0], v: l.p[1] }
  })
}
