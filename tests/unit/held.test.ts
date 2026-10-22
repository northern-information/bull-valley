import { describe, expect, it } from 'vitest'
import {
  baitFor,
  CAST,
  castPose,
  inHand,
  isTool,
  SCOOP,
  scoopPose,
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

describe('a cast', () => {
  it('rests, with the bobber on the water, outside the cast', () => {
    expect(castPose(-1)).toEqual({ tilt: 0, fly: 1 })
    expect(castPose(CAST.lands)).toEqual({ tilt: 0, fly: 1 })
    expect(castPose(0)).toEqual({ tilt: 0, fly: 0 })
  })

  it('swings back, whips forward past rest, and settles', () => {
    expect(castPose(CAST.back).tilt).toBeCloseTo(CAST.up)
    expect(castPose(CAST.whip).tilt).toBeCloseTo(-CAST.down)
    expect(castPose(CAST.settle).tilt).toBeCloseTo(0)
    // Never further back or forward than the swing goes.
    for (let t = 0; t < CAST.lands; t += 0.01) {
      const { tilt } = castPose(t)
      expect(tilt).toBeLessThanOrEqual(CAST.up + 1e-9)
      expect(tilt).toBeGreaterThanOrEqual(-CAST.down - 1e-9)
    }
  })

  it('lets the bobber go on the whip and lands it after', () => {
    expect(castPose(CAST.release).fly).toBe(0)
    expect(castPose(CAST.release - 0.05).fly).toBe(0)
    const half = castPose((CAST.release + CAST.lands) / 2).fly
    expect(half).toBeCloseTo(0.5)
    expect(castPose(CAST.lands - 0.001).fly).toBeGreaterThan(0.99)
  })
})

describe('a scoop', () => {
  it('rests outside the scoop', () => {
    const rest = { tilt: 0, tip: 0, reach: 0 }
    expect(scoopPose(-1)).toEqual(rest)
    expect(scoopPose(SCOOP.settle)).toEqual(rest)
    const start = scoopPose(0)
    expect(start.tilt).toBeCloseTo(0)
    expect(start.tip).toBe(0)
    expect(start.reach).toBe(0)
  })

  it('dips down and out with the jar tipped, sweeps up, and settles', () => {
    const bottom = scoopPose(SCOOP.dip)
    expect(bottom.tilt).toBeCloseTo(-SCOOP.down)
    expect(bottom.tip).toBeCloseTo(SCOOP.tip)
    expect(bottom.reach).toBeCloseTo(SCOOP.reach)
    const top = scoopPose(SCOOP.sweep)
    expect(top.tilt).toBeCloseTo(SCOOP.up)
    expect(top.tip).toBeCloseTo(0)
    expect(top.reach).toBeCloseTo(0)
    expect(scoopPose(SCOOP.settle - 1e-6).tilt).toBeCloseTo(0)
    // Never further down or up, nor tipped or out further, than it goes.
    for (let t = 0; t < SCOOP.settle; t += 0.01) {
      const { tilt, tip, reach } = scoopPose(t)
      expect(tilt).toBeLessThanOrEqual(SCOOP.up + 1e-9)
      expect(tilt).toBeGreaterThanOrEqual(-SCOOP.down - 1e-9)
      expect(tip).toBeGreaterThanOrEqual(0)
      expect(tip).toBeLessThanOrEqual(SCOOP.tip + 1e-9)
      expect(reach).toBeGreaterThanOrEqual(0)
      expect(reach).toBeLessThanOrEqual(SCOOP.reach + 1e-9)
    }
  })
})
