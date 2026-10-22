// Pure: what a tap or a click on a button gives back, seen and heard
// (tapfeedback.ts plays it). Bull Valley Dial-Up throws a small burst of
// red tetrahedrons from under the finger (`burst`, stepped by
// `stepShards`, each drawn as its lit faces, `shardFaces`); both apps play
// the same short tick (`TAP_TONE`). No three.js, no DOM.

import { range } from './rng.ts'
import type { Rng } from './rng.ts'

// One tetrahedron of a burst, in CSS pixels from the page's top left:
// where it is and how fast it goes (px/s), its turn about each axis
// (radians) and how fast it spins (rad/s), its size (px, centre to a
// corner) and how it is splintered (a stretch along each axis, so no two
// are the same shape), and how long it has flown of its life (s).
export interface Shard {
  x: number
  y: number
  vx: number
  vy: number
  rx: number
  ry: number
  rz: number
  wx: number
  wy: number
  wz: number
  size: number
  stretch: [number, number, number]
  age: number
  life: number
}

// A face as drawn: its corners on the page, how lit it is (0 to 1), and
// how much of it is left to see as the shard dies (0 to 1).
export interface ShardFace {
  points: [number, number][]
  light: number
  alpha: number
}

// The burst: how many shards a tap throws, how fast, how big, how long
// they live, and what pulls them down (px/s²) and slows them (per second).
export const BURST = {
  count: [9, 18] as const,
  speed: [90, 460] as const,
  size: [2.5, 10] as const,
  stretch: [0.35, 1.8] as const,
  life: [0.45, 0.8] as const,
  spin: 14,
  gravity: 900,
  drag: 2.2,
  // Thrown up more than down, so the burst fountains off the finger.
  lift: 120,
  // How many steps its light and its fade come in.
  bands: 4,
  // Past this much of its life a shard blinks, this many times a second.
  blinkFrom: 0.55,
  blinkHz: 28,
  // The frames a second it is drawn at, choppy as the valley's PS1.
  fps: 15,
}

// The tick both apps play on a tap: a triangle wave swept down over its
// seconds, then the same an octave up, quieter, a beat after; `gain`
// against the raider's Sounds setting.
export const TAP_TONE = {
  from: 1500,
  to: 420,
  seconds: 0.06,
  echo: 0.018,
  gain: 0.22,
}

// A regular tetrahedron's corners about its centre, unit distance out,
// and its four faces as corner indices.
const S = 1 / Math.sqrt(3)
const CORNERS: [number, number, number][] = [
  [S, S, S],
  [S, -S, -S],
  [-S, S, -S],
  [-S, -S, S],
]
const FACES: [number, number, number][] = [
  [0, 1, 2],
  [0, 3, 1],
  [0, 2, 3],
  [1, 3, 2],
]

// The light, from up, left and in front, as a unit vector (the page's y
// runs down, the viewer looks along -z).
const LIGHT = (() => {
  const v = [-0.5, -0.7, 0.6]
  const n = Math.hypot(v[0], v[1], v[2])
  return v.map((c) => c / n) as [number, number, number]
})()

// A tap's burst at (x, y).
export function burst(x: number, y: number, rng: Rng): Shard[] {
  const count = Math.round(range(rng, BURST.count[0], BURST.count[1]))
  // Thrown lopsided: most of it one way, the rest wherever.
  const bias = rng() * Math.PI * 2
  return Array.from({ length: count }, () => {
    const angle = bias + (rng() - 0.5) * (rng() < 0.6 ? 2.4 : Math.PI * 2)
    const speed = range(rng, BURST.speed[0], BURST.speed[1])
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - BURST.lift,
      rx: rng() * Math.PI * 2,
      ry: rng() * Math.PI * 2,
      rz: rng() * Math.PI * 2,
      wx: range(rng, -BURST.spin, BURST.spin),
      wy: range(rng, -BURST.spin, BURST.spin),
      wz: range(rng, -BURST.spin, BURST.spin),
      size: range(rng, BURST.size[0], BURST.size[1]),
      stretch: [0, 1, 2].map(() =>
        range(rng, BURST.stretch[0], BURST.stretch[1])
      ) as [number, number, number],
      age: 0,
      life: range(rng, BURST.life[0], BURST.life[1]),
    }
  })
}

// The shards `dt` seconds on: moved, slowed, pulled down and turned, the
// ones past their life gone.
export function stepShards(shards: readonly Shard[], dt: number): Shard[] {
  const keep = Math.exp(-BURST.drag * dt)
  const out: Shard[] = []
  for (const s of shards) {
    const age = s.age + dt
    if (age >= s.life) continue
    const vx = s.vx * keep
    const vy = s.vy * keep + BURST.gravity * dt
    out.push({
      ...s,
      x: s.x + vx * dt,
      y: s.y + vy * dt,
      vx,
      vy,
      rx: s.rx + s.wx * dt,
      ry: s.ry + s.wy * dt,
      rz: s.rz + s.wz * dt,
      age,
    })
  }
  return out
}

// A corner turned by the shard's angles (about x, then y, then z).
function turn(
  [x, y, z]: [number, number, number],
  s: Shard
): [number, number, number] {
  const [cx, sx] = [Math.cos(s.rx), Math.sin(s.rx)]
  const [cy, sy] = [Math.cos(s.ry), Math.sin(s.ry)]
  const [cz, sz] = [Math.cos(s.rz), Math.sin(s.rz)]
  const y1 = y * cx - z * sx
  const z1 = y * sx + z * cx
  const x2 = x * cy + z1 * sy
  const z2 = -x * sy + z1 * cy
  return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2]
}

// The faces of `shard` that face the viewer, flat-lit in a few hard
// bands, their corners snapped to whole pixels the way the PS1 drew; it
// fades in steps, and blinks as it dies.
export function shardFaces(shard: Shard): ShardFace[] {
  const [sx, sy, sz] = shard.stretch
  const corners = CORNERS.map(([x, y, z]) =>
    turn([x * sx, y * sy, z * sz], shard)
  )
  const t = shard.age / shard.life
  const blink =
    t > BURST.blinkFrom && Math.floor(shard.age * BURST.blinkHz) % 2 === 1
  const alpha =
    (Math.ceil(Math.max(0, 1 - t * t) * BURST.bands) / BURST.bands) *
    (blink ? 0.25 : 1)
  const faces: ShardFace[] = []
  for (const [a, b, c] of FACES) {
    const [pa, pb, pc] = [corners[a], corners[b], corners[c]]
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]
    let n = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ]
    // Outward: away from the centre, which the face's middle points from.
    const mid = [
      pa[0] + pb[0] + pc[0],
      pa[1] + pb[1] + pc[1],
      pa[2] + pb[2] + pc[2],
    ]
    if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] < 0) n = n.map((c) => -c)
    const len = Math.hypot(n[0], n[1], n[2])
    if (n[2] <= 0) continue
    const lit = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / len
    faces.push({
      points: [pa, pb, pc].map(([x, y]) => [
        Math.round(shard.x + x * shard.size),
        Math.round(shard.y + y * shard.size),
      ]),
      light:
        0.2 + 0.8 * (Math.round(Math.max(0, lit) * BURST.bands) / BURST.bands),
      alpha,
    })
  }
  return faces
}
