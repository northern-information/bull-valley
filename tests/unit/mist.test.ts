import { describe, expect, it } from 'vitest'
import {
  bankOpacity,
  createMist,
  stepMist,
  wrapOffset,
} from '../../src/mist.ts'
import { mulberry32 } from '../../src/rng.ts'
import type { XZ } from '../../src/interfaces.ts'
import type { MistBank, MistConfig, MistField } from '../../src/mist.ts'

// Pinned so the tests do not move when CONFIG.mist is retuned.
const CFG: MistConfig = {
  count: 20,
  radius: 100,
  wind: { x: 1, z: -0.5 },
  drift: 0.25,
  widthMin: 10,
  widthMax: 24,
  aspect: 0.22,
  lift: 0.3,
  periodMin: 14,
  periodMax: 36,
  opacity: 0.4,
  nearFade: 8,
  edgeFade: 20,
  looks: 4,
}
const ORIGIN: XZ = { x: 0, z: 0 }
const DT = 0.05

const bank = (over: Partial<MistBank> = {}): MistBank => ({
  x: 0,
  z: -50,
  width: 16,
  phase: Math.PI / 2,
  period: 20,
  driftX: 0,
  driftZ: 0,
  look: 0,
  ...over,
})

const inBubble = (field: MistField, player: XZ) =>
  field.banks.every(
    (b) =>
      Math.abs(b.x - player.x) <= CFG.radius &&
      Math.abs(b.z - player.z) <= CFG.radius
  )

describe('wrapOffset', () => {
  it('leaves an offset inside the bubble alone', () => {
    expect(wrapOffset(30, 100)).toBe(30)
    expect(wrapOffset(-99, 100)).toBe(-99)
  })

  it('folds an offset past either edge to the far side', () => {
    expect(wrapOffset(101, 100)).toBe(-99)
    expect(wrapOffset(-101, 100)).toBe(99)
    expect(wrapOffset(100, 100)).toBe(-100)
  })

  it('folds an offset many bubbles away', () => {
    expect(wrapOffset(1030, 100)).toBe(30)
    expect(wrapOffset(-1030, 100)).toBe(-30)
  })
})

describe('createMist', () => {
  it('fills every slot inside the bubble around the player', () => {
    const player = { x: 500, z: -700 }
    const field = createMist(mulberry32(1), player, CFG)
    expect(field.banks).toHaveLength(CFG.count)
    expect(inBubble(field, player)).toBe(true)
  })

  it('draws every bank within the configured ranges', () => {
    const field = createMist(mulberry32(2), ORIGIN, CFG)
    for (const b of field.banks) {
      expect(b.width).toBeGreaterThanOrEqual(CFG.widthMin)
      expect(b.width).toBeLessThanOrEqual(CFG.widthMax)
      expect(b.period).toBeGreaterThanOrEqual(CFG.periodMin)
      expect(b.period).toBeLessThanOrEqual(CFG.periodMax)
      expect(Math.abs(b.driftX)).toBeLessThanOrEqual(CFG.drift)
      expect(Math.abs(b.driftZ)).toBeLessThanOrEqual(CFG.drift)
      expect(b.phase).toBeGreaterThanOrEqual(0)
      expect(b.phase).toBeLessThan(Math.PI * 2)
      expect(Number.isInteger(b.look)).toBe(true)
      expect(b.look).toBeGreaterThanOrEqual(0)
      expect(b.look).toBeLessThan(CFG.looks)
    }
  })

  it('is the same field for the same seed', () => {
    const a = createMist(mulberry32(7), ORIGIN, CFG)
    const b = createMist(mulberry32(7), ORIGIN, CFG)
    expect(a).toEqual(b)
  })
})

describe('stepMist', () => {
  it('drifts a bank on the wind plus its own drift', () => {
    const field = { banks: [bank({ driftX: 0.5, driftZ: 0.5 })] }
    stepMist(field, { dt: 1, player: ORIGIN, still: false }, CFG)
    expect(field.banks[0].x).toBeCloseTo(1.5, 9)
    expect(field.banks[0].z).toBeCloseTo(-50, 9)
  })

  it('advances the swell once around per period', () => {
    const field = { banks: [bank({ phase: 0, period: 20 })] }
    stepMist(field, { dt: 5, player: ORIGIN, still: false }, CFG)
    expect(field.banks[0].phase).toBeCloseTo(Math.PI / 2, 9)
    stepMist(field, { dt: 15, player: ORIGIN, still: false }, CFG)
    expect(field.banks[0].phase).toBeCloseTo(0, 9)
  })

  it('wraps a bank that leaves the bubble to the far side', () => {
    const field = { banks: [bank({ x: 99.9, z: 0 })] }
    stepMist(field, { dt: 1, player: ORIGIN, still: false }, CFG)
    expect(field.banks[0].x).toBeCloseTo(-99.1, 9)
  })

  it('keeps every bank in the bubble through a long walk on the wind', () => {
    const field = createMist(mulberry32(3), ORIGIN, CFG)
    const player = { x: 0, z: 0 }
    for (let i = 0; i < 4000; i++) {
      player.x += 2 * DT
      player.z -= 1.5 * DT
      stepMist(field, { dt: DT, player, still: false }, CFG)
      expect(inBubble(field, player)).toBe(true)
    }
  })

  it('follows a teleport in a single step', () => {
    const field = createMist(mulberry32(4), ORIGIN, CFG)
    const far = { x: 3000, z: -2500 }
    stepMist(field, { dt: DT, player: far, still: false }, CFG)
    expect(inBubble(field, far)).toBe(true)
  })

  it('holds still under reduced motion, wrapping only', () => {
    const before = bank({ x: 20, z: -50, driftX: 0.5 })
    const field = { banks: [{ ...before }] }
    stepMist(field, { dt: 1, player: ORIGIN, still: true }, CFG)
    expect(field.banks[0]).toEqual(before)
    stepMist(field, { dt: 1, player: { x: 150, z: 0 }, still: true }, CFG)
    expect(field.banks[0].x).toBe(220)
    expect(field.banks[0].phase).toBe(before.phase)
  })
})

describe('bankOpacity', () => {
  it('peaks at the top of the swell, well inside the bubble', () => {
    expect(bankOpacity(bank({ phase: Math.PI / 2 }), ORIGIN, CFG)).toBeCloseTo(
      CFG.opacity,
      9
    )
  })

  it('thins to a floor at the bottom of the swell, never to nothing', () => {
    const low = bankOpacity(bank({ phase: -Math.PI / 2 }), ORIGIN, CFG)
    expect(low).toBeCloseTo(CFG.opacity * 0.3, 9)
    expect(low).toBeGreaterThan(0)
  })

  it('dissolves as the player walks into it', () => {
    expect(bankOpacity(bank({ x: 0, z: 0 }), ORIGIN, CFG)).toBe(0)
    expect(bankOpacity(bank({ x: 0, z: -4 }), ORIGIN, CFG)).toBeCloseTo(
      CFG.opacity / 2,
      9
    )
    expect(bankOpacity(bank({ x: 0, z: -8 }), ORIGIN, CFG)).toBeCloseTo(
      CFG.opacity,
      9
    )
  })

  it('thins to nothing at the edge of the bubble', () => {
    expect(bankOpacity(bank({ x: 100, z: 0 }), ORIGIN, CFG)).toBe(0)
    expect(bankOpacity(bank({ x: 0, z: -90 }), ORIGIN, CFG)).toBeCloseTo(
      CFG.opacity / 2,
      9
    )
    expect(bankOpacity(bank({ x: 0, z: -80 }), ORIGIN, CFG)).toBeCloseTo(
      CFG.opacity,
      9
    )
  })
})
