import { describe, expect, it } from 'vitest'
import { contentsOf } from '../../src/items.ts'
import { emptyOf } from '../../src/recycling.ts'

describe('recycling', () => {
  it('leaves a can after a canned drink and a bottle after a bottled one', () => {
    expect(emptyOf('pbr', 0)).toBe('empty-can')
    expect(emptyOf('red-bull', 3)).toBe('empty-can')
    expect(emptyOf('four-loko-blue', 0)).toBe('empty-can')
    expect(emptyOf('high-life', 0)).toBe('empty-bottle')
    expect(emptyOf('wild-turkey', 2)).toBe('empty-bottle')
    expect(emptyOf('ice-mountain', 0)).toBe('empty-bottle')
    expect(emptyOf('nos', 0)).toBe('empty-bottle')
  })

  it('leaves a pack only when the last cigarette comes out of it', () => {
    const pack = contentsOf('marlboro')
    expect(emptyOf('marlboro', 0)).toBe('empty-pack')
    expect(emptyOf('marlboro', pack)).toBe('empty-pack')
    expect(emptyOf('marlboro', pack - 1)).toBeNull()
    expect(emptyOf('marlboro', 1)).toBeNull()
  })

  it('leaves nothing after anything else', () => {
    for (const kind of ['joints', 'lsd', 'adderall', 'aspirin', 'cabbage']) {
      expect(emptyOf(kind, 0)).toBeNull()
    }
    expect(emptyOf('no-such-thing', 0)).toBeNull()
  })
})
