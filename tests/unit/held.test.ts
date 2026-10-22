import { describe, expect, it } from 'vitest'
import {
  baitFor,
  inHand,
  isTool,
  stepSlot,
  toolOf,
  TOOLS,
  useOf,
} from '../../src/held.ts'
import { EMPTY_HOTBAR, HOTBAR_SLOTS } from '../../src/hotbar.ts'

const BARE = {}
const BAR = EMPTY_HOTBAR.map((_, i) =>
  i === 0 ? 'flashlight' : i === 1 ? 'citgo-phone' : i === 2 ? 'marlboro' : null
)

describe('what the hand holds', () => {
  it('knows the three tools a hand shows', () => {
    expect(TOOLS).toEqual(['flashlight', 'jar', 'rod'])
    expect(isTool('rod')).toBe(true)
    expect(isTool('lantern')).toBe(false)
  })

  it('shows the flashlight, the jar and any rod; the rest out of sight', () => {
    expect(toolOf('flashlight')).toBe('flashlight')
    expect(toolOf('slurm-jar')).toBe('jar')
    expect(toolOf('fishing-rod')).toBe('rod')
    expect(toolOf('g-loomis')).toBe('rod')
    expect(toolOf('citgo-phone')).toBeNull()
    expect(toolOf('marx-whistle')).toBeNull()
    expect(toolOf(null)).toBeNull()
  })

  it('holds the selected slot, while the pack does', () => {
    const pack = { flashlight: 1, 'citgo-phone': 1, marlboro: 0 }
    expect(inHand(BAR, 0, pack)).toBe('flashlight')
    expect(inHand(BAR, 1, pack)).toBe('citgo-phone')
    // Out of it, or an empty slot: nothing in the hand.
    expect(inHand(BAR, 2, pack)).toBeNull()
    expect(inHand(BAR, 5, pack)).toBeNull()
    expect(inHand(BAR, 0, BARE)).toBeNull()
  })

  it('steps along the bar, round again past either end', () => {
    expect(stepSlot(0, 1)).toBe(1)
    expect(stepSlot(HOTBAR_SLOTS - 1, 1)).toBe(0)
    expect(stepSlot(0, -1)).toBe(HOTBAR_SLOTS - 1)
    expect(stepSlot(4, -1)).toBe(3)
  })

  it('uses what it holds on the click', () => {
    expect(useOf('flashlight', false)).toBe('light')
    expect(useOf('slurm-jar', false)).toBe('catch')
    expect(useOf('zebco-33', false)).toBe('cast')
    expect(useOf('citgo-phone', false)).toBe('dial')
    expect(useOf('marx-whistle', false)).toBe('whistle')
    expect(useOf('marlboro', true)).toBe('use')
    // A thing with no use, or nothing at all, does nothing.
    expect(useOf('rose', false)).toBeNull()
    expect(useOf(null, true)).toBeNull()
  })

  it('casts with the bait picked while it lasts, else the first carried', () => {
    const pack = { nightcrawlers: 2, slurm: 1 }
    expect(baitFor('slurm', pack)).toBe('slurm')
    expect(baitFor(null, pack)).toBe('nightcrawlers')
    expect(baitFor('berries', pack)).toBe('nightcrawlers')
    expect(baitFor('slurm', { slurm: 0, berries: 3 })).toBe('berries')
    expect(baitFor(null, BARE)).toBeNull()
  })
})
