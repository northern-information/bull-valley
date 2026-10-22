import { describe, expect, it } from 'vitest'
import {
  ASSET_KINDS,
  assetMatches,
  KIND_LABELS,
  kindOf,
} from '../../src/akashicfilter.ts'

describe('kindOf', () => {
  it('sorts the figures and the beings into characters', () => {
    expect(kindOf('figure-marx')).toBe('characters')
    expect(kindOf('shadowman')).toBe('characters')
    expect(kindOf('caretaker')).toBe('characters')
  })

  it('sorts what moves into poses', () => {
    expect(kindOf('emote-wave')).toBe('poses')
    expect(kindOf('walk')).toBe('poses')
    expect(kindOf('shadowman-striking')).toBe('poses')
  })

  it('sorts what a raider carries into items', () => {
    expect(kindOf('pack-marlboro')).toBe('items')
    expect(kindOf('drink-pbr')).toBe('items')
    expect(kindOf('med-aspirin')).toBe('items')
    expect(kindOf('fish-shadow-carp')).toBe('items')
    expect(kindOf('zebco-33')).toBe('items')
    expect(kindOf('cabbage')).toBe('items')
  })

  it('keeps a racked rod a prop, not an item', () => {
    expect(kindOf('zebco-33-racked')).toBe('props')
  })

  it('sorts the stations into places, each stand level among them', () => {
    expect(kindOf('citgo-station')).toBe('places')
    expect(kindOf('cabbage-stand')).toBe('places')
    expect(kindOf('cabbage-stand-3')).toBe('places')
  })

  it('sorts the weather and the light into effects', () => {
    expect(kindOf('mist')).toBe('effects')
    expect(kindOf('citgo-portal')).toBe('effects')
  })

  it('calls anything it does not name a prop', () => {
    expect(kindOf('dumpster')).toBe('props')
    expect(kindOf('something-new')).toBe('props')
  })

  it('labels every kind and the whole', () => {
    for (const kind of ASSET_KINDS) expect(KIND_LABELS[kind]).toBeTruthy()
    expect(KIND_LABELS.all).toBeTruthy()
  })
})

describe('assetMatches', () => {
  const pump = { id: 'pump', label: 'Gas pump' }
  const marx = { id: 'figure-marx', label: 'Figure: Matthew Marx' }

  it('shows everything under all with no search', () => {
    expect(assetMatches(pump, 'all', '')).toBe(true)
    expect(assetMatches(marx, 'all', '  ')).toBe(true)
  })

  it('shows only the kind asked for', () => {
    expect(assetMatches(marx, 'characters', '')).toBe(true)
    expect(assetMatches(pump, 'characters', '')).toBe(false)
  })

  it('searches the id and the label, any case, every word', () => {
    expect(assetMatches(pump, 'all', 'GAS')).toBe(true)
    expect(assetMatches(marx, 'all', 'figure matthew')).toBe(true)
    expect(assetMatches(marx, 'all', 'matthew pump')).toBe(false)
  })

  it('takes both the kind and the search', () => {
    expect(assetMatches(marx, 'items', 'marx')).toBe(false)
    expect(assetMatches(marx, 'characters', 'marx')).toBe(true)
  })
})
