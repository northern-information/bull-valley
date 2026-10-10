import { describe, expect, it } from 'vitest'
import {
  beamScale,
  buffedBeam,
  dosed,
  geometrieOf,
  inPassReach,
  isLevels,
  isSober,
  passTarget,
  scaled,
  shrugChance,
  shrugs,
  sobered,
  sprintScale,
} from '../../src/buffs.ts'
import { CONFIG } from '../../src/config.ts'
import { levelsAt, SOBER } from '../../src/geometrie.ts'
import type { Beam } from '../../src/shadowmen.ts'

const SOBER_LEVELS = { high: 0, stimulated: 0, drunk: 0 }
const FULL = { high: 1, stimulated: 1, drunk: 1 }
const cfg = CONFIG.buffs

const BEAM: Beam = {
  origin: { x: 0, y: 1.6, z: 0 },
  dir: { x: 0, y: 0, z: -1 },
  range: 20,
  halfAngle: 0.3,
  floor: 0,
}

describe('what geometrie does', () => {
  it('reaches the beam further and wider with high, and not at all sober', () => {
    expect(beamScale(SOBER_LEVELS)).toBe(1)
    expect(buffedBeam(BEAM, SOBER_LEVELS)).toBe(BEAM)
    const high = buffedBeam(BEAM, { ...SOBER_LEVELS, high: 1 })
    expect(high.range).toBeCloseTo(20 * (1 + cfg.beamPerHigh))
    expect(high.halfAngle).toBeCloseTo(0.3 * (1 + cfg.beamPerHigh))
    expect(high.origin).toBe(BEAM.origin)
    // Never wider than a half turn.
    const wide = buffedBeam({ ...BEAM, halfAngle: 1.5 }, FULL)
    expect(wide.halfAngle).toBe(Math.PI / 2)
  })

  it('quickens the sprint with stimulated', () => {
    expect(sprintScale(SOBER_LEVELS)).toBe(1)
    expect(sprintScale(FULL)).toBeCloseTo(1 + cfg.sprintPerStimulated)
  })

  it('shrugs a touch off by a chance that grows with drunk', () => {
    expect(shrugChance(SOBER_LEVELS)).toBe(0)
    expect(shrugs(SOBER_LEVELS, 0)).toBe(false)
    expect(shrugChance(FULL)).toBeCloseTo(cfg.shrugPerDrunk)
    expect(shrugs(FULL, cfg.shrugPerDrunk - 0.01)).toBe(true)
    expect(shrugs(FULL, cfg.shrugPerDrunk + 0.01)).toBe(false)
    expect(shrugChance(FULL, { ...cfg, shrugPerDrunk: 3 })).toBe(1)
  })

  it("scales a dose to the giver's share, leaving out what it never named", () => {
    expect(scaled({ high: 0.5, drunk: -0.2 }, 0.5)).toEqual({
      high: 0.25,
      drunk: -0.1,
    })
    expect(scaled(undefined, 0.5)).toEqual({})
  })
})

describe('passing', () => {
  it('reaches only so far', () => {
    expect(inPassReach({ x: 0, z: 0 }, { x: cfg.passReach, z: 0 })).toBe(true)
    expect(inPassReach({ x: 0, z: 0 }, { x: cfg.passReach + 0.1, z: 0 })).toBe(
      false
    )
  })

  it('passes to the nearest raider in reach and in front', () => {
    const me = { x: 0, z: 0 }
    // Facing -Z.
    const ahead = { id: 'ahead', x: 0, z: -2 }
    const nearer = { id: 'nearer', x: 0.5, z: -1 }
    const behind = { id: 'behind', x: 0, z: 1 }
    const far = { id: 'far', x: 0, z: -10 }
    expect(passTarget(me, 0, [ahead, behind, far])).toBe(ahead)
    expect(passTarget(me, 0, [ahead, nearer])).toBe(nearer)
    expect(passTarget(me, 0, [behind, far])).toBeNull()
    // Turned round, the one behind is ahead.
    expect(passTarget(me, Math.PI, [ahead, behind])).toBe(behind)
    // Standing on the same spot counts.
    expect(passTarget(me, 0, [{ id: 'here', x: 0, z: 0 }])?.id).toBe('here')
  })
})

describe("the valley's record of geometrie", () => {
  it('doses an account, keeps none sober, and sobers one on a shattering', () => {
    let record = dosed({}, 'a', { high: 0.5 }, 0)
    expect(levelsAt(geometrieOf(record, 'a'), 0).high).toBe(0.5)
    expect(geometrieOf(record, 'b')).toBe(SOBER)
    // Water on a sober account writes nothing.
    expect(dosed({}, 'a', { drunk: -0.1 }, 0)).toEqual({})
    // An account long faded is dropped on the next dose of anyone.
    record = dosed(record, 'b', { drunk: 0.2 }, 10_000)
    expect(Object.keys(record)).toEqual(['b'])
    expect(isSober(geometrieOf(record, 'b'), 10_000)).toBe(false)
    expect(sobered(record, 'b')).toEqual({})
  })

  it('checks levels off the wire', () => {
    expect(isLevels(SOBER_LEVELS)).toBe(true)
    expect(isLevels(FULL)).toBe(true)
    expect(isLevels({ ...FULL, high: 2 })).toBe(false)
    expect(isLevels({ high: 0, stimulated: 0 })).toBe(false)
    expect(isLevels(null)).toBe(false)
    expect(isLevels('high')).toBe(false)
  })
})
