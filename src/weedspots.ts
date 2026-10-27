// Pure: where weeds come up across the valley, the same for everyone. Clumps
// of tufts in the open, off the roads and the water and clear of whatever
// is built (the caller's keepOut), drawn from their own seed so they never
// move the trees, reeds, graves or pickups. weeds.ts draws them; the
// drive-in grows its own through the gravel (drivein.ts weedSpots).

import { unitToWorld } from './coords.ts'
import { mulberry32, range } from './rng.ts'
import type { Metres, XZ } from './interfaces.ts'

// A tuft where it grows: its yaw, and how tall against the model.
export interface WeedSpot extends XZ {
  yaw: number
  scale: number
}

export const WEEDS = {
  // This many clumps tried over the survey square, each `tufts` tufts
  // within `spread` metres of its middle.
  clumps: 20000,
  tufts: { min: 3, max: 9 },
  spread: 2.5,
  scale: { min: 0.7, max: 1.6 },
  seed: 0x3eed5,
} as const

// One tuft at (x, z), its yaw and height drawn from `rng`.
export function weedAt(rng: () => number, x: number, z: number): WeedSpot {
  return {
    x,
    z,
    yaw: rng() * Math.PI * 2,
    scale: range(rng, WEEDS.scale.min, WEEDS.scale.max),
  }
}

// The valley's weeds. `blocked` is in survey units (scatter.ts buildMask:
// the roads and the water), `keepOut` in world metres. Every clump draws
// the same from the rng whether it grows or not, so a new keep-out never
// moves the clumps elsewhere.
export function placeWeeds(
  metres: Metres,
  blocked: (u: number, v: number) => boolean,
  keepOut: (x: number, z: number) => boolean
): WeedSpot[] {
  const rng = mulberry32(WEEDS.seed)
  const spots: WeedSpot[] = []
  for (let c = 0; c < WEEDS.clumps; c++) {
    const u = rng()
    const v = rng()
    const n = Math.floor(range(rng, WEEDS.tufts.min, WEEDS.tufts.max + 1))
    const open = !blocked(u, v)
    const middle = unitToWorld(u, v, metres)
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2
      const r = rng() * WEEDS.spread
      const x = middle.x + Math.cos(a) * r
      const z = middle.z + Math.sin(a) * r
      const tuft = weedAt(rng, x, z)
      if (open && !keepOut(x, z)) spots.push(tuft)
    }
  }
  return spots
}
