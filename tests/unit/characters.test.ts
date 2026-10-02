import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHARACTER,
  FALLBACK_NAME,
  isSelectable,
  loadCharacter,
  loadName,
  saveCharacter,
  saveName,
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

describe('the saved name', () => {
  it('is empty with nothing saved', () => {
    expect(loadName(memoryStorage())).toBe('')
  })

  it('remembers the last name', () => {
    const storage = memoryStorage()
    saveName(storage, 'Dave Coleman')
    expect(loadName(storage)).toBe('Dave Coleman')
  })

  it('normalizes what it finds and drops what no longer passes', () => {
    const storage = memoryStorage()
    storage.data.set('bull-valley-shadow-wars:v1:name', '  Dave   Coleman ')
    expect(loadName(storage)).toBe('Dave Coleman')
    for (const value of ['', '   ', 'x'.repeat(17)]) {
      storage.data.set('bull-valley-shadow-wars:v1:name', value)
      expect(loadName(storage)).toBe('')
    }
  })

  it('survives storage that throws', () => {
    expect(loadName(throwing)).toBe('')
    expect(() => saveName(throwing, 'Dave')).not.toThrow()
  })

  it('has a fallback for skipped titles that passes the rules', () => {
    expect(FALLBACK_NAME).toBe('Raider')
  })
})
