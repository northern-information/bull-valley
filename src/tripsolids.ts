// Pure: the platonic solids a trip floats round the eye, in psychedelic
// fuchsia (fuchsia.ts). Up to CONFIG.psych.solids.max of them, one more for
// every 1 / max of the tripping ward (wardlevels.ts). Each keeps to its own
// clock: in each of its cycles it comes for a while somewhere round the
// eye, circling slowly, bobbing and tumbling, fades out, rests, and comes
// again somewhere else. Where each one is at a moment is seeded by its
// index and its cycle, so nothing is kept from frame to frame and nothing
// goes on the wire: a trip is the raider's own. tripsolidsrig.ts draws it.

import { CONFIG } from './config.ts'
import { clamp01 } from './math.ts'
import { mulberry32, range } from './rng.ts'
import type { Rng } from './rng.ts'

export type SolidKind =
  'tetrahedron' | 'cube' | 'octahedron' | 'dodecahedron' | 'icosahedron'

// The five, in order: solid i is SOLID_KINDS[i % 5], always.
export const SOLID_KINDS: readonly SolidKind[] = [
  'tetrahedron',
  'cube',
  'octahedron',
  'dodecahedron',
  'icosahedron',
]

// One solid at a moment: where it floats, metres off the eye (+y up), how
// it is turned (Euler radians), how many metres across, and how much of it
// shows (0 is gone).
export interface SolidView {
  kind: SolidKind
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  size: number
  opacity: number
}

const SEED = 0x7a1d0

// A generator for solid `index` (cycle `cycle`, or its own clock with none).
function rngOf(index: number, cycle: number | null): Rng {
  const base = SEED ^ Math.imul(index + 1, 0x9e3779b1)
  return mulberry32(
    cycle === null ? base : base ^ Math.imul(cycle + 0x3c6ef372, 0x85ebca6b)
  )
}

// How much of solid `index` the level lets show: none below index / max,
// all of it from (index + 1) / max.
export function presenceOf(index: number, level: number): number {
  return clamp01(clamp01(level) * CONFIG.psych.solids.max - index)
}

// In and out over fadeSeconds at each end of a span `show` long, `local`
// seconds into it; none outside it.
export function fadeOf(local: number, show: number, fade: number): number {
  if (local < 0 || local > show) return 0
  return clamp01(Math.min(local / fade, (show - local) / fade))
}

// Solid `index` at `time` (game seconds) on a trip of `level` (0..1).
export function solidAt(index: number, level: number, time: number): SolidView {
  const c = CONFIG.psych.solids
  const kind = SOLID_KINDS[index % SOLID_KINDS.length]
  const own = rngOf(index, null)
  // Its cycle: long enough for its longest showing and a rest, and
  // started at its own phase so the solids never come together.
  const period = range(own, c.showMax + c.restMin, c.showMax + c.restMax)
  const phase = own() * period
  const cycle = Math.floor((time + phase) / period)
  const local = time + phase - cycle * period
  const r = rngOf(index, cycle)
  const show = range(r, c.showMin, c.showMax)
  const start = r() * (period - show)
  const since = local - start
  const opacity =
    fadeOf(since, show, c.fadeSeconds) * presenceOf(index, level) * c.opacity
  const radius = range(r, c.radiusMin, c.radiusMax)
  const height = range(r, c.low, c.high)
  const around = r() * Math.PI * 2
  const orbit = range(r, -c.orbit, c.orbit)
  const bob = range(r, 0.4, 1.1)
  const bobPhase = r() * Math.PI * 2
  const turn = (): number => range(r, -c.tumble, c.tumble)
  const spin = { x: turn(), y: turn(), z: turn() }
  const tilt = { x: r() * Math.PI, y: r() * Math.PI, z: r() * Math.PI }
  const size = range(r, c.sizeMin, c.sizeMax)
  const angle = around + orbit * since
  const reach = radius + 0.3 * Math.sin(bob * 0.7 * since + bobPhase)
  return {
    kind,
    x: Math.cos(angle) * reach,
    y: height + 0.25 * Math.sin(bob * since + bobPhase),
    z: Math.sin(angle) * reach,
    rx: tilt.x + spin.x * since,
    ry: tilt.y + spin.y * since,
    rz: tilt.z + spin.z * since,
    size,
    opacity,
  }
}

// Every solid at `time` on a trip of `level`, CONFIG.psych.solids.max of
// them in index order (one gone shows nothing), so a drawing can keep
// one mesh to each.
export function solidsAt(level: number, time: number): SolidView[] {
  return Array.from({ length: CONFIG.psych.solids.max }, (_, i) =>
    solidAt(i, level, time)
  )
}
