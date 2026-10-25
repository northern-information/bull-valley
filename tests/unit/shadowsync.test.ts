import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  applyShadowFrame,
  barShown,
  barWidth,
  createShadowTable,
  drawnAt,
  sampleShadowmen,
  shadeHealth,
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
    expect(table.frames).toHaveLength(0)
    expect(sampleShadowmen(table, 0)).toEqual([])
    applyShadowFrame(table, [man(1, 5)], 100)
    expect(sampleShadowmen(table, 0)).toEqual([man(1, 5)])
    expect(sampleShadowmen(table, 500)).toEqual([man(1, 5)])
  })

  it('draws between the two frames either side, and holds outside them', () => {
    const table = createShadowTable()
    applyShadowFrame(table, [man(1, 0)], 100)
    applyShadowFrame(table, [man(1, 10, { burn: 0.5, target: 'a' })], 200)
    expect(sampleShadowmen(table, 150)).toEqual([
      man(1, 5, { burn: 0.25, target: 'a' }),
    ])
    expect(sampleShadowmen(table, 50)[0].x).toBe(0)
    expect(sampleShadowmen(table, 900)[0].x).toBe(10)
  })

  it('reaches back past the newest two frames', () => {
    const table = createShadowTable()
    applyShadowFrame(table, [man(1, 0)], 100)
    applyShadowFrame(table, [man(1, 10)], 200)
    applyShadowFrame(table, [man(1, 20)], 300)
    expect(sampleShadowmen(table, 150)[0].x).toBe(5)
  })

  it('holds a newcomer where it came in, and drops one that has gone', () => {
    const table = createShadowTable()
    applyShadowFrame(table, [man(1, 0), man(2, 0)], 100)
    applyShadowFrame(table, [man(2, 10), man(3, 40)], 200)
    applyShadowFrame(table, [man(2, 20), man(3, 50)], 300)
    expect(sampleShadowmen(table, 150)).toEqual([man(2, 5), man(3, 40)])
    expect(sampleShadowmen(table, 250)).toEqual([man(2, 15), man(3, 45)])
  })

  it('holds the newest when two frames land at once', () => {
    const table = createShadowTable()
    applyShadowFrame(table, [man(1, 0)], 100)
    applyShadowFrame(table, [man(1, 10)], 100)
    expect(sampleShadowmen(table, 100)).toEqual([man(1, 10)])
  })

  // The bug two frames had: drawn interpolateMs behind, the moment sat
  // before the older of the two, so each frame landing jumped the drawing
  // to a place it had already passed, or back.
  it('never moves the drawing back as frames land mid-draw', () => {
    const table = createShadowTable()
    const step = 1000 / CONFIG.shadowmen.tickHz
    // A shadowman walking 1 m a step, its frames landing a little early or
    // late, drawn every 16 ms.
    const jitter = [0, 30, -20, 10, 40, -30, 0, 20]
    let landed = 0
    let last = -Infinity
    let moved = 0
    for (let now = 0; now < 3000; now += 16) {
      while (landed * step + jitter[landed % jitter.length] <= now) {
        applyShadowFrame(table, [man(1, landed)], now)
        landed += 1
      }
      const drawn = sampleShadowmen(table, now - CONFIG.net.interpolateMs)
      const x = drawn[0]?.x ?? -Infinity
      expect(x).toBeGreaterThanOrEqual(last)
      if (x > last && last > -Infinity) moved += 1
      last = x
    }
    // And it glides, rather than holding and jumping once a frame.
    expect(moved).toBeGreaterThan(150)
  })
})

describe('height', () => {
  it('draws between the heights the valley sent, when it sent both', () => {
    const table = createShadowTable()
    applyShadowFrame(table, [man(1, 0, { y: 10 })], 0)
    applyShadowFrame(table, [man(1, 2, { y: 14 })], 100)
    expect(sampleShadowmen(table, 50)[0].y).toBeCloseTo(12)
    const flat = createShadowTable()
    applyShadowFrame(flat, [man(1, 0)], 0)
    applyShadowFrame(flat, [man(1, 2)], 100)
    expect(sampleShadowmen(flat, 50)[0].y).toBeUndefined()
  })

  it("stands one on the deck at the valley's height, or the highest", () => {
    // A fire escape's flight 12 m over a floor at 0.
    const groundAt = () => 12
    const standAt = (_x: number, _z: number, feet: number) =>
      feet + 2 >= 12 ? 12 : 0
    expect(drawnAt({ x: 0, z: 0, y: 0 }, groundAt, standAt)).toBe(0)
    expect(drawnAt({ x: 0, z: 0, y: 11 }, groundAt, standAt)).toBe(12)
    expect(drawnAt({ x: 0, z: 0 }, groundAt, standAt)).toBe(12)
    // A spider on a wall clings at the valley's height, on no deck.
    expect(drawnAt({ x: 0, z: 0, y: 7, wall: [0, 1] }, groundAt, standAt)).toBe(
      7
    )
  })
})

describe('health bars', () => {
  it('reads what a beam has not yet burned as what is left', () => {
    expect(shadeHealth(0)).toBe(1)
    expect(shadeHealth(0.25)).toBe(0.75)
    expect(shadeHealth(1)).toBe(0)
    expect(shadeHealth(1.4)).toBe(0)
    expect(shadeHealth(-0.2)).toBe(1)
  })

  it('counts the hits the Warden has taken, the beam on the next', () => {
    const { hits } = CONFIG.tunnel.warden
    expect(shadeHealth(0, 0, hits)).toBe(1)
    expect(shadeHealth(0, 1 / hits, hits)).toBeCloseTo(1 - 1 / hits)
    expect(shadeHealth(0.5, 1 / hits, hits)).toBeCloseTo(1 - 1.5 / hits)
    expect(shadeHealth(1, (hits - 1) / hits, hits)).toBeCloseTo(0)
  })

  it('shows a bar once hurt, to a raider near enough', () => {
    const { range } = CONFIG.healthBars
    expect(barShown(0.5, range)).toBe(true)
    expect(barShown(0.5, range + 1)).toBe(false)
    expect(barShown(1, 1)).toBe(false)
    expect(barShown(0, 1)).toBe(true)
  })

  it('sizes a bar to the body, within its bounds', () => {
    const { minWidth, maxWidth, perMetre } = CONFIG.healthBars
    expect(barWidth(3)).toBeCloseTo(3 * perMetre)
    expect(barWidth(0.1)).toBe(minWidth)
    expect(barWidth(100)).toBe(maxWidth)
  })
})
