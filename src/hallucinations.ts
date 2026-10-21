// Pure: what a trip shows that is not there. While the tripping ward
// (wardlevels.ts) is up, now and then someone or something appears out
// ahead of the raider: a raider in some character of the roster, a copy
// of one of the valley's own (Marx, Carlsten, Gron, Erwin, Tyler), or a
// pickup lying on the ground. They come more often and more at once the
// further into the trip, flicker in, stand a while and flicker out, and
// go when the trip does. E on one bursts it in psychedelic fuchsia
// (fuchsia.ts): `burstShards` is the burst, small Platonic solids flung
// out, `shardAt` where each one is at an age.
//
// This raider's alone: drawn by this client (hallucinationrig.ts), never
// sent, never kept, never in the walls. Tune it in CONFIG.hallucinations.

import { ROSTER } from './characters.ts'
import { CONFIG } from './config.ts'
import { TWENTY } from './drops.ts'
import { INVENTORY_KINDS, isKeyItem } from './items.ts'
import { clamp01 } from './math.ts'
import { mulberry32, pick, range } from './rng.ts'
import type { Vec3, XZ } from './interfaces.ts'
import type { OutfitId } from './outfits.ts'
import type { PoseName } from './poses.ts'
import type { Rng } from './rng.ts'

// The valley's own folk a trip copies, each as the rig builds him.
export const NPC_COPIES = [
  'marx',
  'carlsten',
  'gron',
  'squatter',
  'tyler',
] as const
export type NpcCopy = (typeof NPC_COPIES)[number]

// What a raider seen is doing: standing, or one of the emotes.
export const RAIDER_POSES: readonly PoseName[] = [
  'stand',
  'stand',
  'wave',
  'smoke',
  'point',
  'shrug',
  'dance',
]

// What lies on the ground: anything a pickup can be but a key item, and
// a twenty.
export const THING_KINDS: readonly string[] = [
  ...INVENTORY_KINDS.filter((kind) => !isKeyItem(kind)),
  TWENTY,
]

export type HallucinationLook =
  // A raider: their character, what they are doing, and which name over
  // them (a share into whatever names the rig is handed).
  | { shape: 'raider'; outfit: OutfitId; pose: PoseName; name: number }
  | { shape: 'npc'; npc: NpcCopy }
  | { shape: 'thing'; kind: string }

export type HallucinationShape = HallucinationLook['shape']

export interface Hallucination {
  id: number
  // Where it stands; the rig stands it on ground.at.
  x: number
  z: number
  // Which way it faces (Three's rotation.y for a figure facing +Z): toward
  // the raider as they stood when it came.
  yaw: number
  // Game seconds: when it came, and when it is gone.
  born: number
  ends: number
  look: HallucinationLook
}

export interface HallucinationState {
  seed: number
  // The next id, which seeds the next one too.
  next: number
  // When the next may come, in game seconds; null while sober.
  nextAt: number | null
  list: Hallucination[]
}

export function freshHallucinations(seed: number): HallucinationState {
  return { seed: seed >>> 0, next: 1, nextAt: null, list: [] }
}

// What the step sees of the raider and the valley.
export interface Seeing {
  time: number
  // The tripping ward right now, 0 to 1.
  tripping: number
  player: XZ
  // The raider's yaw: they face (-sin yaw, -cos yaw).
  yaw: number
  // Whether a wall stands between two points (walls.ts between): nothing
  // comes behind one.
  blocked?: (from: XZ, to: XZ) => boolean
}

const rngOf = (state: HallucinationState, salt: number): Rng =>
  mulberry32((state.seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0)

// Seconds until the next at `tripping`: from the long gap at a faint trip
// to the short one at a full trip, give or take.
export function gapAt(tripping: number, rng: Rng): number {
  const { gapSeconds, jitter } = CONFIG.hallucinations
  const level = clamp01(tripping)
  const base = gapSeconds.max - (gapSeconds.max - gapSeconds.min) * level
  return base * range(rng, 1 - jitter, 1 + jitter)
}

// How many may stand at once at `tripping`: one at the faintest, the most
// at a full trip.
export function mostAt(tripping: number): number {
  if (tripping <= 0) return 0
  return Math.max(1, Math.ceil(clamp01(tripping) * CONFIG.hallucinations.most))
}

// Someone or something, chosen from `rng`.
export function lookOf(rng: Rng): HallucinationLook {
  const { thingShare, npcShare } = CONFIG.hallucinations
  if (rng() < thingShare)
    return { shape: 'thing', kind: pick(rng, THING_KINDS) }
  if (rng() < npcShare) return { shape: 'npc', npc: pick(rng, NPC_COPIES) }
  return {
    shape: 'raider',
    outfit: pick(rng, ROSTER),
    pose: pick(rng, RAIDER_POSES),
    name: rng(),
  }
}

// A spot out ahead of the raider for `look`, in view and clear of walls
// and of the others; null when every try is blocked.
export function spotFor(
  look: HallucinationLook,
  seeing: Seeing,
  others: readonly XZ[],
  rng: Rng
): XZ | null {
  const { cone, person, thing, spacing, tries } = CONFIG.hallucinations
  const reach = look.shape === 'thing' ? thing : person
  const { player } = seeing
  for (let i = 0; i < tries; i++) {
    const yaw = seeing.yaw + range(rng, -cone, cone)
    const d = range(rng, reach.near, reach.far)
    const at = {
      x: player.x - Math.sin(yaw) * d,
      z: player.z - Math.cos(yaw) * d,
    }
    if (seeing.blocked?.(player, at)) continue
    if (others.some((o) => Math.hypot(o.x - at.x, o.z - at.z) < spacing)) {
      continue
    }
    return at
  }
  return null
}

// The state a moment on: the gone dropped; while sober, or strayed far
// from, the rest cut short to flicker out; while tripping, a new one now
// and then, out ahead.
export function stepHallucinations(
  state: HallucinationState,
  seeing: Seeing
): HallucinationState {
  const { time, tripping, player } = seeing
  const cfg = CONFIG.hallucinations
  const soon = time + cfg.fadeOutSeconds
  let list = state.list
    .filter((h) => time < h.ends)
    .map((h) => {
      const far = Math.hypot(h.x - player.x, h.z - player.z) > cfg.strayMetres
      return (tripping <= 0 || far) && h.ends > soon ? { ...h, ends: soon } : h
    })
  if (tripping <= 0) return { ...state, nextAt: null, list }

  let { next, nextAt } = state
  // A trip just begun: the first comes a short way into it.
  if (nextAt === null) {
    nextAt = time + gapAt(tripping, rngOf(state, next)) * cfg.firstShare
  }
  if (time >= nextAt) {
    const rng = rngOf(state, next)
    if (list.length < mostAt(tripping)) {
      const look = lookOf(rng)
      const at = spotFor(look, seeing, list, rng)
      if (at) {
        list = [
          ...list,
          {
            id: next,
            ...at,
            yaw: Math.atan2(player.x - at.x, player.z - at.z),
            born: time,
            ends: time + range(rng, cfg.lifeSeconds.min, cfg.lifeSeconds.max),
            look,
          },
        ]
      }
    }
    next += 1
    nextAt = time + gapAt(tripping, rng)
  }
  return { ...state, next, nextAt, list }
}

// One made now, out ahead, whatever the trip (the dev hook's): null when
// nowhere ahead is clear.
export function conjure(
  state: HallucinationState,
  seeing: Seeing,
  shape?: HallucinationShape
): { state: HallucinationState; made: Hallucination | null } {
  const cfg = CONFIG.hallucinations
  const rng = rngOf(state, state.next)
  let look = lookOf(rng)
  for (let i = 0; shape && look.shape !== shape && i < 64; i++) {
    look = lookOf(rng)
  }
  const at = spotFor(look, seeing, state.list, rng)
  if (!at) return { state, made: null }
  const { time, player } = seeing
  const made: Hallucination = {
    id: state.next,
    ...at,
    yaw: Math.atan2(player.x - at.x, player.z - at.z),
    born: time,
    ends: time + range(rng, cfg.lifeSeconds.min, cfg.lifeSeconds.max),
    look,
  }
  return {
    state: { ...state, next: state.next + 1, list: [...state.list, made] },
    made,
  }
}

// How much there it is at `time`, 0 to 1: coming in over fadeInSeconds,
// going over the last fadeOutSeconds.
export function presenceAt(h: Hallucination, time: number): number {
  const { fadeInSeconds, fadeOutSeconds } = CONFIG.hallucinations
  if (time < h.born || time >= h.ends) return 0
  return Math.min(
    1,
    (time - h.born) / fadeInSeconds,
    (h.ends - time) / fadeOutSeconds
  )
}

// Whether it shows this moment: always when wholly there, and coming or
// going it flickers, showing more of the time the more it is there.
export function shownAt(h: Hallucination, time: number): boolean {
  const presence = presenceAt(h, time)
  if (presence >= 1) return true
  if (presence <= 0) return false
  const beat = Math.floor(time * CONFIG.hallucinations.flickerHz)
  return mulberry32((h.id * 7919 + beat) >>> 0)() < presence
}

// E on it: gone at once, handed back for its burst.
export function dispel(
  state: HallucinationState,
  id: number
): { state: HallucinationState; gone: Hallucination | null } {
  const gone = state.list.find((h) => h.id === id) ?? null
  if (!gone) return { state, gone }
  return {
    state: { ...state, list: state.list.filter((h) => h !== gone) },
    gone,
  }
}

// --- The burst ------------------------------------------------------------

export const SOLIDS = [
  'tetrahedron',
  'cube',
  'octahedron',
  'dodecahedron',
  'icosahedron',
] as const
export type Solid = (typeof SOLIDS)[number]

// One piece of the burst: its solid, how it is thrown (m/s), how it turns
// (rad/s about each axis), and its radius in metres.
export interface Shard {
  solid: Solid
  velocity: Vec3
  spin: Vec3
  size: number
}

// The pieces a burst flings out from its middle, from `seed` alone: every
// way round, mostly outward and up.
export function burstShards(seed: number, scale = 1): Shard[] {
  const { shards, speed, up, size, spin } = CONFIG.hallucinations.burst
  const rng = mulberry32(seed >>> 0)
  return Array.from({ length: shards }, (_, i) => {
    const a = rng() * Math.PI * 2
    const out = range(rng, speed.min, speed.max) * scale
    return {
      solid: SOLIDS[i % SOLIDS.length],
      velocity: [
        Math.cos(a) * out,
        range(rng, up.min, up.max) * scale,
        Math.sin(a) * out,
      ],
      spin: [
        range(rng, -spin, spin),
        range(rng, -spin, spin),
        range(rng, -spin, spin),
      ],
      size: range(rng, size.min, size.max) * scale,
    }
  })
}

// A piece `age` seconds after the burst: where it is from the middle, how
// it has turned, how big (it swells in the first instant and shrinks
// away) and how opaque. Gone (scale and opacity 0) after `seconds`.
export function shardAt(
  shard: Shard,
  age: number
): { at: Vec3; turn: Vec3; scale: number; opacity: number } {
  const { seconds, gravity, drag } = CONFIG.hallucinations.burst
  const t = Math.max(0, age)
  if (t >= seconds) {
    return { at: [0, 0, 0], turn: [0, 0, 0], scale: 0, opacity: 0 }
  }
  // Air drag slows the throw: the distance an exponentially slowing
  // throw covers by t.
  const go = (1 - Math.exp(-drag * t)) / drag
  const [vx, vy, vz] = shard.velocity
  const life = t / seconds
  return {
    at: [vx * go, vy * go - 0.5 * gravity * t * t, vz * go],
    turn: [shard.spin[0] * t, shard.spin[1] * t, shard.spin[2] * t],
    scale: shard.size * Math.min(1, t * 12) * (1 - life * 0.6),
    opacity: Math.min(1, 2.5 * (1 - life)),
  }
}

// The flash at the burst's heart: full at once, gone over its first
// quarter.
export function flashAt(age: number): number {
  const quarter = CONFIG.hallucinations.burst.seconds / 4
  return age < 0 || age >= quarter ? 0 : 1 - age / quarter
}
