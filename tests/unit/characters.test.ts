import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHARACTER,
  isSelectable,
  loadCharacter,
  saveCharacter,
  SELECTABLE,
} from '../../src/characters.ts'
import { OUTFITS } from '../../src/outfits.ts'
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

describe('characters', () => {
  it('offers the player and the four named characters', () => {
    expect(SELECTABLE).toEqual([
      'player',
      'coleman',
      'kvistad',
      'church',
      'hanson',
    ])
  })

  it('names only outfits that exist', () => {
    for (const id of SELECTABLE) expect(OUTFITS[id]).toBeDefined()
  })

  it('keeps the driver and the shadowmen off the roster', () => {
    expect(isSelectable('marx')).toBe(false)
    expect(isSelectable('shadow')).toBe(false)
    expect(isSelectable(null)).toBe(false)
  })

  it('defaults to the player with nothing saved', () => {
    expect(loadCharacter(memoryStorage())).toBe(DEFAULT_CHARACTER)
    expect(DEFAULT_CHARACTER).toBe('player')
  })

  it('remembers the last pick', () => {
    const storage = memoryStorage()
    saveCharacter(storage, 'church')
    expect(loadCharacter(storage)).toBe('church')
  })

  it('falls back on a saved id that is not on the roster', () => {
    const storage = memoryStorage()
    for (const value of ['marx', 'nobody', '', '{"id":"church"}']) {
      storage.data.set('bull-valley-shadow-wars:v1:character', value)
      expect(loadCharacter(storage)).toBe(DEFAULT_CHARACTER)
    }
  })

  it('survives storage that throws', () => {
    expect(loadCharacter(throwing)).toBe(DEFAULT_CHARACTER)
    expect(() => saveCharacter(throwing, 'hanson')).not.toThrow()
  })
})
