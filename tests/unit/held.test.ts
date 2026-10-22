import { describe, expect, it } from 'vitest'
import {
  baitFor,
  CAST,
  castPose,
  isTool,
  nextTool,
  SCOOP,
  scoopPose,
  toolIn,
  TOOLS,
  toolsIn,
} from '../../src/held.ts'

const BARE = {}
const JAR = { 'slurm-jar': 1 }
const BOTH = { 'slurm-jar': 1, 'ugly-stik': 1 }

describe('what the left hand holds', () => {
  it('knows the three things a hand holds', () => {
    expect(TOOLS).toEqual(['flashlight', 'jar', 'rod'])
    expect(isTool('rod')).toBe(true)
    expect(isTool('lantern')).toBe(false)
  })

  it('holds the flashlight always, a jar and a rod while carried', () => {
    expect(toolsIn(BARE)).toEqual(['flashlight'])
    expect(toolsIn(JAR)).toEqual(['flashlight', 'jar'])
    expect(toolsIn({ 'slurm-jar': 0, 'fishing-rod': 1 })).toEqual([
      'flashlight',
      'rod',
    ])
    expect(toolsIn(BOTH)).toEqual(['flashlight', 'jar', 'rod'])
  })

  it('steps through what is carried, either way round', () => {
    expect(nextTool('flashlight', BARE)).toBe('flashlight')
    expect(nextTool('flashlight', BOTH)).toBe('jar')
    expect(nextTool('jar', BOTH)).toBe('rod')
    expect(nextTool('rod', BOTH)).toBe('flashlight')
    expect(nextTool('flashlight', BOTH, -1)).toBe('rod')
    expect(nextTool('jar', BOTH, -1)).toBe('flashlight')
    expect(nextTool('flashlight', { 'g-loomis': 1 })).toBe('rod')
    // A hand holding what is gone steps to the first thing carried.
    expect(nextTool('rod', JAR)).toBe('flashlight')
  })

  it('goes back to the flashlight once what it held is gone', () => {
    expect(toolIn('jar', JAR)).toBe('jar')
    expect(toolIn('jar', BARE)).toBe('flashlight')
    expect(toolIn('rod', JAR)).toBe('flashlight')
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
