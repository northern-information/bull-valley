import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { MUSIC_URL, musicVolume } from '../../src/music.ts'

const tuning = { volume: 0.5, duck: 0.8, fadeInSeconds: 4 }
const frame = {
  setting: 100,
  radioGain: 0,
  radioVolume: 0.9,
  playedSeconds: 60,
}

describe('musicVolume', () => {
  it('scales the setting to the top of the tuning', () => {
    expect(musicVolume(frame, tuning)).toBeCloseTo(0.5)
    expect(musicVolume({ ...frame, setting: 40 }, tuning)).toBeCloseTo(0.2)
    expect(musicVolume({ ...frame, setting: 0 }, tuning)).toBe(0)
  })

  it('ducks under the radio, the most at its loudest', () => {
    const near = musicVolume({ ...frame, radioGain: 0.9 }, tuning)
    const far = musicVolume({ ...frame, radioGain: 0.45 }, tuning)
    expect(near).toBeCloseTo(0.5 * (1 - 0.8))
    expect(far).toBeCloseTo(0.5 * (1 - 0.4))
    expect(musicVolume({ ...frame, radioVolume: 0 }, tuning)).toBeCloseTo(0.5)
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

  it('plays quieter than the radio, from the asset host', () => {
    expect(CONFIG.music.volume).toBeLessThan(CONFIG.radio.volume)
    expect(MUSIC_URL.startsWith('https://assets.the-rn.info/')).toBe(true)
  })
})
