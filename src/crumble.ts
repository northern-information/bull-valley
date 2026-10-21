// Pure: Castle Entropy coming apart, on the shared clock, so every raider
// sees the same stone fall at the same moment and nothing goes on the
// wire. Small fragments are always falling off it and fading as they go
// (`fragmentAt`). Every so often a room, a wing or a flying buttress
// breaks away (`ruinsAt`): it crumbles, its chunks thrown out and falling
// (`chunkAt`), stays gone a while, then grows back. The keep, the mass under
// the cathedral's spire, the mass under the lighthouse and any mass
// something else stands on never fall (`piecesOf`); a buttress goes with
// either mass it spans. Everything is in the castle's own frame (castle.ts),
// y up from its base. Tune it in CONFIG.castle.ruin and
// CONFIG.castle.fragments. No three.js, no DOM.

import { seedOf, SLAB } from './castle.ts'
import { CONFIG } from './config.ts'
import type { CastleLayout, Mass } from './castle.ts'

type RuinConfig = typeof CONFIG.castle.ruin
type FragmentConfig = typeof CONFIG.castle.fragments

// What can break away: a mass by its index, or a buttress by its.
export type Piece =
  { kind: 'mass'; index: number } | { kind: 'buttress'; index: number }

// Where one piece is in its round: standing, or crumbling, gone or
// regrowing, `u` its share of the way through that stage, `since` the
// seconds since it began crumbling (for its chunks), `round` the round it
// fell in (a seed for them).
export type Ruin =
  | { stage: 'standing' }
  | {
      stage: 'crumbling' | 'gone' | 'regrowing'
      u: number
      since: number
      round: number
    }

const STANDING: Ruin = { stage: 'standing' }

// A hash of a few whole numbers to [0, 1).
export function mix(...parts: number[]): number {
  let h = 0x9e3779b9
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
  }
  return (h >>> 0) / 4294967296
}

// Whether anything else stands on mass `m`.
function bearing(layout: CastleLayout, m: Mass): boolean {
  return layout.masses.some(
    (o) =>
      o !== m &&
      Math.abs(o.y - (m.y + m.h)) < 1e-6 &&
      Math.abs(o.x - m.x) < (o.w + m.w) / 2 &&
      Math.abs(o.z - m.z) < (o.d + m.d) / 2
  )
}

// The pieces of a day's castle that can break away.
export function piecesOf(layout: CastleLayout): Piece[] {
  const kept = new Set([0, layout.spires[0]?.on ?? 0, layout.lighthouse.on])
  const pieces: Piece[] = []
  layout.masses.forEach((m, index) => {
    if (kept.has(index) || bearing(layout, m)) return
    pieces.push({ kind: 'mass', index })
  })
  layout.buttresses.forEach((_, index) =>
    pieces.push({ kind: 'buttress', index })
  )
  return pieces
}

// Piece `key`'s own place in its rounds at `seconds`: each round of
// `cycle`, offset by the piece, it falls by a draw of `share`.
export function ruinOf(
  seed: number,
  key: number,
  seconds: number,
  cfg: RuinConfig = CONFIG.castle.ruin
): Ruin {
  const shifted = seconds + mix(seed, key) * cfg.cycle
  const round = Math.floor(shifted / cfg.cycle)
  if (mix(seed, key, round) >= cfg.share) return STANDING
  const s = shifted - round * cfg.cycle
  if (s < cfg.crumble) {
    return { stage: 'crumbling', u: s / cfg.crumble, since: s, round }
  }
  if (s < cfg.crumble + cfg.gone) {
    return { stage: 'gone', u: (s - cfg.crumble) / cfg.gone, since: s, round }
  }
  if (s < cfg.crumble + cfg.gone + cfg.regrow) {
    const u = (s - cfg.crumble - cfg.gone) / cfg.regrow
    return { stage: 'regrowing', u, since: s, round }
  }
  return STANDING
}

// Every mass's and every buttress's ruin at `seconds`, indexed like the
// layout's: a mass that cannot fall always stands, and a buttress goes
// with a mass it spans while that mass is down.
export function ruinsAt(
  layout: CastleLayout,
  seconds: number,
  cfg: RuinConfig = CONFIG.castle.ruin
): { masses: Ruin[]; buttresses: Ruin[] } {
  const seed = seedOf(layout.day)
  const masses: Ruin[] = layout.masses.map(() => STANDING)
  const buttresses: Ruin[] = layout.buttresses.map(() => STANDING)
  for (const piece of piecesOf(layout)) {
    const key = piece.kind === 'mass' ? piece.index : 1000 + piece.index
    const ruin = ruinOf(seed, key, seconds, cfg)
    if (piece.kind === 'mass') masses[piece.index] = ruin
    else buttresses[piece.index] = ruin
  }
  layout.buttresses.forEach((b, index) => {
    if (buttresses[index].stage !== 'standing') return
    const down = [masses[b.low], masses[b.tall]].find(
      (r) => r && r.stage !== 'standing'
    )
    if (down) buttresses[index] = down
  })
  return { masses, buttresses }
}

// A falling bit of stone: where it is, how big, and how far through its
// fall (`fade`, 0 just broken off to 1 gone).
export interface Fragment {
  x: number
  y: number
  z: number
  size: number
  spin: number
  fade: number
}

// Fragment `i` of the ones always falling off the castle at `seconds`: off
// the face of a mass still standing, or off the rock under it, falling
// under gravity and drifting out; null while the mass it would fall from is
// down.
export function fragmentAt(
  layout: CastleLayout,
  ruins: { masses: Ruin[] },
  i: number,
  seconds: number,
  cfg: FragmentConfig = CONFIG.castle.fragments
): Fragment | null {
  const seed = seedOf(layout.day)
  const shifted = seconds + mix(seed, i, 7) * cfg.life
  const round = Math.floor(shifted / cfg.life)
  const age = shifted - round * cfg.life
  const r = (k: number) => mix(seed, i, round, k)
  let x: number
  let y: number
  let z: number
  let outX: number
  let outZ: number
  if (r(0) < cfg.fromRock && layout.rock.length > 0) {
    const shard = layout.rock[Math.floor(r(1) * layout.rock.length)]
    const turn = r(2) * Math.PI * 2
    const across = shard.radius * r(3) * 0.8
    outX = Math.cos(turn)
    outZ = Math.sin(turn)
    x = shard.x + outX * across
    z = shard.z + outZ * across
    y = -SLAB - shard.depth * r(4) * 0.8
  } else {
    const index = Math.floor(r(1) * layout.masses.length)
    if (ruins.masses[index]?.stage !== 'standing') return null
    const m = layout.masses[index]
    const side = Math.floor(r(2) * 4)
    const along = r(3) * 2 - 1
    outX = side === 0 ? 1 : side === 1 ? -1 : 0
    outZ = side === 2 ? 1 : side === 3 ? -1 : 0
    x = m.x + (outX * m.w) / 2 + (outZ !== 0 ? (along * m.w) / 2 : 0)
    z = m.z + (outZ * m.d) / 2 + (outX !== 0 ? (along * m.d) / 2 : 0)
    y = m.y + m.h * (0.3 + 0.7 * r(4))
  }
  const drift = cfg.drift * (0.4 + r(5)) * age
  return {
    x: x + outX * drift,
    y: y - 0.5 * cfg.gravity * age * age,
    z: z + outZ * drift,
    size: cfg.size.min + r(6) * (cfg.size.max - cfg.size.min),
    spin: r(7) * Math.PI * 2 + age * (1 + r(8) * 3),
    fade: age / cfg.life,
  }
}

// One of the chunks thrown off a mass as it crumbles, `since` seconds in:
// from somewhere in its box, out from its middle and falling. Null once it
// has fallen far enough to be gone.
export function chunkAt(
  m: Pick<Mass, 'x' | 'y' | 'z' | 'w' | 'd' | 'h'>,
  seed: number,
  round: number,
  j: number,
  since: number,
  cfg: FragmentConfig = CONFIG.castle.fragments
): Fragment | null {
  const r = (k: number) => mix(seed, round, j, k)
  // Chunks break off one after another as it goes.
  const start = r(0) * cfg.chunkSpread
  const age = since - start
  if (age < 0 || age > cfg.chunkLife) return null
  const x0 = m.x + (r(1) * 2 - 1) * (m.w / 2)
  const z0 = m.z + (r(2) * 2 - 1) * (m.d / 2)
  const y0 = m.y + m.h * r(3)
  const dx = x0 - m.x
  const dz = z0 - m.z
  const len = Math.hypot(dx, dz) || 1
  const speed = cfg.chunkSpeed * (0.5 + r(4))
  return {
    x: x0 + (dx / len) * speed * age,
    y: y0 + speed * 0.3 * age - 0.5 * cfg.gravity * age * age,
    z: z0 + (dz / len) * speed * age,
    size: cfg.chunk.min + r(5) * (cfg.chunk.max - cfg.chunk.min),
    spin: r(6) * Math.PI * 2 + age * (0.5 + r(7) * 2),
    fade: age / cfg.chunkLife,
  }
}
