import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { NO_WARDS } from '../../src/dialstate.ts'
import { DIME_CENTS } from '../../src/drops.ts'
import {
  embark,
  EXPEDITION_IDS,
  isExpeditionId,
  isExpeditionRun,
  isHome,
  outcomeOf,
  progressOf,
  riskOf,
  wardOf,
  woundedBy,
} from '../../src/expeditions.ts'
import type { ExpeditionRun } from '../../src/expeditions.ts'

const RUNS = CONFIG.expeditions.runs

describe('sending a run out', () => {
  it('times it, keeps the seed and the matching ward', () => {
    const run = embark(null, 'corn', 1, { ...NO_WARDS, drunk: 0.6 }, 1000, 42)
    expect(run).toEqual({
      id: 'corn',
      startedAt: 1000,
      endsAt: 1000 + RUNS.corn.minutes * 60_000,
      seed: 42,
      ward: 0.6,
    })
    // A run that needs no ward keeps none.
    const ride = embark(null, 'ride', 1, { ...NO_WARDS, drunk: 1 }, 0, 1)
    expect(ride).toMatchObject({ ward: 0 })
  })

  it('refuses a second run, and one the level has not opened', () => {
    const run = embark(null, 'ride', 1, NO_WARDS, 0, 1) as ExpeditionRun
    expect(embark(run, 'corn', 50, NO_WARDS, 0, 1)).toBe('busy')
    expect(
      embark(null, 'undercroft', RUNS.undercroft.level - 1, NO_WARDS, 0, 1)
    ).toBe('locked')
    expect(
      embark(null, 'undercroft', RUNS.undercroft.level, NO_WARDS, 0, 1)
    ).toMatchObject({
      id: 'undercroft',
    })
  })
})

describe('what a run brings home', () => {
  const runOf = (
    id: ExpeditionRun['id'],
    seed: number,
    ward = 0
  ): ExpeditionRun => ({ id, startedAt: 0, endsAt: 1, seed, ward })

  it('is settled by the seed', () => {
    expect(outcomeOf(runOf('corn', 7))).toEqual(outcomeOf(runOf('corn', 7)))
  })

  it('pays its cash into the wallet, the rest into the pack', () => {
    const out = outcomeOf(runOf('ride', 3))
    expect(out.cents % DIME_CENTS).toBe(0)
    expect(out.cents).toBeGreaterThanOrEqual(5 * DIME_CENTS)
    expect(out.items.dimes).toBeUndefined()
    expect(out.hurt).toBe(false)
    expect(out.xp).toBe(RUNS.ride.xp)
  })

  it('comes back hurt now and then, the ward cutting the chance', () => {
    expect(riskOf('ride', 0)).toBe(0)
    expect(riskOf('corn', Number.NaN)).toBe(RUNS.corn.risk)
    expect(riskOf('corn', 0)).toBe(RUNS.corn.risk)
    expect(riskOf('corn', 1)).toBeCloseTo(
      RUNS.corn.risk * (1 - CONFIG.expeditions.wardCut)
    )
    const seeds = Array.from({ length: 400 }, (_, i) => i + 1)
    const hurt = (ward: number) =>
      seeds.filter((seed) => outcomeOf(runOf('corn', seed, ward)).hurt).length
    expect(hurt(0)).toBeGreaterThan(hurt(1))
    const one = seeds
      .map((seed) => outcomeOf(runOf('corn', seed)))
      .find((o) => o.hurt)
    expect(one?.damage).toBe(RUNS.corn.hurt)
  })

  it('names the ward a run needs', () => {
    expect(wardOf('ride')).toBeNull()
    expect(wardOf('corn')).toBe('drunk')
    expect(wardOf('undercroft')).toBe('tripping')
  })
})

describe('a run on the clock', () => {
  const run = {
    id: 'ride',
    startedAt: 1000,
    endsAt: 3000,
    seed: 1,
    ward: 0,
  } as const

  it('is home once its time is up, and says how far out it is', () => {
    expect(isHome(run, 2999)).toBe(false)
    expect(isHome(run, 3000)).toBe(true)
    expect(progressOf(run, 500)).toBe(0)
    expect(progressOf(run, 2000)).toBe(0.5)
    expect(progressOf(run, 9000)).toBe(1)
  })

  it('reads off the wire', () => {
    expect(isExpeditionRun(run)).toBe(true)
    expect(isExpeditionRun({ ...run, id: 'moon' })).toBe(false)
    expect(isExpeditionRun({ ...run, seed: 'x' })).toBe(false)
    expect(isExpeditionRun(null)).toBe(false)
    expect(isExpeditionId('corn')).toBe(true)
    expect(EXPEDITION_IDS).toEqual(['ride', 'corn', 'undercroft'])
  })
})

describe('a hurt run', () => {
  it('takes its share of whole, never the last point', () => {
    expect(woundedBy(1000, 1000, 0.25)).toBe(750)
    expect(woundedBy(100, 1000, 0.25)).toBe(1)
    expect(woundedBy(800, 1000, 0)).toBe(800)
  })
})
