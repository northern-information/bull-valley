import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { contentsOf, itemById } from '../../src/items.ts'
import {
  affordsResearch,
  atRecycler,
  dimesChance,
  emptyOf,
  extraDimes,
  FRESH_RESEARCH,
  isResearchLine,
  priceOf,
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

  it('reads only known lines, each a whole level from 0 up', () => {
    expect(toResearch(null)).toEqual(FRESH_RESEARCH)
    expect(toResearch({ dimes: 2.7, beam: 3 })).toEqual({ dimes: 2 })
    expect(toResearch({ dimes: -4 })).toEqual({ dimes: 0 })
    expect(toResearch({ dimes: 99 })).toEqual({ dimes: 99 })
    expect(toResearch({ dimes: Infinity })).toEqual({ dimes: 0 })
    expect(toResearch({ dimes: 'lots' })).toEqual({ dimes: 0 })
    expect(isResearchLine('dimes')).toBe(true)
    expect(isResearchLine('beam')).toBe(false)
  })

  it('prices each next level, more than the last, without end', () => {
    let last = 0
    for (let level = 0; level < lines.dimes.length + 20; level++) {
      const price = priceOf({ dimes: level }, 'dimes')
      if (level < lines.dimes.length) {
        expect(price).toEqual(lines.dimes[level].price)
      }
      const total = Object.values(price).reduce((a, b) => a + b, 0)
      expect(total).toBeGreaterThan(last)
      last = total
      for (const [kind, n] of Object.entries(price)) {
        expect(itemById(kind)?.category).toBe('material')
        expect(Number.isInteger(n)).toBe(true)
      }
    }
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
    for (let level = 1; level <= lines.dimes.length + 40; level++) {
      const chance = dimesChance({ dimes: level })
      if (level <= lines.dimes.length) {
        expect(chance).toBe(lines.dimes[level - 1].chance)
      }
      expect(chance).toBeGreaterThan(last)
      expect(chance).toBeLessThan(1)
      last = chance
      expect(extraDimes({ dimes: level }, 5, chance - 0.01)).toBe(5)
      expect(extraDimes({ dimes: level }, 5, chance)).toBe(0)
    }
    expect(extraDimes({ dimes: 5 }, 0, 0)).toBe(0)
  })

  it("takes empties only beside a recycling machine, any Citgo's", () => {
    const recyclers = [
      { x: 10, z: 10 },
      { x: 500, z: 10 },
    ]
    const reach = CONFIG.recycling.tendReach
    expect(atRecycler({ x: 10 + reach, z: 10 }, recyclers)).toBe(true)
    expect(atRecycler({ x: 500 - reach, z: 10 }, recyclers)).toBe(true)
    expect(atRecycler({ x: 10 + reach + 0.1, z: 10 }, recyclers)).toBe(false)
    expect(atRecycler(null, recyclers)).toBe(false)
    expect(atRecycler({ x: 10, z: 10 }, [])).toBe(false)
  })
})
