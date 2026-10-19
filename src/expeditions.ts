// Pure: idle expeditions (sharedworld.ts rule 30), Bull Valley Dial-Up's
// own way to earn: the raider is sent out on a run for a while and comes
// back with what it found. One run an account at a time. The valley draws
// a seed when it is sent and keeps it with the run, so what comes home is
// settled then (`outcomeOf`) and the same however often it is read; the
// matching ward the raider carried out (wards.ts, rule 27) cuts the chance
// it comes back hurt. A hurt run brings home a share of its rolls and
// takes geometrie, never the last point. Tune it in CONFIG.expeditions.

import { CONFIG } from './config.ts'
import { centsOf, isCash } from './drops.ts'
import { AXES } from './geometrie.ts'
import { mulberry32 } from './rng.ts'
import type { GeometrieAxis } from './interfaces.ts'
import type { GeometrieLevels } from './protocol.ts'

type Runs = typeof CONFIG.expeditions.runs
export type ExpeditionId = keyof Runs

export const EXPEDITION_IDS = Object.keys(
  CONFIG.expeditions.runs
) as ExpeditionId[]

export function isExpeditionId(id: unknown): id is ExpeditionId {
  return typeof id === 'string' && Object.hasOwn(CONFIG.expeditions.runs, id)
}

// One run out: which, when it left and comes home (server ms), the seed
// the valley drew for it, and the matching ward's level as it left (0 to
// 1; 0 for a run that needs none).
export interface ExpeditionRun {
  id: ExpeditionId
  startedAt: number
  endsAt: number
  seed: number
  ward: number
}

export function isExpeditionRun(value: unknown): value is ExpeditionRun {
  if (typeof value !== 'object' || value === null) return false
  const run = value as Record<string, unknown>
  return (
    isExpeditionId(run.id) &&
    [run.startedAt, run.endsAt, run.seed, run.ward].every(
      (n) => typeof n === 'number' && Number.isFinite(n)
    )
  )
}

// The ward a run needs, or null.
export function wardOf(id: ExpeditionId): GeometrieAxis | null {
  const ward: string | null = CONFIG.expeditions.runs[id].ward
  return AXES.find((axis) => axis === ward) ?? null
}

// The chance a run comes back hurt, the matching ward at `ward` (0 to 1).
export function riskOf(id: ExpeditionId, ward: number): number {
  const { risk } = CONFIG.expeditions.runs[id]
  const level = Number.isFinite(ward) ? Math.min(1, Math.max(0, ward)) : 0
  const cut = CONFIG.expeditions.wardCut * level
  return risk * (1 - cut)
}

// Why a run is refused: one already out, or a level too low.
export type EmbarkRefusal = 'busy' | 'locked'

// A run sent out at `now` by a raider at `level` carrying `wards`, with
// the seed the valley drew; or why not.
export function embark(
  current: ExpeditionRun | null,
  id: ExpeditionId,
  level: number,
  wards: GeometrieLevels,
  now: number,
  seed: number
): ExpeditionRun | EmbarkRefusal {
  if (current) return 'busy'
  const run = CONFIG.expeditions.runs[id]
  if (level < run.level) return 'locked'
  const axis = wardOf(id)
  return {
    id,
    startedAt: now,
    endsAt: now + run.minutes * 60_000,
    seed: seed >>> 0,
    ward: axis ? wards[axis] : 0,
  }
}

// What a run brings home: units into the pack by kind, cents into the
// wallet, whether it came back hurt and the share of whole geometrie that
// takes, and the XP it earns (progression.ts XP.expedition, so many times).
export interface ExpeditionOutcome {
  items: Record<string, number>
  cents: number
  hurt: boolean
  damage: number
  xp: number
}

// The outcome a run's seed settles, the same however often it is read.
export function outcomeOf(run: ExpeditionRun): ExpeditionOutcome {
  const def = CONFIG.expeditions.runs[run.id]
  const rng = mulberry32(run.seed)
  const hurt = rng() < riskOf(run.id, run.ward)
  const keep = hurt ? CONFIG.expeditions.hurtKeeps : 1
  const items: Record<string, number> = {}
  let cents = 0
  for (const roll of def.loot) {
    const comes = rng() < roll.chance
    const many = roll.min + Math.floor(rng() * (roll.max - roll.min + 1))
    if (!comes) continue
    const count = Math.floor(many * keep)
    if (count <= 0) continue
    if (isCash(roll.kind)) cents += count * centsOf(roll.kind)
    else items[roll.kind] = (items[roll.kind] ?? 0) + count
  }
  return { items, cents, hurt, damage: hurt ? def.hurt : 0, xp: def.xp }
}

// Whether the run is home at `now`.
export function isHome(run: ExpeditionRun, now: number): boolean {
  return now >= run.endsAt
}

// How far out a run is at `now`, 0 to 1.
export function progressOf(run: ExpeditionRun, now: number): number {
  const span = Math.max(1, run.endsAt - run.startedAt)
  return Math.min(1, Math.max(0, (now - run.startedAt) / span))
}

// The geometrie left after a hurt run: `damage` of whole off what is
// left, never the last point.
export function woundedBy(health: number, max: number, damage: number): number {
  if (damage <= 0) return health
  return Math.max(Math.min(1, health), health - Math.round(damage * max))
}
