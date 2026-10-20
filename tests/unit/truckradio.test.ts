import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { RADIO_URL, radioMix, radioOffset } from '../../src/truckradio.ts'

const tuning = CONFIG.truck.radio
const at = (distance: number, aboard = false, setting = 100) =>
  radioMix({ distance, aboard, setting }, tuning)

describe('radioMix', () => {
  it('plays the song as cut in the bed', () => {
    expect(at(0, true)).toEqual({ gain: tuning.volume, cutoff: null })
    expect(at(500, true).cutoff).toBeNull()
    expect(at(0, true, 50).gain).toBeCloseTo(tuning.volume / 2)
  })

  it('is loud and open by the cab', () => {
    const mix = at(tuning.near)
    expect(mix.gain).toBeCloseTo(tuning.volume)
    expect(mix.cutoff).toBeCloseTo(tuning.openHz)
  })

  it('fades and loses its highs with the distance', () => {
    const near = at(10)
    const mid = at(30)
    expect(mid.gain).toBeLessThan(near.gain)
    expect(mid.cutoff!).toBeLessThan(near.cutoff!)
  })

  it('carries only the lows from the Citgo to the donut field', () => {
    const mix = at(60)
    expect(mix.cutoff).toBeCloseTo(tuning.floorHz)
    expect(mix.gain).toBeGreaterThan(0)
    expect(mix.gain).toBeLessThan(tuning.volume / 4)
  })

  it('is out of hearing past its range', () => {
    expect(at(tuning.hearing).gain).toBe(0)
    expect(at(tuning.hearing + 100).gain).toBe(0)
    expect(at(tuning.hearing - tuning.fade / 2).gain).toBeGreaterThan(0)
    const hard = { ...tuning, fade: 0 }
    expect(
      radioMix({ distance: hard.hearing, aboard: false, setting: 100 }, hard)
        .gain
    ).toBeGreaterThan(0)
    expect(
      radioMix(
        { distance: hard.hearing + 1, aboard: false, setting: 100 },
        hard
      ).gain
    ).toBe(0)
  })

  it('follows the music setting', () => {
    expect(at(0, false, 0).gain).toBe(0)
    expect(at(20, false, 50).gain).toBeCloseTo(at(20).gain / 2)
  })
})

describe('radioOffset', () => {
  it('picks the song up where the engine has played it, looped', () => {
    expect(radioOffset(12, 50)).toBe(12)
    expect(radioOffset(112, 50)).toBe(12)
    expect(radioOffset(-3, 50)).toBe(0)
    expect(radioOffset(12, 0)).toBe(0)
  })

  it('streams from the asset host', () => {
    expect(RADIO_URL.startsWith('https://assets.the-rn.info/')).toBe(true)
  })
})
