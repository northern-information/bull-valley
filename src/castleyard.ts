// Pure: the works round Castle Entropy's rim (castlesite.ts lays them
// out): concrete poured round the moat's outer edge, out to its mitred
// corners and stopped short of any road (`apronOf`, laid on the Ground as
// an area a side, `apronOutlines`); an unfinished fence along it, two staggered rows of
// poles, each standing straight to its knee and bent in toward the island
// (`yardPoles`, `poleAt`), some with a span broken loose and floating over
// the break, shedding bits and now and then crumbling away to come back,
// on the shared clock so every raider sees the same span go at the same
// moment and nothing goes on the wire (`floatAt`, `crumbAt`); the building
// supplies left lying (`yardClutter`), a light tower to a side
// (`yardLamps`), the payphone (`payphoneSpot`) and Jericho beside it
// (`jerichoSpot`). The tops of the fire
// escapes and the cranes' footings are kept clear. Everything is in the
// world. Tune it in CONFIG.castle.yard. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { projectOnSegment } from './coords.ts'
import { mix } from './crumble.ts'
import { mazeToWorld } from './maze.ts'
import { craneSpots, inChannel, inflate, MOAT, onIsland } from './moat.ts'
import { mulberry32, range } from './rng.ts'
import type { Fragment } from './crumble.ts'
import type { XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'

type CastleConfig = typeof CONFIG.castle
type FloatConfig = typeof CONFIG.castle.yard.float

// Something set down in the yard: where, and the way its length runs (in
// the world, along (cos yaw, sin yaw); a model's +x, turned by -yaw).
export interface YardSpot extends XZ {
  yaw: number
}

// One outer side, moat-local: where it starts, its length, the unit along
// it, and the unit out from the island.
interface Side {
  a: XZ
  len: number
  along: XZ
  out: XZ
}

function sides(): Side[] {
  const n = MOAT.outer.length
  return MOAT.outer.map((a, k) => {
    const b = MOAT.outer[(k + 1) % n]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const along = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
    let out = { x: along.z, z: -along.x }
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    if (out.x * mid.x + out.z * mid.z < 0) out = { x: -out.x, z: -out.z }
    return { a, len, along, out }
  })
}

// The point `d` along side `s` and `o` out from it, in the world.
function onSide(place: MazePlace, s: Side, d: number, o: number): XZ {
  return mazeToWorld(place, {
    x: s.a.x + s.along.x * d + s.out.x * o,
    z: s.a.z + s.along.z * d + s.out.z * o,
  })
}

// A moat-local direction, in the world.
function turned(place: MazePlace, v: XZ): XZ {
  return mazeToWorld({ x: 0, z: 0, yaw: place.yaw }, v)
}

const headingOf = (v: XZ) => Math.atan2(v.z, v.x)

// Whether a thing reaching `pad` from (x, z) would crowd the top of a fire
// escape or a crane's footing.
function crowding(place: MazePlace, cfg: CastleConfig) {
  const all = sides()
  const stairs = cfg.stairs
  // As far along the wall as a fire escape can reach from its middle:
  // half a flight, its turn's furthest, and its longest landing (moat.ts
  // fireEscapes).
  const half =
    stairs.rise / stairs.slope / 2 + stairs.vary.turn + stairs.vary.landing.max
  const strips = stairs.sides.map((k) => {
    const s = all[k % all.length]
    return [
      onSide(place, s, s.len / 2 - half, 0),
      onSide(place, s, s.len / 2 + half, 0),
    ] as const
  })
  const cranes = craneSpots(place, cfg.cranes)
  const clear = cfg.yard.clear
  return (p: XZ, pad: number): boolean =>
    strips.some(
      ([a, b]) =>
        projectOnSegment(p.x, p.z, a.x, a.z, b.x, b.z).dist < clear + pad
    ) || cranes.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < clear + pad)
}

// The concrete round the rim, side by side round the moat's outer edge:
// each side's spokes, corner to corner, each from the moat's edge (a hair
// off it, so no deck ever hangs over the channel) straight out to where
// the concrete ends: CONFIG.castle.yard.apron out, to the mitred corners,
// or short of whatever already lies on the ground there (a road and its
// shoulder), where it stops.
export interface Apron {
  sides: { inner: XZ; outer: XZ }[][]
}

// The concrete's spokes along a side, about this far apart; how far out
// along each it looks for a road at a time, and how far short of one it
// stops.
const APRON_SPOKE = 2
const APRON_PROBE = 0.25
const APRON_SHORT = 0.3

export function apronOf(
  place: MazePlace,
  cfg: CastleConfig = CONFIG.castle,
  blocked: (p: XZ) => boolean = () => false
): Apron {
  const gap = 0.05
  const world = (poly: XZ[]) => poly.map((p) => mazeToWorld(place, p))
  const inner = world(inflate(MOAT.outer, gap))
  const outer = world(inflate(MOAT.outer, cfg.yard.apron))
  const n = inner.length
  const spoke = (a: XZ, b: XZ) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    let reach = 0
    while (reach < len) {
      const next = Math.min(len, reach + APRON_PROBE)
      const t = next / len
      if (blocked({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) {
        reach = Math.max(0, reach - APRON_SHORT)
        break
      }
      reach = next
    }
    const t = len > 0 ? reach / len : 0
    return {
      inner: a,
      outer: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
    }
  }
  const sides = inner.map((i0, k) => {
    const i1 = inner[(k + 1) % n]
    const o0 = outer[k]
    const o1 = outer[(k + 1) % n]
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(o1.x - o0.x, o1.z - o0.z) / APRON_SPOKE)
    )
    return Array.from({ length: steps + 1 }, (_, i) => {
      const u = i / steps
      return spoke(
        { x: i0.x + (i1.x - i0.x) * u, z: i0.z + (i1.z - i0.z) * u },
        { x: o0.x + (o1.x - o0.x) * u, z: o0.z + (o1.z - o0.z) * u }
      )
    })
  })
  return { sides }
}

// Each side's concrete as an outline closed on itself (along its inner
// edge, back along where it ends), for the Ground (Ground.addArea).
export function apronOutlines(apron: Apron): XZ[][] {
  return apron.sides.map((spokes) => [
    ...spokes.map((s) => s.inner),
    ...spokes.map((s) => s.outer).reverse(),
  ])
}

// A pole of the fence: its foot, the way it leans (a unit in the world,
// in toward the island), how far it stands straight, its whole length
// and how far it bends off true, its seed, and the span broken loose,
// metres along it from the foot, with how high it hangs over the break
// (null: whole).
export interface YardPole extends XZ {
  lean: XZ
  knee: number
  length: number
  bend: number
  seed: number
  piece: { from: number; to: number; lift: number } | null
}

export function yardPoles(
  place: MazePlace,
  cfg: CastleConfig = CONFIG.castle
): YardPole[] {
  const P = cfg.yard.poles
  const F = cfg.yard.float
  const rng = mulberry32(0x9013)
  rng()
  const crowded = crowding(place, cfg)
  const poles: YardPole[] = []
  sides().forEach((s, k) => {
    P.rows.forEach((row, r) => {
      // The rows stagger, so the poles of one stand in the other's gaps.
      for (let d = P.every * (r % 2 ? 1 : 0.5); d < s.len; d += P.every) {
        const along = d + (rng() * 2 - 1) * P.jitter
        const skip = rng() < P.skip
        const swing = (rng() * 2 - 1) * 0.2
        const knee = range(rng, P.knee.min, P.knee.max)
        const length = range(rng, P.height.min, P.height.max)
        const bend = range(rng, P.bend.min, P.bend.max)
        const broken = rng() < P.broken
        const where = rng()
        const span = range(rng, F.span.min, F.span.max)
        const lift = range(rng, F.lift.min, F.lift.max)
        const at = rng()
        if (skip || along < 0.3 || along > s.len - 0.3) continue
        const foot = onSide(place, s, along, row)
        if (crowded(foot, 0)) continue
        const c = Math.cos(swing)
        const sn = Math.sin(swing)
        const lean = turned(place, {
          x: -(s.out.x * c - s.out.z * sn),
          z: -(s.out.x * sn + s.out.z * c),
        })
        let piece: YardPole['piece'] = null
        if (broken) {
          // The tip, a span of the bent length, or one of the straight.
          const bent = length - knee
          if (where < 0.4 || bent < span + 0.4) {
            piece = { from: length - Math.min(span, bent), to: length, lift }
          } else if (where < 0.7) {
            const from = knee + 0.2 + at * (bent - span - 0.4)
            piece = { from, to: from + span, lift }
          } else {
            const room = Math.max(0, knee - span - 1)
            const from = 0.8 + at * room
            piece = { from, to: Math.min(knee - 0.1, from + span), lift }
          }
        }
        poles.push({
          ...foot,
          lean,
          knee,
          length,
          bend,
          seed: (k + 1) * 10000 + r * 1000 + poles.length,
          piece,
        })
      }
    })
  })
  return poles
}

// The point `s` metres along a pole from its foot, from the foot.
export function poleAt(
  pole: Pick<YardPole, 'lean' | 'knee' | 'bend'>,
  s: number
): { x: number; y: number; z: number } {
  if (s <= pole.knee) return { x: 0, y: s, z: 0 }
  const over = s - pole.knee
  const out = Math.sin(pole.bend) * over
  return {
    x: pole.lean.x * out,
    y: pole.knee + Math.cos(pole.bend) * over,
    z: pole.lean.z * out,
  }
}

// A loose span at a moment: how high over its break it hangs, how far it
// tips, how much of it is left (1 whole, 0 crumbled away), and whether it
// is crumbling now.
export interface Floating {
  dy: number
  tilt: number
  whole: number
  crumbling: boolean
}

export function floatAt(
  pole: Pick<YardPole, 'seed' | 'piece'>,
  seconds: number,
  cfg: FloatConfig = CONFIG.castle.yard.float
): Floating {
  const key = pole.seed
  const phase = mix(key, 13) * Math.PI * 2
  const lift = pole.piece?.lift ?? 0
  const dy = lift + cfg.bob * Math.sin(seconds * 0.8 + phase)
  const tilt = 0.08 * Math.sin(seconds * 0.37 + phase * 1.7)
  const shifted = seconds + mix(key, 11) * cfg.cycle
  const round = Math.floor(shifted / cfg.cycle)
  const s = shifted - round * cfg.cycle
  let whole = 1
  let crumbling = false
  if (mix(key, round, 12) < cfg.share) {
    if (s < cfg.crumble) {
      whole = 1 - s / cfg.crumble
      crumbling = true
    } else if (s < cfg.crumble + cfg.gone) {
      whole = 0
    } else if (s < cfg.crumble + cfg.gone + cfg.regrow) {
      whole = (s - cfg.crumble - cfg.gone) / cfg.regrow
    }
  }
  return { dy, tilt, whole, crumbling }
}

// Bit `j` falling off a pole's loose span at `seconds`, from the pole's
// foot: the first `crumbs` always falling while any of the span is left,
// the `burst` after them only while it crumbles. Null when none is.
export function crumbAt(
  pole: Pick<YardPole, 'seed' | 'piece' | 'lean' | 'knee' | 'bend'>,
  j: number,
  seconds: number,
  cfg: FloatConfig = CONFIG.castle.yard.float
): Fragment | null {
  const piece = pole.piece
  if (!piece) return null
  const life = cfg.crumbLife
  const shifted = seconds + mix(pole.seed, j, 21) * life
  const round = Math.floor(shifted / life)
  const age = shifted - round * life
  const born = floatAt(pole, seconds - age, cfg)
  const burst = j >= cfg.crumbs
  if (born.whole <= 0 || (burst && !born.crumbling)) return null
  const r = (k: number) => mix(pole.seed, j, round, k)
  const p = poleAt(pole, piece.from + (piece.to - piece.from) * r(1))
  const turn = r(2) * Math.PI * 2
  const drift = 0.3 * (0.3 + r(3)) * age
  const size = burst ? 0.1 + r(4) * 0.14 : 0.04 + r(4) * 0.08
  return {
    x: p.x + Math.cos(turn) * drift,
    y: p.y + born.dy - 0.5 * cfg.gravity * age * age,
    z: p.z + Math.sin(turn) * drift,
    size,
    spin: r(5) * Math.PI * 2 + age * (2 + r(6) * 4),
    fade: age / life,
  }
}

// The payphone: on its side of the rim, out on the concrete, its face
// toward the valley (away from the moat), so a raider stands outside it.
export function payphoneSpot(
  place: MazePlace,
  cfg: CastleConfig = CONFIG.castle
): YardSpot {
  const all = sides()
  const P = cfg.yard.payphone
  const s = all[P.side % all.length]
  return {
    ...onSide(place, s, s.len * P.along, P.out),
    yaw: headingOf(turned(place, s.out)),
  }
}

// Jericho, the Candlebearer: on his block a little along the side from
// the payphone, a step further out, turned toward the phone's front,
// where a raider stands at it.
export function jerichoSpot(
  place: MazePlace,
  cfg: CastleConfig = CONFIG.castle
): YardSpot {
  const all = sides()
  const P = cfg.yard.payphone
  const J = cfg.yard.jericho
  const s = all[P.side % all.length]
  const at = onSide(place, s, s.len * P.along + J.beside, J.out)
  const phone = payphoneSpot(place, cfg)
  const before = {
    x: phone.x + Math.cos(phone.yaw) * 1.2,
    z: phone.z + Math.sin(phone.yaw) * 1.2,
  }
  return { ...at, yaw: headingOf({ x: before.x - at.x, z: before.z - at.z }) }
}

// How far short of the rim's lip a light tower's pool ends, so the
// ground it is draped on is the rim's, never the floor's.
const POOL_LIP = 0.15

// Where a light tower's pool reaches toward `p` from its middle `c`: `p`
// itself on the rim, or where the line out to it crosses the moat's outer
// edge, a hair short, so the pool ends at the lip instead of hanging down
// the wall to the floor. A middle already past the edge stays where it is.
export function poolReach(place: MazePlace, c: XZ, p: XZ): XZ {
  const past = (q: XZ) =>
    inChannel(place, q.x, q.z) || onIsland(place, q.x, q.z)
  if (!past(p)) return p
  if (past(c)) return c
  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const q = { x: c.x + (p.x - c.x) * mid, z: c.z + (p.z - c.z) * mid }
    if (past(q)) hi = mid
    else lo = mid
  }
  const len = Math.hypot(p.x - c.x, p.z - c.z)
  const t = Math.max(0, lo - POOL_LIP / len)
  return { x: c.x + (p.x - c.x) * t, z: c.z + (p.z - c.z) * t }
}

// A light tower to each outer side, its lamps toward the island, at the
// first of a few places along the side that crowds nothing.
export function yardLamps(
  place: MazePlace,
  cfg: CastleConfig = CONFIG.castle
): YardSpot[] {
  const crowded = crowding(place, cfg)
  const phone = payphoneSpot(place, cfg)
  const lamps: YardSpot[] = []
  for (const s of sides()) {
    for (const share of [0.62, 0.3, 0.8, 0.2, 0.5]) {
      const at = onSide(place, s, s.len * share, cfg.yard.lamps.out)
      if (crowded(at, 1.5)) continue
      if (Math.hypot(at.x - phone.x, at.z - phone.z) < 8) continue
      const inward = turned(place, { x: -s.out.x, z: -s.out.z })
      lamps.push({ ...at, yaw: headingOf(inward) })
      break
    }
  }
  return lamps
}

// What lies about the yard: stacked I-beams, crates, heaps of rubble, a
// cable spool, culvert pipes, a pallet of cement bags.
export const CLUTTER_KINDS = [
  'beams',
  'crates',
  'rubble',
  'spool',
  'pipes',
  'bags',
] as const
export type ClutterKind = (typeof CLUTTER_KINDS)[number]

// Each kind's footprint, along its yaw and half across, as it blocks
// (castleyardmodel.ts builds each inside it).
export const CLUTTER_SIZE: Record<
  ClutterKind,
  { length: number; half: number }
> = {
  beams: { length: 6.4, half: 0.65 },
  crates: { length: 2.6, half: 1.1 },
  rubble: { length: 3, half: 1.3 },
  spool: { length: 1.3, half: 0.95 },
  pipes: { length: 2.6, half: 1.25 },
  bags: { length: 1.4, half: 0.7 },
}

// One pile: what, where, which way, and its seed.
export interface Clutter extends YardSpot {
  kind: ClutterKind
  seed: number
}

export function yardClutter(
  place: MazePlace,
  cfg: CastleConfig = CONFIG.castle
): Clutter[] {
  const C = cfg.yard.clutter
  const rng = mulberry32(0xbea4)
  rng()
  const crowded = crowding(place, cfg)
  const kept = [
    { ...payphoneSpot(place, cfg), pad: 3.5 },
    { ...jerichoSpot(place, cfg), pad: cfg.yard.jericho.radius + 1 },
    ...yardLamps(place, cfg).map((l) => ({ ...l, pad: 2.5 })),
  ]
  const piles: Clutter[] = []
  sides().forEach((s) => {
    for (let d = C.every / 2; d < s.len; d += C.every) {
      const draw = rng()
      const kind = CLUTTER_KINDS[Math.floor(rng() * CLUTTER_KINDS.length)]
      const o = range(rng, C.from, C.to)
      const shift = (rng() * 2 - 1) * 1.2
      const twist = rng()
      const seed = Math.floor(rng() * 1e9)
      if (draw >= C.share) continue
      const size = CLUTTER_SIZE[kind]
      const along = d + shift
      const reach = size.length / 2
      if (along < reach + 0.5 || along > s.len - reach - 0.5) continue
      // A long pile lies along the side; the rest turn any way. Either
      // keeps behind the fence and on the concrete.
      const long = kind === 'beams' || kind === 'pipes'
      const across = long ? size.half : reach
      const fence = Math.max(...cfg.yard.poles.rows) + 0.4
      const out = Math.min(
        Math.max(o, fence + across),
        cfg.yard.apron - across - 0.3
      )
      const at = onSide(place, s, along, out)
      if (crowded(at, reach)) continue
      if (
        kept.some((k) => Math.hypot(at.x - k.x, at.z - k.z) < k.pad + reach)
      ) {
        continue
      }
      const side = headingOf(turned(place, s.along))
      const yaw = long ? side + (twist - 0.5) * 0.3 : side + twist * Math.PI * 2
      piles.push({ ...at, yaw, kind, seed })
    }
  })
  return piles
}

// The wall a pile stands as: along its length, half its width either side.
export function clutterWall(pile: Clutter): { a: XZ; b: XZ; half: number } {
  const { length, half } = CLUTTER_SIZE[pile.kind]
  const reach = Math.max(0, length / 2 - half)
  const cx = Math.cos(pile.yaw) * reach
  const cz = Math.sin(pile.yaw) * reach
  return {
    a: { x: pile.x - cx, z: pile.z - cz },
    b: { x: pile.x + cx, z: pile.z + cz },
    half,
  }
}
