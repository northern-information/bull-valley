import { describe, expect, it } from 'vitest'
import { copy } from '../../src/copy.ts'
import { DIME_CENTS } from '../../src/drops.ts'
import {
  foundLine,
  lineBlurb,
  lineName,
  recycleRefusal,
  researchNews,
} from '../../src/researchlines.ts'
import { formatCash } from '../../src/store.ts'

describe('what the Recycling Center says', () => {
  it('names each line and what it does', () => {
    expect(lineName('dimes')).toBe(copy('recycling.line_dimes'))
    expect(lineBlurb('dimes')).toBe(copy('recycling.line_dimes_blurb'))
  })

  it('says a level bought, and nothing for research only read', () => {
    expect(researchNews({ research: { dimes: 2 }, line: 'dimes' })).toBe(
      copy('log.researched', { line: lineName('dimes'), level: 2 })
    )
    expect(researchNews({ research: { dimes: 2 } })).toBeNull()
  })

  it('says loose change found, in dimes and in cash', () => {
    expect(foundLine(4)).toBe(
      copy('log.found_dimes', {
        count: 4,
        amount: formatCash(4 * DIME_CENTS),
      })
    )
  })

  it('says why the recycling machine would not take the empties', () => {
    expect(recycleRefusal('no-recycler')).toBe(copy('log.recycle_far'))
    expect(recycleRefusal('aboard')).toBe(copy('log.recycle_far'))
    expect(recycleRefusal('short')).toBe(copy('log.recycle_short'))
    expect(recycleRefusal('not-in-valley')).toBe(copy('log.recycle_offline'))
    expect(recycleRefusal('too-fast')).toBe(copy('log.recycle_refused'))
  })
})
