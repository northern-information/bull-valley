import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  mayJarMoat,
  moatDrop,
  moatDropCount,
  moatSlurmsAt,
} from '../../src/moatslurms.ts'
import type { MoatSource } from '../../src/moatslurms.ts'

const cfg = CONFIG.slurms.moat
const FLOOR = -30
const landY = () => FLOOR
const SOURCES: MoatSource[] = [
  { x: 0, y: 0, z: 0, heading: { x: 1, z: 0 } },
  { x: 20, y: 0, z: 0, heading: { x: 0, z: 1 } },
  { x: 40, y: 0, z: 0, heading: { x: -1, z: 0 } },
  // A crane's hook, higher.
  { x: 10, y: 8, z: 10, heading: null },
]
const SLOTS = Array.from({ length: 500 }, (_, i) => 90_000_000 + i)

describe('moatDrop', () => {
  it('drops one to maxCount a slot, a little way into it', () => {
    const counts = new Set<number>()
    for (const slot of SLOTS) {
      const drop = moatDrop(slot, 3, 1)
      counts.add(drop.sources.length)
      expect(drop.sources.length).toBeGreaterThanOrEqual(1)
      expect(drop.sources.length).toBeLessThanOrEqual(cfg.maxCount)
      const into = drop.start - slot * cfg.slotSeconds
      expect(into).toBeGreaterThanOrEqual(0)
      expect(into).toBeLessThan(cfg.jitterSeconds)
      for (const s of drop.sources) {
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThan(4)
      }
    }
    expect(counts.size).toBeGreaterThan(1)
  })

  it('drops off the cranes about their share of the time', () => {
    let crane = 0
    let all = 0
    for (const slot of SLOTS) {
      for (const s of moatDrop(slot, 3, 1).sources) {
        all++
        if (s === 3) crane++
      }
    }
    expect(crane / all).toBeGreaterThan(cfg.craneShare - 0.1)
    expect(crane / all).toBeLessThan(cfg.craneShare + 0.1)
  })

  it('drops only off the edges with no crane, and only off one without edges', () => {
    for (const slot of SLOTS.slice(0, 50)) {
      expect(moatDrop(slot, 3, 0).sources.every((s) => s < 3)).toBe(true)
      expect(moatDrop(slot, 0, 2).sources.every((s) => s < 2)).toBe(true)
    }
  })
})

describe('moatSlurmsAt', () => {
  const slot = SLOTS[7]
  const drop = moatDrop(slot, 3, 1)
  const from = SOURCES[drop.sources[0]]
  const fall = Math.sqrt((2 * (from.y - FLOOR)) / CONFIG.slurms.gravity)
  const first = (t: number) =>
    moatSlurmsAt(SOURCES, 1, drop.start + t, landY).find(
      (s) => s.key === `${slot}:0`
    )

  it('is the same for everyone at the same moment', () => {
    const t = drop.start + 3
    expect(moatSlurmsAt(SOURCES, 1, t, landY)).toEqual(
      moatSlurmsAt(SOURCES, 1, t, landY)
    )
  })

  it('falls from its source to the floor', () => {
    const start = first(0.001)
    expect(start?.phase).toBe('falling')
    expect(start?.y).toBeCloseTo(from.y, 1)
    expect(start?.x).toBe(from.x)
    const mid = first(fall / 2)
    expect(mid?.phase).toBe('falling')
    expect(mid?.y).toBeLessThan(from.y)
    expect(mid?.y).toBeGreaterThan(FLOOR)
  })

  it('crawls off its heading, lies, melts and goes', () => {
    const down = first(fall + 0.5)
    expect(down?.phase).toBe('crawling')
    expect(down?.y).toBe(FLOOR)
    const crawled = first(fall + cfg.crawlSeconds + 1)
    const lying = first(fall + cfg.crawlSeconds + 5)
    expect(crawled?.phase).toBe('crawling')
    // Done crawling, it lies where it stopped.
    expect(lying?.x).toBeCloseTo(crawled?.x ?? NaN)
    expect(lying?.z).toBeCloseTo(crawled?.z ?? NaN)
    const went = Math.hypot(
      (crawled?.x ?? 0) - from.x,
      (crawled?.z ?? 0) - from.z
    )
    expect(went).toBeCloseTo(cfg.crawlSeconds * cfg.crawlSpeed)
    if (from.heading) {
      expect((crawled?.x ?? 0) - from.x).toBeCloseTo(from.heading.x * went)
    }
    const melting = first(fall + cfg.crawlSeconds + cfg.lingerSeconds + 1)
    expect(melting?.phase).toBe('squashed')
    expect(melting?.progress).toBeGreaterThan(0)
    expect(
      first(
        fall +
          cfg.crawlSeconds +
          cfg.lingerSeconds +
          CONFIG.slurms.splatSeconds +
          0.1
      )
    ).toBeUndefined()
  })

  it('draws no more at once than the pool holds', () => {
    let most = 0
    for (let t = 0; t < 2000; t += 0.5) {
      most = Math.max(
        most,
        moatSlurmsAt(SOURCES, 1, 1_800_000_000 + t, landY).length
      )
    }
    expect(most).toBeGreaterThan(0)
    expect(most).toBeLessThanOrEqual(cfg.pool)
  })

  it('has nothing to drop with no sources', () => {
    expect(moatSlurmsAt([], 0, 1000, landY)).toEqual([])
  })
})

describe('mayJarMoat', () => {
  it('counts each drop as moatDrop does, whatever the sources', () => {
    for (const slot of SLOTS) {
      const drop = moatDrop(slot, 3, 1)
      expect(moatDropCount(slot)).toEqual({
        start: drop.start,
        count: drop.sources.length,
      })
    }
  })

  it('takes every slurm down on the floor, and none melted or never dropped', () => {
    const t = 90_000_000 * cfg.slotSeconds + 500
    const down = moatSlurmsAt(SOURCES, 1, t, landY).filter(
      (s) => s.phase === 'crawling'
    )
    expect(down.length).toBeGreaterThan(0)
    for (const s of down) {
      expect(s.key).toBe(`${s.slot}:${s.index}`)
      expect(mayJarMoat(s.slot, s.index, t)).toBe(true)
      const melted = cfg.crawlSeconds + cfg.lingerSeconds + cfg.jarSlack + 2
      expect(mayJarMoat(s.slot, s.index, t + melted)).toBe(false)
    }
    const slot = 90_000_000
    expect(mayJarMoat(slot, cfg.maxCount, t)).toBe(false)
    expect(mayJarMoat(slot + 1000, 0, t)).toBe(false)
    expect(mayJarMoat(slot + 0.5, 0, t)).toBe(false)
    expect(mayJarMoat(slot, -1, t)).toBe(false)
  })
})
