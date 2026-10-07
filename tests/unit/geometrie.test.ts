import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { AXES, dose, levelsAt, SOBER } from '../../src/geometrie.ts'

describe('geometrie', () => {
  it('starts sober on every side', () => {
    expect(AXES).toEqual(['high', 'stimulated', 'drunk'])
    expect(levelsAt(SOBER, 100)).toEqual({ high: 0, stimulated: 0, drunk: 0 })
  })

  it('moves only the sides a dose names', () => {
    const g = dose(SOBER, { drunk: 0.3 }, 10)
    expect(levelsAt(g, 10)).toEqual({ high: 0, stimulated: 0, drunk: 0.3 })
    const both = dose(g, { stimulated: 0.2, drunk: 0.2 }, 10)
    expect(levelsAt(both, 10).stimulated).toBeCloseTo(0.2)
    expect(levelsAt(both, 10).drunk).toBeCloseTo(0.5)
    expect(levelsAt(dose(g, undefined, 10), 10)).toEqual(levelsAt(g, 10))
  })

  it('fades each side at its own rate, never below sober', () => {
    const { fadePerSecond } = CONFIG.geometrie
    const g = dose(SOBER, { high: 0.5, stimulated: 0.5, drunk: 0.5 }, 0)
    const later = levelsAt(g, 20)
    expect(later.high).toBeCloseTo(0.5 - fadePerSecond.high * 20)
    expect(later.stimulated).toBeCloseTo(0.5 - fadePerSecond.stimulated * 20)
    expect(later.drunk).toBeCloseTo(0.5 - fadePerSecond.drunk * 20)
    expect(levelsAt(g, 1e6)).toEqual({ high: 0, stimulated: 0, drunk: 0 })
    // Time never runs back.
    expect(levelsAt(g, -5)).toEqual(levelsAt(g, 0))
  })

  it('doses on top of what is left, held between 0 and 1', () => {
    const { fadePerSecond } = CONFIG.geometrie
    const g = dose(SOBER, { drunk: 0.4 }, 0)
    const again = dose(g, { drunk: 0.4 }, 30)
    expect(levelsAt(again, 30).drunk).toBeCloseTo(
      0.8 - fadePerSecond.drunk * 30
    )
    expect(levelsAt(dose(again, { drunk: 0.9 }, 30), 30).drunk).toBe(1)
    // Water brings it down, but never under sober.
    expect(levelsAt(dose(g, { drunk: -1 }, 0), 0).drunk).toBe(0)
  })
})
