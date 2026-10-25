import { describe, expect, it } from 'vitest'
import { copy } from '../../src/copy.ts'
import { tradeFanfare } from '../../src/tradefanfare.ts'

describe('a trade made a big deal of', () => {
  it("burns gold for Moab's gold, and is a fish's for the rest", () => {
    expect(tradeFanfare('moab', 'coleman-1', 'David Coleman: #1')).toEqual({
      kind: 'coleman-1',
      tier: 'big',
      kicker: copy('moab.fanfare'),
      headline: 'David Coleman: #1',
      gold: true,
    })
    expect(tradeFanfare('dealer', 'lsd', 'LSD')).toMatchObject({
      tier: 'fish',
      kicker: copy('dealer.fanfare'),
      gold: false,
    })
    expect(tradeFanfare('shop', 'marlboro', 'Marlboro')).toMatchObject({
      tier: 'fish',
      kicker: copy('shop.fanfare'),
      gold: false,
    })
  })
})
