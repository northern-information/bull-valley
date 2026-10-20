import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  between,
  FRAMES_KEPT,
  GAP_MS,
  keepFrame,
  lerp,
} from '../../src/framebuffer.ts'

interface F {
  at: number
  x: number | null
}

const pickX = (f: F) => f.x

function run(...frames: [number, number | null][]): F[] {
  const kept: F[] = []
  for (const [at, x] of frames) keepFrame(kept, { at, x })
  return kept
}

describe('keepFrame', () => {
  it('keeps the newest FRAMES_KEPT, oldest first', () => {
    const kept: F[] = []
    for (let i = 0; i < FRAMES_KEPT + 5; i++) keepFrame(kept, { at: i, x: i })
    expect(kept).toHaveLength(FRAMES_KEPT)
    expect(kept[0].x).toBe(5)
    expect(kept.at(-1)?.x).toBe(FRAMES_KEPT + 4)
  })

  it('holds the last frame through a silence, one frame before the next', () => {
    const frameMs = 1000 / CONFIG.shadowmen.tickHz
    const kept = run([0, 0], [GAP_MS + 500, 10])
    expect(kept.map((f) => [f.at, f.x])).toEqual([
      [0, 0],
      [GAP_MS + 500 - frameMs, 0],
      [GAP_MS + 500, 10],
    ])
  })

  it("measures the silence in the stream's own frames", () => {
    const kept: F[] = []
    keepFrame(kept, { at: 0, x: 0 }, 400)
    keepFrame(kept, { at: 900, x: 1 }, 400)
    expect(kept).toHaveLength(2)
    keepFrame(kept, { at: 2001, x: 2 }, 400)
    expect(kept.map((f) => [f.at, f.x])).toEqual([
      [0, 0],
      [900, 1],
      [1601, 1],
      [2001, 2],
    ])
  })
})

describe('between', () => {
  it('is null with no frames, or none carrying the thing', () => {
    expect(between([], 0, pickX)).toBeNull()
    expect(between(run([0, null], [100, null]), 50, pickX)).toBeNull()
  })

  it('moves between the two frames either side, not just the newest two', () => {
    const kept = run([0, 0], [100, 10], [200, 20], [300, 30])
    expect(between(kept, 150, pickX)).toEqual({ from: 10, to: 20, t: 0.5 })
    expect(between(kept, 100, pickX)).toEqual({ from: 10, to: 20, t: 0 })
  })

  it('holds the oldest before the run and the newest past it', () => {
    const kept = run([100, 10], [200, 20])
    expect(between(kept, 0, pickX)).toEqual({ from: 10, to: 10, t: 0 })
    expect(between(kept, 900, pickX)).toEqual({ from: 20, to: 20, t: 0 })
  })

  it('holds a newcomer where it first shows until the drawing reaches it', () => {
    const kept = run([0, null], [100, null], [200, 40], [300, 50])
    expect(between(kept, 50, pickX)).toEqual({ from: 40, to: 40, t: 0 })
    expect(between(kept, 250, pickX)).toEqual({ from: 40, to: 50, t: 0.5 })
  })

  it('holds where it last stood when the frame after lacks it', () => {
    const kept = run([0, 5], [100, null], [200, 40])
    expect(between(kept, 50, pickX)).toEqual({ from: 5, to: 5, t: 0 })
  })

  it('takes the later of two frames landed at once', () => {
    const kept = run([100, 0], [100, 10])
    expect(between(kept, 100, pickX)).toEqual({ from: 10, to: 10, t: 0 })
  })
})

describe('lerp', () => {
  it('goes t of the way', () => {
    expect(lerp(2, 6, 0.25)).toBe(3)
  })
})
