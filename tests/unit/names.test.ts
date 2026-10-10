import { describe, expect, it } from 'vitest'
import { GRAVE_NAME_MAX } from '../../src/graves.ts'
import {
  EPITHETS,
  generateName,
  GIVEN,
  NAME_SPACE,
  NOUNS,
  PLACES,
  SHORT_PLACES,
  TITLES,
} from '../../src/names.ts'
import { mulberry32 } from '../../src/rng.ts'

describe('generateName', () => {
  it('draws all three patterns of the Scaduscope’s names', () => {
    const rng = mulberry32(11)
    const names = Array.from({ length: 600 }, () => generateName(rng))
    expect(names.some((n) => n.startsWith('The '))).toBe(true)
    expect(names.some((n) => n.includes(' of '))).toBe(true)
    expect(names.some((n) => TITLES.some((t) => n.startsWith(`${t} `)))).toBe(
      true
    )
    // Recurring on purpose, but not one name over and over.
    expect(new Set(names).size).toBeGreaterThan(300)
  })

  it('names the same for the same draw', () => {
    expect(generateName(mulberry32(3))).toBe(generateName(mulberry32(3)))
  })

  it('never names past what a stone takes', () => {
    const longest = (list: readonly string[]) =>
      Math.max(...list.map((w) => w.length))
    const longestName = Math.max(
      4 + longest(PLACES) + 1 + longest(NOUNS),
      longest(TITLES) + 1 + longest(SHORT_PLACES),
      longest(EPITHETS) + 1 + longest(GIVEN) + 4 + longest(PLACES)
    )
    expect(longestName).toBeLessThanOrEqual(GRAVE_NAME_MAX)
  })

  it('has about seven thousand names', () => {
    expect(NAME_SPACE).toBe(21 * 36 + 18 * 14 + 16 * 18 * 21)
  })
})
