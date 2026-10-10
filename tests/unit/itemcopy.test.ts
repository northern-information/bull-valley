import { describe, expect, it } from 'vitest'
import { COPY, copy } from '../../src/copy.ts'
import {
  hasItemLine,
  ITEM_COPY_KEYS,
  ITEM_LINES,
  itemBlurb,
  itemLabel,
  itemLine,
} from '../../src/itemcopy.ts'
import { isUsable, ITEMS } from '../../src/items.ts'

describe('itemcopy', () => {
  it('names every item and describes it', () => {
    for (const { id } of ITEMS) {
      expect(itemLabel(id)).toBe(copy(`items.${id}.label`))
      expect(itemBlurb(id)).toBe(copy(`items.${id}.blurb`))
    }
    expect(itemLabel('newport')).toBe(copy('items.newport.label'))
  })

  it('leaves an unknown kind to its id, with nothing to say', () => {
    expect(itemLabel('mystery')).toBe('mystery')
    expect(itemBlurb('mystery')).toBe('')
    for (const line of ITEM_LINES) expect(itemLine('mystery', line)).toBeNull()
  })

  it('gives every item its lines: used and empty when usable, bought when priced, collected off the bush', () => {
    for (const item of ITEMS) {
      const { id } = item
      expect(hasItemLine(id, 'bought'), id).toBe('price' in item)
      expect(hasItemLine(id, 'collected'), id).toBe(id === 'berries')
      expect(hasItemLine(id, 'used'), id).toBe(isUsable(id))
      expect(hasItemLine(id, 'empty'), id).toBe(isUsable(id))
      for (const line of ITEM_LINES) {
        const said = itemLine(id, line)
        if (hasItemLine(id, line)) {
          expect(said, `${id}.${line}`).toBe(copy(`items.${id}.${line}`))
        } else expect(said, `${id}.${line}`).toBeNull()
      }
    }
    expect(itemLine('marlboro', 'bought')).toBeTruthy()
    expect(itemLine('berries', 'bought')).toBeNull()
    expect(itemLine('benadryl', 'used')).toBeNull()
  })

  it('lists every key it reads, and reads every item key COPY.toml has', () => {
    const keys = new Set(ITEM_COPY_KEYS)
    expect(keys.size).toBe(ITEM_COPY_KEYS.length)
    for (const key of keys) expect(COPY.has(key), key).toBe(true)
    const inBook = [...COPY.keys()].filter((key) => key.startsWith('items.'))
    expect(inBook.sort()).toEqual([...keys].sort())
  })
})
