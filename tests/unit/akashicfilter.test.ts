import { describe, expect, it } from 'vitest'
import {
  ASSET_KINDS,
  ASSET_SETS,
  assetMatches,
  inSet,
  KIND_LABELS,
  kindOf,
  NO_FILTER,
  PLACE_LABELS,
  placeOf,
  PLACES,
  SET_LABELS,
  setsOf,
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

  it('labels every kind', () => {
    for (const kind of ASSET_KINDS) expect(KIND_LABELS[kind]).toBeTruthy()
  })
})

describe('placeOf', () => {
  it('puts each station where it stands', () => {
    expect(placeOf('citgo-station')).toBe('citgo')
    expect(placeOf('ad-smokes')).toBe('citgo')
    expect(placeOf('topiary-lion')).toBe('corn-maze')
    expect(placeOf('burnt-sedan')).toBe('drive-in')
    expect(placeOf('spomenik-fins')).toBe('castle')
    expect(placeOf('giant-slab')).toBe('graveyard')
    expect(placeOf('shopping-cart')).toBe('plaza')
    expect(placeOf('forklift')).toBe('industrial')
    expect(placeOf('fish-bluegill')).toBe('pond')
    expect(placeOf('tree-elm')).toBe('roadside')
  })

  it('takes a name doing something, and the longest name', () => {
    expect(placeOf('castle-entropy-crumbling')).toBe('castle')
    expect(placeOf('warden-burning')).toBe('undercroft')
    expect(placeOf('zebco-33-racked')).toBe('pond')
    expect(placeOf('cabbage-stand-3')).toBe('roadside')
    expect(placeOf('citgo-portal')).toBe('citgo')
    expect(placeOf('portal')).toBe('corn-maze')
  })

  it('leaves what it does not place elsewhere', () => {
    expect(placeOf('pack-marlboro')).toBe('elsewhere')
    expect(placeOf('emote-wave')).toBe('elsewhere')
    expect(placeOf('drive-in-screens')).toBe('elsewhere')
  })

  it('labels every place', () => {
    for (const place of PLACES) expect(PLACE_LABELS[place]).toBeTruthy()
  })
})

describe('inSet', () => {
  it('gathers a family by its prefix', () => {
    expect(inSet('drink-pbr', 'drinks')).toBe(true)
    expect(inSet('pack-camel', 'drinks')).toBe(false)
    expect(inSet('cabbage-stand-2', 'stands')).toBe(true)
  })

  it('gathers strikes and burns across beings', () => {
    expect(inSet('caretaker-striking', 'striking')).toBe(true)
    expect(inSet('warden-burning', 'burning')).toBe(true)
    expect(inSet('warden', 'burning')).toBe(false)
  })

  it('lets an asset sit in more than one set', () => {
    expect(setsOf('shadowman-burning')).toEqual(['shadows', 'burning'])
    expect(setsOf('zebco-33-racked')).toEqual(['rods'])
    expect(setsOf('pump')).toEqual([])
  })

  it('labels every set', () => {
    for (const set of ASSET_SETS) expect(SET_LABELS[set]).toBeTruthy()
  })
})

describe('assetMatches', () => {
  const pump = { id: 'pump', label: 'Gas pump' }
  const marx = { id: 'figure-marx', label: 'Figure: Matthew Marx' }
  const all = NO_FILTER

  it('shows everything with no filter', () => {
    expect(assetMatches(pump, all)).toBe(true)
    expect(assetMatches(marx, { ...all, search: '  ' })).toBe(true)
  })

  it('shows any of the kinds ticked', () => {
    expect(assetMatches(marx, { ...all, kinds: ['characters'] })).toBe(true)
    expect(assetMatches(pump, { ...all, kinds: ['characters'] })).toBe(false)
    const both = { ...all, kinds: ['characters', 'props'] as const }
    expect(assetMatches(pump, both)).toBe(true)
  })

  it('shows only the place and the set asked for', () => {
    expect(assetMatches(pump, { ...all, place: 'citgo' })).toBe(true)
    expect(assetMatches(pump, { ...all, place: 'pond' })).toBe(false)
    expect(assetMatches(marx, { ...all, set: 'figures' })).toBe(true)
    expect(assetMatches(pump, { ...all, set: 'figures' })).toBe(false)
  })

  it('searches the id and the label, any case, every word', () => {
    expect(assetMatches(pump, { ...all, search: 'GAS' })).toBe(true)
    expect(assetMatches(marx, { ...all, search: 'figure matthew' })).toBe(true)
    expect(assetMatches(marx, { ...all, search: 'matthew pump' })).toBe(false)
  })

  it('takes every part of the filter at once', () => {
    const items = { ...all, kinds: ['items'] as const, search: 'marx' }
    expect(assetMatches(marx, items)).toBe(false)
    const chars = { ...all, kinds: ['characters'] as const, search: 'marx' }
    expect(assetMatches(marx, { ...chars, place: 'citgo' })).toBe(true)
  })
})
