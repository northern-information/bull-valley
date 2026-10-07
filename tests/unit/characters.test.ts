import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHARACTER,
  isSelectable,
  pickOf,
  SELECTABLE,
} from '../../src/characters.ts'
import { DEFAULT_FINISH } from '../../src/finishes.ts'
import { OUTFITS } from '../../src/outfits.ts'

describe('characters', () => {
  it('offers the player and the seven named characters', () => {
    expect(SELECTABLE).toEqual([
      'player',
      'coleman',
      'kvistad',
      'church',
      'hanson',
      'halatek',
      'jdogg',
      'mathiesen',
    ])
  })

  it('names only outfits that exist', () => {
    for (const id of SELECTABLE) expect(OUTFITS[id]).toBeDefined()
  })

  it('keeps the driver and the shadowmen off the roster', () => {
    expect(isSelectable('marx')).toBe(false)
    expect(isSelectable('shadow')).toBe(false)
    // Gron changes who you are; nobody raids as Gron.
    expect(isSelectable('gron')).toBe(false)
    expect(isSelectable(null)).toBe(false)
  })

  it("reads the account's pick, with defaults for what it lacks", () => {
    expect(DEFAULT_CHARACTER).toBe('player')
    const fresh = { outfit: DEFAULT_CHARACTER, finish: DEFAULT_FINISH }
    expect(pickOf(null)).toEqual(fresh)
    expect(pickOf({ outfit: null, finish: null })).toEqual(fresh)
    expect(pickOf({ outfit: 'church', finish: 'cherry' })).toEqual({
      outfit: 'church',
      finish: 'cherry',
    })
    expect(pickOf({ outfit: 'hanson', finish: null })).toEqual({
      outfit: 'hanson',
      finish: DEFAULT_FINISH,
    })
  })
})
