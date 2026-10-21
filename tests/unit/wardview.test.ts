import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { CLEAR, isClear, wardView } from '../../src/wardview.ts'
import type { WardAxis } from '../../src/interfaces.ts'

const sober: Record<WardAxis, number> = {
  high: 0,
  stimulated: 0,
  drunk: 0,
  tripping: 0,
}
const at = (levels: Partial<Record<WardAxis, number>>) => ({
  ...sober,
  ...levels,
})
const { full, persistence, highTrails, saturation, sharpen } = CONFIG.wardView

describe('wardView', () => {
  it('leaves a sober view clear', () => {
    expect(wardView(sober, 0)).toEqual(CLEAR)
    expect(isClear(wardView(sober, 0))).toBe(true)
  })

  it('blurs at the moment of a use, sober or not', () => {
    const v = wardView(sober, 0.5)
    expect(v.blur).toBeCloseTo(0.5 * CONFIG.trip.blurRadius)
    expect(v.keep).toBe(0)
    expect(isClear(v)).toBe(false)
  })

  it('trails the drunk as hard as trails go, and nothing else', () => {
    const v = wardView(at({ drunk: full }), 0)
    expect(v).toEqual({ ...CLEAR, keep: persistence })
    expect(isClear(v)).toBe(false)
    // Drunker still is no harder.
    expect(wardView(at({ drunk: 1 }), 0).keep).toBe(persistence)
  })

  it('saturates the high, with a little of the trails', () => {
    const v = wardView(at({ high: full }), 0)
    expect(v.saturation).toBeCloseTo(saturation)
    expect(v.keep).toBeCloseTo(persistence * highTrails)
    expect(v.keep).toBeLessThan(persistence / 2)
    expect(v.sharpen).toBe(0)
    expect(v.blur).toBe(0)
  })

  it('sharpens the stimulated, and nothing else', () => {
    const v = wardView(at({ stimulated: full }), 0)
    expect(v).toEqual({ ...CLEAR, sharpen })
    expect(isClear(v)).toBe(false)
  })

  it('leaves the trip to its own sights', () => {
    expect(isClear(wardView(at({ tripping: 1 }), 0))).toBe(true)
  })

  it('scales each with its level, below full', () => {
    const half = wardView(
      at({ high: full / 2, stimulated: full / 2, drunk: full / 4 }),
      0
    )
    expect(half.saturation).toBeCloseTo(1 + (saturation - 1) / 2)
    expect(half.sharpen).toBeCloseTo(sharpen / 2)
    expect(half.keep).toBeCloseTo(persistence * (0.25 + highTrails / 2))
  })

  it('never trails past full, drunk and high together', () => {
    expect(wardView(at({ drunk: 1, high: 1 }), 0).keep).toBe(persistence)
  })

  it('reads as clear once every effect is too faint to see', () => {
    expect(isClear(wardView(at({ stimulated: 1e-6 }), 0))).toBe(true)
  })
})
