import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  clodsDue,
  inField,
  rearWheels,
  stepClods,
  throwClod,
  tracksAlong,
} from '../../src/donutwake.ts'
import { mulberry32 } from '../../src/rng.ts'
import type { Clod } from '../../src/donutwake.ts'

const spray = CONFIG.truck.donuts.spray
const flat = () => 0

describe('rearWheels', () => {
  it('stands the rear wheels behind the middle', () => {
    const [a, b] = rearWheels(10, 20, 0)
    expect(a).toEqual({ x: 10.85, z: 18.3 })
    expect(b).toEqual({ x: 9.15, z: 18.3 })
  })

  it('turns with the truck', () => {
    // Facing +x, behind is -x.
    const wheels = rearWheels(0, 0, Math.PI / 2)
    for (const w of wheels) expect(w.x).toBeCloseTo(-1.7)
    expect(wheels.map((w) => w.z).sort()).toEqual(
      [-0.85, 0.85].map((z) => expect.closeTo(z) as number)
    )
  })
})

describe('tracksAlong', () => {
  const line = [
    { x: 0, z: 0 },
    { x: 0, z: 4 },
    { x: 4, z: 4 },
  ]

  it('samples the route every step up to the metres covered', () => {
    const tracks = tracksAlong(line, 0, 3, 1)
    expect(tracks.map((t) => t.z)).toEqual([0, 1, 2, 3])
    for (const t of tracks) expect(t.heading).toBe(0)
  })

  it('ends exactly at the metres covered, round a corner', () => {
    const tracks = tracksAlong(line, 0, 5.5, 2)
    const end = tracks[tracks.length - 1]
    expect(end.x).toBeCloseTo(1.5)
    expect(end.z).toBeCloseTo(4)
    expect(end.heading).toBeCloseTo(Math.PI / 2)
  })

  it('picks up where the last frame left off', () => {
    const tracks = tracksAlong(line, 4.5, 6, 1)
    expect(tracks.map((t) => t.x)).toEqual([0.5, 1.5, 2])
    for (const t of tracks) expect(t.z).toBe(4)
    expect(tracksAlong(line, 3, 3, 1)).toEqual([{ x: 0, z: 3, heading: 0 }])
  })

  it('stops at the end of a route shorter than the metres', () => {
    const tracks = tracksAlong(line, 0, 100, 1)
    expect(tracks[tracks.length - 1]).toMatchObject({ x: 4, z: 4 })
  })

  it('skips a point repeated', () => {
    const tracks = tracksAlong([line[0], line[0], line[1]], 0, 2, 1)
    expect(tracks.map((t) => t.z)).toEqual([0, 1, 2])
  })
})

describe('clodsDue', () => {
  it('throws more the faster the truck goes, none standing', () => {
    const rng = mulberry32(1)
    expect(clodsDue(1, 0, 9, spray, rng)).toBe(0)
    expect(clodsDue(1, 9, 9, spray, rng)).toBe(spray.perSecond)
    expect(clodsDue(1, 4.5, 0, spray, rng)).toBe(0)
  })

  it('throws as many a second at any frame rate', () => {
    const rng = mulberry32(2)
    let n = 0
    for (let i = 0; i < 600; i++) n += clodsDue(1 / 60, 9, 9, spray, rng)
    expect(n).toBeGreaterThan(spray.perSecond * 10 * 0.9)
    expect(n).toBeLessThan(spray.perSecond * 10 * 1.1)
  })
})

describe('a clod', () => {
  it('flies back off the tyre and up', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 50; i++) {
      const clod = throwClod({ x: 0, z: 0 }, 2, 0, spray, rng)
      expect(clod.vz).toBeLessThan(0)
      expect(clod.vy).toBeGreaterThan(0)
      expect(clod.y).toBeGreaterThan(2)
    }
  })

  it('falls, lands and lies, then is gone', () => {
    const clods: Clod[] = [
      throwClod({ x: 0, z: 0 }, 0, 0, spray, mulberry32(4)),
    ]
    const clod = clods[0]
    let peak = 0
    for (let t = 0; t < 2 && !clod.landed; t += 1 / 60) {
      stepClods(clods, 1 / 60, flat, spray)
      peak = Math.max(peak, clod.y)
    }
    expect(peak).toBeGreaterThan(0.3)
    expect(clod.landed).toBe(true)
    expect(clod.y).toBe(0)
    const { x, z } = clod
    stepClods(clods, 0.01, flat, spray)
    expect(clod).toMatchObject({ x, z, y: 0 })
    stepClods(clods, spray.life, flat, spray)
    expect(clods).toEqual([])
  })

  it('never keeps more than the most, the oldest going first', () => {
    const rng = mulberry32(5)
    const clods: Clod[] = []
    for (let i = 0; i < spray.max + 10; i++) {
      const clod = throwClod({ x: 0, z: 0 }, 0, 0, spray, rng)
      clod.age = (spray.max + 10 - i) * 1e-4
      clods.push(clod)
    }
    const youngest = clods[clods.length - 1]
    stepClods(clods, 0, flat, spray)
    expect(clods).toHaveLength(spray.max)
    expect(clods[clods.length - 1]).toBe(youngest)
  })
})

describe('inField', () => {
  it('tears only the grass of the field', () => {
    const field = { x: 0, z: 0, radius: 10 }
    expect(inField(field, { x: 6, z: 8 })).toBe(true)
    expect(inField(field, { x: 8, z: 8 })).toBe(false)
  })
})
