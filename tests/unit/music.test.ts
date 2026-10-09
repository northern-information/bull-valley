import { describe, expect, it } from 'vitest'
import { MUSIC_URL, musicVolume } from '../../src/music.ts'

const tuning = { volume: 0.5, fadeInSeconds: 4 }
const frame = {
  setting: 100,
  playedSeconds: 60,
}

describe('musicVolume', () => {
  it('scales the setting to the top of the tuning', () => {
    expect(musicVolume(frame, tuning)).toBeCloseTo(0.5)
    expect(musicVolume({ ...frame, setting: 40 }, tuning)).toBeCloseTo(0.2)
    expect(musicVolume({ ...frame, setting: 0 }, tuning)).toBe(0)
  })

  it('fades in from silence when it starts', () => {
    expect(musicVolume({ ...frame, playedSeconds: 0 }, tuning)).toBe(0)
    expect(musicVolume({ ...frame, playedSeconds: 2 }, tuning)).toBeCloseTo(
      0.25
    )
    expect(
      musicVolume(
        { ...frame, playedSeconds: 0 },
        { ...tuning, fadeInSeconds: 0 }
      )
    ).toBeCloseTo(0.5)
  })

  it('never leaves the element range', () => {
    expect(
      musicVolume({ ...frame, setting: 500 }, { ...tuning, volume: 3 })
    ).toBe(1)
    expect(musicVolume({ ...frame, setting: -20 }, tuning)).toBe(0)
  })

  it('plays from the asset host', () => {
    expect(MUSIC_URL.startsWith('https://assets.the-rn.info/')).toBe(true)
  })
})
