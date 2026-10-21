// Pure: the stars, and the constellations a trip draws between them in
// psychedelic fuchsia (fuchsia.ts). The stars are seeded, the same sky
// for everyone (`STARS`, which sky.ts draws). On a trip, up to
// CONFIG.psych.constellations.lanes constellations come and go at once, one
// more lane for every 1 / lanes of the tripping ward (wardlevels.ts). Each
// lane comes round on its own clock and, more often the further the trip,
// joins a few stars near each other into a figure that fades in, holds and
// fades out. Which stars and which lines are seeded by the lane and its
// turn, so nothing is kept from frame to frame and nothing goes on the
// wire: a trip is the raider's own. constellationrig.ts draws it.

import { CONFIG } from './config.ts'
import { clamp01 } from './math.ts'
import { mulberry32, range } from './rng.ts'

// A star's direction from the eye, a unit vector (+y up).
export interface Star {
  x: number
  y: number
  z: number
}

// `count` stars over the sky, from the horizon (a little above) to the
// top, spread evenly over it.
export function starField(count: number, seed: number): Star[] {
  const rng = mulberry32(seed)
  return Array.from({ length: count }, () => {
    const az = rng() * Math.PI * 2
    const el = Math.asin(rng() * 0.95 + 0.05)
    return {
      x: Math.cos(el) * Math.sin(az),
      y: Math.sin(el),
      z: Math.cos(el) * Math.cos(az),
    }
  })
}

// The valley's 700 stars.
export const STARS: readonly Star[] = starField(700, 0x57a25)

// One constellation: the stars it joins (indices into the field) and its
// lines, each a pair of those indices.
export interface Constellation {
  stars: number[]
  edges: [number, number][]
}

const dot = (a: Star, b: Star): number => a.x * b.x + a.y * b.y + a.z * b.z

const SEED = 0xc0457e

// The constellation lane `lane` draws on its turn `turn`: an anchor star
// at least `lowest` up the sky, a few more within `reach` of it, each
// joined to the nearest already joined (a tree, as constellations are
// drawn), and now and then one more line closing a loop. Null when the
// field has nothing to draw there.
export function constellationOf(
  stars: readonly Star[],
  lane: number,
  turn: number
): Constellation | null {
  const c = CONFIG.psych.constellations
  const rng = mulberry32(
    SEED ^ Math.imul(lane + 1, 0x9e3779b1) ^ Math.imul(turn, 0x85ebca6b)
  )
  const high = stars.flatMap((s, i) => (s.y >= c.lowest ? [i] : []))
  if (high.length === 0) return null
  const anchor = high[Math.floor(rng() * high.length)]
  const near = Math.cos(c.reach)
  const around = stars.flatMap((s, i) =>
    i !== anchor && dot(s, stars[anchor]) >= near ? [i] : []
  )
  // A shuffled handful of the stars round it.
  for (let i = around.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[around[i], around[j]] = [around[j], around[i]]
  }
  const want = Math.round(range(rng, c.starsMin, c.starsMax))
  const picked = [anchor, ...around.slice(0, want - 1)]
  if (picked.length < 2) return null
  const edges: [number, number][] = []
  const joined = [anchor]
  const rest = picked.slice(1)
  while (rest.length > 0) {
    // The closest pair across joined and not yet joined.
    let best = { from: joined[0], to: 0, d: -Infinity }
    for (const [k, i] of rest.entries()) {
      for (const j of joined) {
        const d = dot(stars[i], stars[j])
        if (d > best.d) best = { from: j, to: k, d }
      }
    }
    const next = rest.splice(best.to, 1)[0]
    edges.push([best.from, next])
    joined.push(next)
  }
  // Half the time, one more line between two stars not yet joined.
  if (picked.length >= 4 && rng() < 0.5) {
    const has = (a: number, b: number): boolean =>
      edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))
    let loop: { a: number; b: number; d: number } | null = null
    for (const [k, a] of picked.entries()) {
      for (const b of picked.slice(k + 1)) {
        const d = dot(stars[a], stars[b])
        if (!has(a, b) && (loop === null || d > loop.d)) loop = { a, b, d }
      }
    }
    if (loop) edges.push([loop.a, loop.b])
  }
  return { stars: picked, edges }
}

// A lane showing at a moment: which turn it is on (constellationOf says
// what it draws) and how much of it shows.
export interface Shown {
  lane: number
  turn: number
  opacity: number
}

// How much lane `lane` the level lets show: none below lane / lanes, all
// of it from (lane + 1) / lanes.
export function lanePresence(lane: number, level: number): number {
  return clamp01(clamp01(level) * CONFIG.psych.constellations.lanes - lane)
}

// The chance a lane's turn draws one on a trip of `level`.
export function chanceOf(level: number): number {
  const { chanceMin, chanceMax } = CONFIG.psych.constellations
  return chanceMin + (chanceMax - chanceMin) * clamp01(level)
}

// Every lane showing at `time` (game seconds) on a trip of `level`.
export function constellationsAt(level: number, time: number): Shown[] {
  const c = CONFIG.psych.constellations
  const shown: Shown[] = []
  for (let lane = 0; lane < c.lanes; lane++) {
    const presence = lanePresence(lane, level)
    if (presence <= 0) continue
    const at = time - (lane * c.periodSeconds) / c.lanes
    const turn = Math.floor(at / c.periodSeconds)
    const local = at - turn * c.periodSeconds
    if (local > c.showSeconds) continue
    const roll = mulberry32(SEED ^ Math.imul(lane + 7, 0x27d4eb2f) ^ turn)()
    if (roll >= chanceOf(level)) continue
    const fade = clamp01(
      Math.min(local / c.fadeSeconds, (c.showSeconds - local) / c.fadeSeconds)
    )
    if (fade <= 0) continue
    shown.push({ lane, turn, opacity: fade * presence })
  }
  return shown
}
