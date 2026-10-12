import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  isSettings,
  MUSIC_MAX,
  toSettings,
} from '../../src/settings.ts'

describe('isSettings', () => {
  it('takes a whole percent from 0 to the top', () => {
    expect(isSettings({ music: 0 })).toBe(true)
    expect(isSettings({ music: MUSIC_MAX })).toBe(true)
    expect(isSettings({ music: 35 })).toBe(true)
    expect(isSettings({ music: 35, sfx: 0 })).toBe(true)
    expect(isSettings({ music: 35, sfx: MUSIC_MAX })).toBe(true)
  })

  it('refuses anything else', () => {
    expect(isSettings(null)).toBe(false)
    expect(isSettings('loud')).toBe(false)
    expect(isSettings({})).toBe(false)
    expect(isSettings({ music: -1 })).toBe(false)
    expect(isSettings({ music: MUSIC_MAX + 1 })).toBe(false)
    expect(isSettings({ music: 12.5 })).toBe(false)
    expect(isSettings({ music: '50' })).toBe(false)
    expect(isSettings({ sfx: 50 })).toBe(false)
    expect(isSettings({ music: 50, sfx: 101 })).toBe(false)
    expect(isSettings({ music: 50, sfx: 'loud' })).toBe(false)
  })
})

describe('toSettings', () => {
  it('reads the defaults for what is missing or malformed', () => {
    expect(toSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(toSettings({})).toEqual(DEFAULT_SETTINGS)
    expect(toSettings({ music: 'loud' })).toEqual(DEFAULT_SETTINGS)
    expect(toSettings({ music: Number.NaN })).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps what it can, held to the slider', () => {
    const sfx = DEFAULT_SETTINGS.sfx
    expect(toSettings({ music: 70 })).toEqual({ music: 70, sfx })
    expect(toSettings({ music: 140 })).toEqual({ music: MUSIC_MAX, sfx })
    expect(toSettings({ music: -5 })).toEqual({ music: 0, sfx })
    expect(toSettings({ music: 42.6, extra: 1 })).toEqual({ music: 43, sfx })
    expect(toSettings({ music: 10, sfx: 55 })).toEqual({ music: 10, sfx: 55 })
  })

  it('starts the music quiet', () => {
    expect(DEFAULT_SETTINGS.music).toBeLessThan(MUSIC_MAX / 2)
  })
})
