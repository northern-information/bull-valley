// Pure: a fish leaping out of a firefly pond now and then, on the valley's
// clock, so every raider at the pond sees the same leap at the same spot.
// Time is cut into slots; each slot holds one leap, drawn from a seed of
// the pond and the slot: when in the slot it starts, where on the water
// (a way out from the middle toward one of the shore's points), which way
// it faces, and which fish. No three.js, no DOM.

import { mulberry32 } from './rng.ts'

export const LEAP = {
  // One leap in each slot this long, seconds, lasting `seconds`.
  slot: 9,
  seconds: 0.9,
  // How high it clears the water at the top, metres.
  height: 0.7,
  // How far out from the pond's middle toward the shore it comes up, as a
  // share of the way.
  out: [0.15, 0.6] as readonly [number, number],
  // The fish that leap.
  kinds: ['bluegill', 'common-carp', 'largemouth-bass'],
} as const

export interface Leap {
  // How far through it is, 0 leaving the water to 1 back in.
  t: number
  // Which shore point it comes up toward, and how far out toward it.
  toward: number
  out: number
  // The way it faces across the water, radians, and the fish.
  heading: number
  kind: string
}

// The leap under way at `seconds` on the valley's clock in the pond
// seeded `seed` with `points` shore points, or null between leaps.
export function leapAt(
  seconds: number,
  seed: number,
  points: number,
  cfg: typeof LEAP = LEAP
): Leap | null {
  const slot = Math.floor(seconds / cfg.slot)
  const rng = mulberry32((seed ^ Math.imul(slot, 0x9e3779b1)) >>> 0)
  const start = slot * cfg.slot + rng() * (cfg.slot - cfg.seconds)
  const t = (seconds - start) / cfg.seconds
  // Every draw is made whether or not it leaps now, so a leap's spot does
  // not hang on the moment it is asked about.
  const toward = Math.floor(rng() * Math.max(1, points))
  const out = cfg.out[0] + rng() * (cfg.out[1] - cfg.out[0])
  const heading = rng() * Math.PI * 2
  const kind = cfg.kinds[Math.floor(rng() * cfg.kinds.length)]
  if (t < 0 || t >= 1) return null
  return { t, toward, out, heading, kind }
}

// How high over the water a leap `t` through it is, and its pitch, nose
// up rising (positive) and down falling.
export function leapPose(
  t: number,
  cfg: typeof LEAP = LEAP
): { height: number; pitch: number } {
  return {
    height: Math.sin(Math.PI * t) * cfg.height,
    pitch: Math.cos(Math.PI * t) * 0.9,
  }
}
