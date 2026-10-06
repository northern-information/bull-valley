import { describe, expect, it } from 'vitest'
import { stepIndex } from '../../src/cycle.ts'

describe('stepIndex', () => {
  it('wraps both ways', () => {
    expect(stepIndex(2, 3, 1)).toBe(0)
    expect(stepIndex(0, 3, -1)).toBe(2)
    expect(stepIndex(1, 3, 1)).toBe(2)
  })

  it('stays at 0 on an empty list', () => {
    expect(stepIndex(0, 0, 1)).toBe(0)
  })
})
