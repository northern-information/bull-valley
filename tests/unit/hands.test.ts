import { describe, expect, it } from 'vitest'
import {
  ease,
  HAND_DOWN,
  stepHand,
  useLift,
  useSeconds,
} from '../../src/hands.ts'
import type { HandsConfig } from '../../src/hands.ts'

// Pinned so the tests do not move when CONFIG.hands is retuned.
const CFG: HandsConfig = { raiseSeconds: 0.2, holdSeconds: 1 }

describe('stepHand', () => {
  it('raises a hand over raiseSeconds and holds it there', () => {
    let hand = { ...HAND_DOWN, up: true }
    hand = stepHand(hand, 0.1, CFG)
    expect(hand.lift).toBeCloseTo(0.5, 9)
    hand = stepHand(hand, 0.1, CFG)
    expect(hand.lift).toBeCloseTo(1, 9)
    hand = stepHand(hand, 5, CFG)
    expect(hand.lift).toBe(1)
  })

  it('lowers a hand from wherever it is and stops at rest', () => {
    let hand = { up: false, lift: 0.5 }
    hand = stepHand(hand, 0.05, CFG)
    expect(hand.lift).toBeCloseTo(0.25, 9)
    hand = stepHand(hand, 1, CFG)
    expect(hand).toEqual(HAND_DOWN)
  })
})

describe('useLift', () => {
  it('is down before the use and after it', () => {
    expect(useLift(10, 9, CFG)).toBe(0)
    expect(useLift(10, 10, CFG)).toBe(0)
    expect(useLift(10, 10 + useSeconds(CFG), CFG)).toBe(0)
    expect(useLift(10, 20, CFG)).toBe(0)
  })

  it('comes up, holds, and goes down', () => {
    expect(useLift(10, 10.1, CFG)).toBeCloseTo(0.5, 9)
    expect(useLift(10, 10.25, CFG)).toBe(1)
    expect(useLift(10, 11.1, CFG)).toBe(1)
    expect(useLift(10, 11.3, CFG)).toBeCloseTo(0.5, 9)
  })

  it('takes two raises and the hold, end to end', () => {
    expect(useSeconds(CFG)).toBeCloseTo(1.4, 9)
  })
})

describe('ease', () => {
  it('holds the ends and eases between them', () => {
    expect(ease(-1)).toBe(0)
    expect(ease(0)).toBe(0)
    expect(ease(0.5)).toBe(0.5)
    expect(ease(1)).toBe(1)
    expect(ease(2)).toBe(1)
    expect(ease(0.1)).toBeLessThan(0.1)
  })
})
