import { describe, expect, it } from 'vitest'
import { copy } from '../../src/copy.ts'
import { itemLabel } from '../../src/itemcopy.ts'
import { isKeyItem } from '../../src/items.ts'
import {
  exhumeRefusal,
  isMech,
  mechFanfare,
  mechOf,
  MECHS,
  unearthedLine,
} from '../../src/mechs.ts'

describe('the mechs', () => {
  it('are every one a key item', () => {
    for (const mech of MECHS) expect(isKeyItem(mech.id)).toBe(true)
    expect(isMech('mech-seraph')).toBe(true)
    expect(isMech('shovel')).toBe(false)
  })

  it('draws each on its share of the roll, commonest first', () => {
    expect(mechOf(0)).toBe('mech-grigori')
    expect(mechOf(0.5)).toBe('mech-nephil')
    expect(mechOf(0.999)).toBe('mech-ophanim')
    expect(mechOf(1)).toBe('mech-ophanim')
    expect(mechOf(-1)).toBe('mech-grigori')
    const counts = new Map<string, number>()
    const n = 10_000
    for (let i = 0; i < n; i++) {
      const id = mechOf(i / n)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const total = MECHS.reduce((sum, m) => sum + m.weight, 0)
    for (const mech of MECHS) {
      expect((counts.get(mech.id) ?? 0) / n).toBeCloseTo(mech.weight / total, 2)
    }
  })

  it('makes a bigger deal of a rarer one', () => {
    expect(mechFanfare('mech-grigori')).toMatchObject({
      tier: 'fish',
      kicker: copy('mechs.common'),
      headline: itemLabel('mech-grigori'),
      gold: false,
    })
    expect(mechFanfare('mech-seraph')?.tier).toBe('big')
    expect(mechFanfare('mech-ophanim')).toMatchObject({
      tier: 'legend',
      gold: true,
    })
    expect(mechFanfare('shovel')).toBeNull()
  })

  it('says what came up, and why the earth would not give', () => {
    expect(unearthedLine('mech-anakim')).toBe(
      copy('mechs.unearthed', {
        mech: itemLabel('mech-anakim'),
        rarity: copy('mechs.rare'),
      })
    )
    expect(exhumeRefusal('dug-today')).toBe(copy('mechs.dug_today'))
    expect(exhumeRefusal('no-shovel')).toBe(copy('mechs.no_shovel'))
    expect(exhumeRefusal('too-far')).toBe(copy('mechs.too_far'))
    expect(exhumeRefusal('unavailable')).toBe(copy('mechs.refused'))
  })
})
