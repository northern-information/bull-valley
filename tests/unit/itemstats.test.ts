import { describe, expect, it } from 'vitest'
import { copy } from '../../src/copy.ts'
import { getItem, ITEMS } from '../../src/items.ts'
import { doseText, itemStats, spanOf } from '../../src/itemstats.ts'
import { wardWords } from '../../src/itemstatsview.ts'

describe('an item’s stats', () => {
  it('reads a cigarette off the table', () => {
    const item = getItem('marlboro')
    const stats = itemStats('marlboro')
    expect(stats[0]).toEqual({ stat: 'category', category: 'cigarette' })
    expect(stats).toContainEqual({
      stat: 'lasts',
      lasting: 'smoke',
      seconds: item.smokeSeconds,
    })
    expect(stats).toContainEqual({ stat: 'price', cents: item.price })
    expect(stats.some((one) => one.stat === 'ward')).toBe(true)
    expect(stats.some((one) => one.stat === 'contents')).toBe(true)
  })

  it('names the perception and the trails, and a ward brought down', () => {
    expect(itemStats('joints')).toContainEqual(
      expect.objectContaining({ stat: 'lasts', lasting: 'perception' })
    )
    const drinks = itemStats('four-loko-blue')
    expect(drinks).toContainEqual(
      expect.objectContaining({ stat: 'lasts', lasting: 'trails' })
    )
    expect(drinks).toContainEqual(expect.objectContaining({ stat: 'heals' }))
    expect(itemStats('eye-drops')).toContainEqual(
      expect.objectContaining({ stat: 'ward', axis: 'tripping' })
    )
  })

  // A line handed a value it has no place for throws, and the pack card
  // and Dial-Up's locker list with it.
  it('words every ward of every item', () => {
    const wards = ITEMS.flatMap(({ id }) =>
      itemStats(id).flatMap((stat) => (stat.stat === 'ward' ? [stat] : []))
    )
    expect(wards.some((stat) => stat.dose < 0)).toBe(true)
    for (const stat of wards) expect(wardWords(stat)).toBeTruthy()
    expect(
      wardWords({ stat: 'ward', axis: 'tripping', dose: -1 })
    ).not.toContain(copy('wards.tripping_against'))
  })

  it('gives a key item its kind alone, and an unknown kind nothing', () => {
    expect(itemStats('vault-key')).toEqual([
      { stat: 'category', category: 'key-item' },
    ])
    expect(itemStats('pebbles')).toEqual([])
  })

  it('prints spans and doses', () => {
    expect(spanOf(45)).toBe('45s')
    expect(spanOf(120)).toBe('2m')
    expect(spanOf(150)).toBe('2m 30s')
    expect(doseText(0.5)).toBe('+50%')
    expect(doseText(-0.15)).toBe('−15%')
  })
})
