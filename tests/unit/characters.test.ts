import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHARACTER,
  isSelectable,
  mayRaidAs,
  pickOf,
  ROSTER,
  rosterFor,
  SELECTABLE,
  UNLOCKED_BY,
} from '../../src/characters.ts'
import { cosmeticById } from '../../src/cosmetics.ts'
import { DEFAULT_FINISH } from '../../src/finishes.ts'
import { OUTFITS } from '../../src/outfits.ts'

describe('characters', () => {
  it('offers the player and the named characters', () => {
    expect(SELECTABLE).toEqual([
      'player',
      'coleman',
      'kvistad',
      'church',
      'hanson',
      'halatek',
      'jdogg',
      'mathiesen',
      'rich',
      'sam',
      'meyer',
      'anderchuck',
      'lane',
      'terry',
    ])
  })

  it('names only outfits that exist', () => {
    for (const id of SELECTABLE) expect(OUTFITS[id]).toBeDefined()
  })

  it('keeps the driver and the shadowmen off the roster', () => {
    expect(isSelectable('marx')).toBe(false)
    expect(isSelectable('shadow')).toBe(false)
    // Nobody raids as Gron.
    expect(isSelectable('gron')).toBe(false)
    expect(isSelectable(null)).toBe(false)
  })

  it('keeps David Coleman: #1 behind his trade with Moab', () => {
    expect(UNLOCKED_BY).toEqual({ coleman1: 'coleman-1' })
    for (const [id, opens] of Object.entries(UNLOCKED_BY)) {
      expect(OUTFITS[id as keyof typeof OUTFITS]).toBeDefined()
      expect(cosmeticById(opens)).not.toBeNull()
      expect(SELECTABLE).not.toContain(id)
    }
    expect(ROSTER).toEqual([...SELECTABLE, 'coleman1'])
    expect(isSelectable('coleman1')).toBe(true)
    expect(mayRaidAs('coleman1', [])).toBe(false)
    expect(mayRaidAs('coleman1', ['flaming-halo'])).toBe(false)
    expect(mayRaidAs('coleman1', ['coleman-1'])).toBe(true)
    expect(mayRaidAs('church', [])).toBe(true)
    expect(mayRaidAs('marx', ['coleman-1'])).toBe(false)
    expect(rosterFor([])).toEqual(SELECTABLE)
    expect(rosterFor(['coleman-1'])).toEqual([...SELECTABLE, 'coleman1'])
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
