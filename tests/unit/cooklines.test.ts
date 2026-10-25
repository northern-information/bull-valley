import { describe, expect, it } from 'vitest'
import { cookedLine, cookRefusal } from '../../src/cooklines.ts'
import { copy } from '../../src/copy.ts'
import { itemLabel } from '../../src/itemcopy.ts'

describe('what the campfire says', () => {
  it('says what cooked into what', () => {
    expect(
      cookedLine({ kind: 'bluegill', count: 3, into: 'fried-panfish' })
    ).toBe(
      copy('log.cooked', {
        count: 3,
        fish: itemLabel('bluegill'),
        food: itemLabel('fried-panfish'),
      })
    )
  })

  it('says why nothing cooked', () => {
    expect(cookRefusal('no-campfire')).toBe(copy('log.cook_far'))
    expect(cookRefusal('aboard')).toBe(copy('log.cook_far'))
    expect(cookRefusal('short')).toBe(copy('log.cook_short'))
    expect(cookRefusal('not-in-valley')).toBe(copy('log.cook_offline'))
    expect(cookRefusal('raw-only')).toBe(copy('log.cook_refused'))
  })
})
