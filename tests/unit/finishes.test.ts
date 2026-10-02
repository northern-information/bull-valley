import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FINISH,
  finishById,
  FINISHES,
  isFinish,
  loadFinish,
  randomFinish,
  saveFinish,
} from '../../src/finishes.ts'
import type { CharacterStorage } from '../../src/characters.ts'

function memoryStorage(): CharacterStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

const throwing: CharacterStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('finishes', () => {
  it('lists a row of finishes with unique ids and hex colors', () => {
    expect(FINISHES.length).toBeGreaterThanOrEqual(8)
    expect(new Set(FINISHES.map((finish) => finish.id)).size).toBe(
      FINISHES.length
    )
    for (const finish of FINISHES) {
      expect(finish.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(finish.label.length).toBeGreaterThan(0)
    }
  })

  it('defaults to black, the catalogue finish', () => {
    expect(DEFAULT_FINISH).toBe('black')
    expect(finishById(DEFAULT_FINISH).color).toBe('#121214')
    expect(isFinish('black')).toBe(true)
    expect(isFinish('chrome')).toBe(false)
    expect(isFinish(null)).toBe(false)
  })

  it('throws on an unknown finish', () => {
    expect(() => finishById('snake' as never)).toThrow()
  })

  it('defaults with nothing saved', () => {
    expect(loadFinish(memoryStorage())).toBe(DEFAULT_FINISH)
  })

  it('remembers the last pick', () => {
    const storage = memoryStorage()
    saveFinish(storage, 'cherry')
    expect(loadFinish(storage)).toBe('cherry')
    expect(storage.data.size).toBe(1)
  })

  it('falls back on a saved id that is not in the table', () => {
    const storage = memoryStorage()
    for (const value of ['#ff0000', 'nobody', '', '{"id":"cherry"}']) {
      storage.data.set('bull-valley-shadow-wars:v1:guitar-finish', value)
      expect(loadFinish(storage)).toBe(DEFAULT_FINISH)
    }
  })

  it('survives storage that throws', () => {
    expect(loadFinish(throwing)).toBe(DEFAULT_FINISH)
    expect(() => saveFinish(throwing, 'grape')).not.toThrow()
  })

  it('randomizes to a different finish and can reach every other one', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const picked = randomFinish('black', i / 200)
      expect(picked).not.toBe('black')
      seen.add(picked)
    }
    expect(seen.size).toBe(FINISHES.length - 1)
    // The ends of the range stay inside the table.
    expect(isFinish(randomFinish('cherry', 0))).toBe(true)
    expect(isFinish(randomFinish('cherry', 1))).toBe(true)
    expect(randomFinish('cherry', 1)).not.toBe('cherry')
  })
})
