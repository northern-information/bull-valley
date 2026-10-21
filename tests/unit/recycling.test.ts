import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { contentsOf, itemById } from '../../src/items.ts'
import {
  affordsResearch,
  atWreck,
  dimesChance,
  emptyOf,
  extraDimes,
  FRESH_RESEARCH,
  isResearchLine,
  priceOf,
  topLevel,
  toResearch,
} from '../../src/recycling.ts'

describe('recycling', () => {
  it('leaves a can after a canned drink and a bottle after a bottled one', () => {
    expect(emptyOf('pbr', 0)).toBe('empty-can')
    expect(emptyOf('red-bull', 3)).toBe('empty-can')
    expect(emptyOf('four-loko-blue', 0)).toBe('empty-can')
    expect(emptyOf('high-life', 0)).toBe('empty-bottle')
    expect(emptyOf('wild-turkey', 2)).toBe('empty-bottle')
    expect(emptyOf('ice-mountain', 0)).toBe('empty-bottle')
    expect(emptyOf('nos', 0)).toBe('empty-bottle')
  })

  it('leaves a pack only when the last cigarette comes out of it', () => {
    const pack = contentsOf('marlboro')
    expect(emptyOf('marlboro', 0)).toBe('empty-pack')
    expect(emptyOf('marlboro', pack)).toBe('empty-pack')
    expect(emptyOf('marlboro', pack - 1)).toBeNull()
    expect(emptyOf('marlboro', 1)).toBeNull()
  })

  it('leaves nothing after anything else', () => {
    for (const kind of ['joints', 'lsd', 'adderall', 'aspirin', 'cabbage']) {
      expect(emptyOf(kind, 0)).toBeNull()
    }
    expect(emptyOf('no-such-thing', 0)).toBeNull()
  })
})

describe('research', () => {
  const lines = CONFIG.recycling.lines

  it('reads only known lines, each a whole level from 0 to its top', () => {
    expect(toResearch(null)).toEqual(FRESH_RESEARCH)
    expect(toResearch({ dimes: 2.7, beam: 3 })).toEqual({ dimes: 2 })
    expect(toResearch({ dimes: -4 })).toEqual({ dimes: 0 })
    expect(toResearch({ dimes: 99 })).toEqual({ dimes: topLevel('dimes') })
    expect(toResearch({ dimes: 'lots' })).toEqual({ dimes: 0 })
    expect(isResearchLine('dimes')).toBe(true)
    expect(isResearchLine('beam')).toBe(false)
  })

  it('prices each next level, more than the last, and none past the top', () => {
    let last = 0
    for (let level = 0; level < topLevel('dimes'); level++) {
      const price = priceOf({ dimes: level }, 'dimes')
      expect(price).not.toBeNull()
      const total = Object.values(price ?? {}).reduce((a, b) => a + b, 0)
      expect(total).toBeGreaterThan(last)
      last = total
      for (const kind of Object.keys(price ?? {})) {
        expect(itemById(kind)?.category).toBe('material')
      }
    }
    expect(priceOf({ dimes: topLevel('dimes') }, 'dimes')).toBeNull()
  })

  it('affords a price only with every empty it asks for', () => {
    const price = { 'empty-can': 6, 'empty-pack': 2 }
    expect(affordsResearch({ 'empty-can': 6, 'empty-pack': 2 }, price)).toBe(
      true
    )
    expect(affordsResearch({ 'empty-can': 6, 'empty-pack': 1 }, price)).toBe(
      false
    )
    expect(affordsResearch({}, {})).toBe(true)
  })

  it('finds as many dimes again under the chance, and grows it by level', () => {
    expect(dimesChance(FRESH_RESEARCH)).toBe(0)
    expect(extraDimes(FRESH_RESEARCH, 5, 0)).toBe(0)
    let last = 0
    for (let level = 1; level <= topLevel('dimes'); level++) {
      const chance = dimesChance({ dimes: level })
      expect(chance).toBe(lines.dimes[level - 1].chance)
      expect(chance).toBeGreaterThan(last)
      expect(chance).toBeLessThanOrEqual(0.5)
      last = chance
      expect(extraDimes({ dimes: level }, 5, chance - 0.01)).toBe(5)
      expect(extraDimes({ dimes: level }, 5, chance)).toBe(0)
    }
    expect(extraDimes({ dimes: 5 }, 0, 0)).toBe(0)
  })

  it('takes empties only beside the wreck', () => {
    const wreck = { x: 10, z: 10 }
    const reach = CONFIG.recycling.tendReach
    expect(atWreck({ x: 10 + reach, z: 10 }, wreck)).toBe(true)
    expect(atWreck({ x: 10 + reach + 0.1, z: 10 }, wreck)).toBe(false)
    expect(atWreck(null, wreck)).toBe(false)
    expect(atWreck({ x: 10, z: 10 }, null)).toBe(false)
  })
})
