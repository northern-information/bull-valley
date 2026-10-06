import { describe, expect, it } from 'vitest'
import {
  applyShadowFrame,
  createShadowTable,
  sampleShadowmen,
} from '../../src/shadowsync.ts'
import type { ShadowmanWire } from '../../src/protocol.ts'

const man = (id: number, x: number, over: Partial<ShadowmanWire> = {}) => ({
  id,
  x,
  z: 0,
  burn: 0,
  target: null,
  ...over,
})

describe('sampleShadowmen', () => {
  it('draws nothing before the first frame, and holds the only one', () => {
    const table = createShadowTable()
    expect(sampleShadowmen(table, 0)).toEqual([])
    applyShadowFrame(table, [man(1, 5)], 100)
    expect(sampleShadowmen(table, 0)).toEqual([man(1, 5)])
    expect(sampleShadowmen(table, 500)).toEqual([man(1, 5)])
  })

  it('draws between the last two frames, and holds outside them', () => {
    const table = createShadowTable()
    applyShadowFrame(table, [man(1, 0)], 100)
    applyShadowFrame(table, [man(1, 10, { burn: 0.5, target: 'a' })], 200)
    expect(sampleShadowmen(table, 150)).toEqual([
      man(1, 5, { burn: 0.25, target: 'a' }),
    ])
    expect(sampleShadowmen(table, 50)[0].x).toBe(0)
    expect(sampleShadowmen(table, 900)[0].x).toBe(10)
  })

  it('shows a newcomer where it is, and drops one that has gone', () => {
    const table = createShadowTable()
    applyShadowFrame(table, [man(1, 0), man(2, 0)], 100)
    applyShadowFrame(table, [man(2, 10), man(3, 40)], 200)
    expect(sampleShadowmen(table, 150)).toEqual([man(2, 5), man(3, 40)])
  })

  it('holds the newest when two frames land at once', () => {
    const table = createShadowTable()
    applyShadowFrame(table, [man(1, 0)], 100)
    applyShadowFrame(table, [man(1, 10)], 100)
    expect(sampleShadowmen(table, 100)).toEqual([man(1, 10)])
  })
})
