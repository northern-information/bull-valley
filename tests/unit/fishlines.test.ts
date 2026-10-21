import { describe, expect, it } from 'vitest'
import { copy } from '../../src/copy.ts'
import {
  anglerNews,
  baitName,
  catchLine,
  feelingLine,
  fishRefusal,
  hookLine,
  skillUpLine,
} from '../../src/fishlines.ts'
import { itemLabel } from '../../src/itemcopy.ts'

describe('what fishing says', () => {
  it('calls the hook as FFXI does', () => {
    expect(hookLine('small')).toBe(copy('fishing.hook_small'))
    expect(hookLine('large')).toBe(copy('fishing.hook_large'))
    expect(hookLine('item')).toBe(copy('fishing.hook_item'))
  })

  it('says each feeling', () => {
    expect(feelingLine('unsure')).toBe(copy('fishing.feel_unsure'))
    expect(feelingLine('fairly')).toBe(copy('fishing.feel_fairly'))
    expect(feelingLine('positive')).toBe(copy('fishing.feel_positive'))
  })

  it('names the bait by its item', () => {
    expect(baitName('berries')).toBe(itemLabel('berries'))
  })

  it('says how the line came out', () => {
    expect(catchLine({ outcome: 'landed', kind: 'bluegill' })).toBe(
      copy('fishing.caught', { item: itemLabel('bluegill') })
    )
    expect(catchLine({ outcome: 'landed', kind: 'empty-can' })).toBe(
      copy('fishing.caught_junk', { item: itemLabel('empty-can') })
    )
    expect(catchLine({ outcome: 'skill' })).toBe(copy('fishing.lost_skill'))
    expect(catchLine({ outcome: 'snap' })).toBe(copy('fishing.snap'))
    expect(catchLine({ outcome: 'gave-up' })).toBe(copy('fishing.gave_up'))
    expect(skillUpLine(123)).toBe(copy('fishing.skill_up', { skill: '12.3' }))
  })

  it('says the rod and the dig, and nothing for an angler only read', () => {
    expect(anglerNews({ rod: true })).toBe(copy('log.fish_rod'))
    expect(anglerNews({ dug: 2 })).toBe(copy('log.fish_dug', { count: 2 }))
    expect(anglerNews({})).toBeNull()
  })

  it('says why the valley refused', () => {
    const lines: [string, string][] = [
      ['no-pond', 'log.fish_far'],
      ['aboard', 'log.fish_far'],
      ['has-rod', 'log.fish_has_rod'],
      ['no-rod', 'log.fish_no_rod'],
      ['no-bait', 'log.fish_no_bait'],
      ['tired', 'log.fish_tired'],
      ['too-soon', 'log.fish_dug_out'],
      ['busy', 'log.fish_busy'],
      ['no-line', 'log.fish_busy'],
      ['not-in-valley', 'log.fish_offline'],
      ['unwritten', 'log.fish_refused'],
    ]
    for (const [reason, key] of lines) {
      expect(fishRefusal(reason), reason).toBe(copy(key))
    }
  })
})
