import { describe, expect, it } from 'vitest'
import { mulberry32, pick, range } from '../../src/rng.ts'

describe('rng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect(mulberry32(43)()).not.toBe(first[0])
  })

  it('stays in [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const n = rng()
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })

  it('scales range() into [lo, hi)', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 100; i++) {
      const n = range(rng, -4, 4)
      expect(n).toBeGreaterThanOrEqual(-4)
      expect(n).toBeLessThan(4)
    }
  })

  it('picks only from the array, and reaches every entry', () => {
    const rng = mulberry32(3)
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(pick(rng, ['a', 'b', 'c']))
    expect([...seen].sort()).toEqual(['a', 'b', 'c'])
  })
})
