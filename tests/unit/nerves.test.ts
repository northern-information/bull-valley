import { describe, expect, it } from 'vitest'
import { nervesIntensity, stepNerves } from '../../src/nerves.ts'

// nerves.ts is parked (unwired from main.ts) until the nerves meter returns;
// these tests keep it honest in the meantime.
describe('nerves', () => {
  it('decays toward calm when nothing is near', () => {
    const next = stepNerves(50, { dt: 1, pressure: 0 })
    expect(next).toBeLessThan(50)
  })

  it('climbs under pressure and clamps at 100', () => {
    let n = 20
    for (let i = 0; i < 60; i++) n = stepNerves(n, { dt: 1, pressure: 3 })
    expect(n).toBe(100)
  })

  it('never goes below zero', () => {
    expect(stepNerves(0.5, { dt: 10, pressure: 0 })).toBe(0)
  })

  it('drains fast while smoking', () => {
    const calm = stepNerves(80, { dt: 1, pressure: 0, smoking: true })
    const idle = stepNerves(80, { dt: 1, pressure: 0 })
    expect(calm).toBeLessThan(idle)
  })

  it('dulls the gain under perception (weed)', () => {
    const stoned = stepNerves(40, { dt: 1, pressure: 2, perception: true })
    const sober = stepNerves(40, { dt: 1, pressure: 2 })
    expect(stoned).toBeLessThan(sober)
  })

  it('eases intensity in from the bottom third', () => {
    expect(nervesIntensity(0)).toBe(0)
    expect(nervesIntensity(30)).toBe(0)
    expect(nervesIntensity(100)).toBeCloseTo(1, 5)
  })
})
