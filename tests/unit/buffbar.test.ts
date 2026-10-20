import { describe, expect, it } from 'vitest'
import { activeBuffs, buffTime } from '../../src/buffbar.ts'
import { CONFIG } from '../../src/config.ts'
import { NO_EFFECTS } from '../../src/hotbar.ts'
import { ICON_SHAPES, iconSvg } from '../../src/icons.ts'

const SOBER = { high: 0, stimulated: 0, drunk: 0, tripping: 0 }
const fade = CONFIG.wards.fadePerSecond

describe('activeBuffs', () => {
  it('shows nothing sober, with nothing going', () => {
    expect(activeBuffs(SOBER, NO_EFFECTS, 10)).toEqual([])
    // A level too faint for the triangle to show is no buff.
    expect(activeBuffs({ ...SOBER, high: 0.004 }, NO_EFFECTS, 10)).toEqual([])
  })

  it('winds each level down to nothing at its own rate', () => {
    const buffs = activeBuffs(
      { high: 1, stimulated: 0.5, drunk: 0.25, tripping: 0.75 },
      NO_EFFECTS,
      0
    )
    expect(buffs).toEqual([
      { id: 'high', fraction: 1, seconds: Math.ceil(1 / fade.high) },
      {
        id: 'stimulated',
        fraction: 0.5,
        seconds: Math.ceil(0.5 / fade.stimulated),
      },
      { id: 'drunk', fraction: 0.25, seconds: Math.ceil(0.25 / fade.drunk) },
      {
        id: 'tripping',
        fraction: 0.75,
        seconds: Math.ceil(0.75 / fade.tripping),
      },
    ])
  })

  it('shows the joint’s perception for its span, after the wards', () => {
    const effects = { ...NO_EFFECTS, perception: { start: 10, end: 110 } }
    const buffs = activeBuffs({ ...SOBER, drunk: 0.5 }, effects, 35)
    expect(buffs.map(({ id }) => id)).toEqual(['drunk', 'perception'])
    expect(buffs[1]).toEqual({ id: 'perception', fraction: 0.75, seconds: 75 })
    expect(activeBuffs(SOBER, effects, 110)).toEqual([])
  })

  it('skips a level with no fade to wind it down, or no level at all', () => {
    expect(
      activeBuffs({ ...SOBER, high: 0.5 }, NO_EFFECTS, 0, {
        ...fade,
        high: 0,
      })
    ).toEqual([])
    expect(activeBuffs({ ...SOBER, high: NaN }, NO_EFFECTS, 0, fade)).toEqual(
      []
    )
  })
})

describe('buffTime', () => {
  it('reads minutes from a minute up, then seconds', () => {
    expect(buffTime(240)).toBe('4m')
    expect(buffTime(61)).toBe('2m')
    expect(buffTime(60)).toBe('1m')
    expect(buffTime(59)).toBe('59s')
    expect(buffTime(1)).toBe('1s')
  })
})

describe('icons', () => {
  it('draws a mark for every buff, each a whole SVG in its box', () => {
    for (const id of [
      'high',
      'stimulated',
      'drunk',
      'tripping',
      'perception',
    ] as const) {
      expect(ICON_SHAPES[id].length).toBeGreaterThan(0)
      const svg = iconSvg(id)
      expect(svg).toMatch(/^<svg class="bv-icon" viewBox="0 0 24 24"/)
      expect(svg).toContain(ICON_SHAPES[id])
    }
    expect(iconSvg('drunk', 'x')).toMatch(/^<svg class="x"/)
  })
})
