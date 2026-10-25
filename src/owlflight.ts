// Pure: the hunts of Jericho's great horned owl, on the shared clock with
// nothing on the wire, so every raider at the castle sees the same bird
// leave his shoulder at the same moment. Time is cut into rounds
// (`CONFIG.castle.yard.jericho.owl.cycle`); a share of them hold a hunt,
// drawn from a seed of the round: it rises off his shoulder, circles high
// over the yard round a middle a little way out in front of him, dives to
// the ground on something small no raider ever sees, sits on its kill a
// moment, and flies home to land where it took off. Everything here is in
// Jericho's own space (+x ahead of him, y up from his feet); the ground
// under any point of it comes from `groundAt`.

import { CONFIG } from './config.ts'
import { mulberry32, range } from './rng.ts'
import type { XZ } from './interfaces.ts'

type OwlConfig = typeof CONFIG.castle.yard.jericho.owl

export interface Vec {
  x: number
  y: number
  z: number
}

// Where the owl perches, and which way it faces there (radians about y,
// its +x turned to (cos, -sin)).
export interface Perch extends Vec {
  heading: number
}

// What the owl is doing: on his shoulder, beating up or home, gliding its
// circle, folded in its dive, or mantled over its kill on the ground.
export type OwlPhase = 'perched' | 'rise' | 'circle' | 'dive' | 'kill' | 'home'

export interface OwlPose extends Vec {
  phase: OwlPhase
  heading: number
  // Nose up (+) or down (-), radians.
  pitch: number
  // How far the wings are out (0 folded, 1 full span), and their beat,
  // radians up (+) or down (-) from level.
  spread: number
  beat: number
}

// One round's hunt: when it starts in the round, the circle's middle and
// the way round it, and where the dive comes down.
export interface Hunt {
  start: number
  middle: XZ
  turn: 1 | -1
  kill: XZ
}

export type GroundAt = (x: number, z: number) => number

// The hunt in round `k`, or null for a round the owl stays put.
export function huntOf(
  k: number,
  cfg: OwlConfig = CONFIG.castle.yard.jericho.owl
): Hunt | null {
  const rng = mulberry32((Math.imul(k, 0x9e3779b1) ^ 0x0771f1) >>> 0)
  if (rng() >= cfg.share) return null
  const length = huntLength(cfg)
  const start = range(rng, 4, Math.max(4, cfg.cycle - length - 4))
  const a = range(rng, -cfg.swing, cfg.swing)
  const d = range(rng, cfg.out.min, cfg.out.max)
  const middle = { x: Math.cos(a) * d, z: Math.sin(a) * d }
  const turn = rng() < 0.5 ? 1 : -1
  const b = rng() * Math.PI * 2
  const r = Math.sqrt(rng()) * cfg.radius * 0.6
  return {
    start,
    middle,
    turn,
    kill: { x: middle.x + Math.cos(b) * r, z: middle.z + Math.sin(b) * r },
  }
}

// How long a hunt takes, from leaving the shoulder to landing on it.
export function huntLength(
  cfg: OwlConfig = CONFIG.castle.yard.jericho.owl
): number {
  const p = cfg.phases
  return p.rise + p.circle + p.dive + p.kill + p.home
}

// The hunt under way at shared time `t` (seconds), and how far into it,
// or null while the owl is on his shoulder.
export function huntAt(
  t: number,
  cfg: OwlConfig = CONFIG.castle.yard.jericho.owl
): { hunt: Hunt; into: number } | null {
  const k = Math.floor(t / cfg.cycle)
  const hunt = huntOf(k, cfg)
  if (!hunt) return null
  const into = t - k * cfg.cycle - hunt.start
  return into >= 0 && into < huntLength(cfg) ? { hunt, into } : null
}

// A cubic from `p0` (moving at `v0`) to `p1` (moving at `v1`) over `d`
// seconds, at `u` of the way.
function hermite(
  p0: Vec,
  v0: Vec,
  p1: Vec,
  v1: Vec,
  d: number,
  u: number
): Vec {
  const u2 = u * u
  const u3 = u2 * u
  const h00 = 2 * u3 - 3 * u2 + 1
  const h10 = u3 - 2 * u2 + u
  const h01 = -2 * u3 + 3 * u2
  const h11 = u3 - u2
  const at = (k: 'x' | 'y' | 'z') =>
    h00 * p0[k] + h10 * d * v0[k] + h01 * p1[k] + h11 * d * v1[k]
  return { x: at('x'), y: at('y'), z: at('z') }
}

const ZERO: Vec = { x: 0, y: 0, z: 0 }

// Where the owl is `into` seconds into `hunt`, and in which phase.
function flightAt(
  hunt: Hunt,
  into: number,
  perch: Perch,
  groundAt: GroundAt,
  cfg: OwlConfig
): { at: Vec; phase: Exclude<OwlPhase, 'perched'> } {
  const p = cfg.phases
  const { middle, turn, kill } = hunt
  const high = groundAt(middle.x, middle.z) + cfg.height
  const omega = (turn * cfg.laps * Math.PI * 2) / p.circle
  const from = Math.atan2(perch.z - middle.z, perch.x - middle.x)
  const ring = (theta: number): Vec => ({
    x: middle.x + Math.cos(theta) * cfg.radius,
    y: high,
    z: middle.z + Math.sin(theta) * cfg.radius,
  })
  const along = (theta: number): Vec => ({
    x: -Math.sin(theta) * cfg.radius * omega,
    y: 0,
    z: Math.cos(theta) * cfg.radius * omega,
  })
  const end = from + omega * p.circle
  const ground: Vec = { x: kill.x, y: groundAt(kill.x, kill.z), z: kill.z }
  // Off the shoulder: out from him and up.
  const out = Math.hypot(perch.x, perch.z) || 1
  const leave: Vec = { x: (perch.x / out) * 3, y: 3, z: (perch.z / out) * 3 }
  let t = into
  if (t < p.rise) {
    return {
      at: hermite(perch, leave, ring(from), along(from), p.rise, t / p.rise),
      phase: 'rise',
    }
  }
  t -= p.rise
  if (t < p.circle) return { at: ring(from + omega * t), phase: 'circle' }
  t -= p.circle
  if (t < p.dive) {
    const swoop: Vec = { x: 0, y: -6, z: 0 }
    return {
      at: hermite(ring(end), along(end), ground, swoop, p.dive, t / p.dive),
      phase: 'dive',
    }
  }
  t -= p.dive
  if (t < p.kill) return { at: ground, phase: 'kill' }
  t -= p.kill
  const lift: Vec = { x: 0, y: 5, z: 0 }
  return {
    at: hermite(ground, lift, perch, ZERO, p.home, Math.min(1, t / p.home)),
    phase: 'home',
  }
}

// The owl at shared time `t`: on its `perch`, or wherever its hunt has
// it, facing the way it flies (on its kill, the way it dove; slow near
// the end of a flight, round toward the perch's facing), its wings as
// the phase has them.
export function owlPose(
  t: number,
  perch: Perch,
  groundAt: GroundAt,
  cfg: OwlConfig = CONFIG.castle.yard.jericho.owl
): OwlPose {
  const now = huntAt(t, cfg)
  if (!now) return perchedOn(perch)
  const { hunt, into } = now
  const { at, phase } = flightAt(hunt, into, perch, groundAt, cfg)
  const length = huntLength(cfg)
  const e = 0.05
  const a = flightAt(hunt, Math.max(0, into - e), perch, groundAt, cfg).at
  const b = flightAt(
    hunt,
    Math.min(length - 1e-6, into + e),
    perch,
    groundAt,
    cfg
  ).at
  let v: Vec = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  if (phase === 'kill') {
    // Facing the way it came down.
    const p = cfg.phases
    const before = flightAt(
      hunt,
      p.rise + p.circle + p.dive - 0.1,
      perch,
      groundAt,
      cfg
    ).at
    v = { x: at.x - before.x, y: 0, z: at.z - before.z }
  }
  const flat = Math.hypot(v.x, v.z)
  const heading = flat > 1e-4 ? Math.atan2(-v.z, v.x) : perch.heading
  const pitch =
    phase === 'kill' ? 0 : Math.max(-1.2, Math.min(1.2, Math.atan2(v.y, flat)))
  const wings = wingsOf(phase, into)
  // The last moments home turn it round to sit as it sat.
  const left = length - into
  const settle = phase === 'home' && left < 0.6 ? 1 - left / 0.6 : 0
  return {
    ...at,
    phase,
    heading: heading + angleBetween(heading, perch.heading) * settle,
    pitch: pitch * (1 - settle),
    ...wings,
  }
}

// The owl sat on `perch`, its wings folded.
export function perchedOn(perch: Perch): OwlPose {
  return {
    ...xyz(perch),
    phase: 'perched',
    heading: perch.heading,
    pitch: 0,
    spread: 0,
    beat: 0,
  }
}

function xyz({ x, y, z }: Vec): Vec {
  return { x, y, z }
}

// The signed turn from `a` to `b`, the short way round.
function angleBetween(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a))
}

// The wings for a phase: beating hard up and home, held out over the
// circle with a slow beat now and then, half folded in the dive, spread
// low over the kill.
function wingsOf(
  phase: OwlPhase,
  into: number
): { spread: number; beat: number } {
  switch (phase) {
    case 'rise':
    case 'home':
      return { spread: 1, beat: Math.sin(into * 22) * 0.7 }
    case 'circle':
      return {
        spread: 1,
        beat: Math.sin(into * 0.9) > 0.85 ? Math.sin(into * 14) * 0.45 : 0.08,
      }
    case 'dive':
      return { spread: 0.45, beat: 0.5 }
    case 'kill':
      return { spread: 0.8, beat: -0.35 }
    default:
      return { spread: 0, beat: 0 }
  }
}
