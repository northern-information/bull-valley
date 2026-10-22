import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../src/rng.ts'
import { BURST, burst, shardFaces, stepShards } from '../../src/tapfx.ts'

describe('tapfx', () => {
  it('throws a burst from the tap, splintered, at its speeds', () => {
    const shards = burst(100, 200, mulberry32(1))
    expect(shards.length).toBeGreaterThanOrEqual(BURST.count[0])
    expect(shards.length).toBeLessThanOrEqual(BURST.count[1])
    for (const s of shards) {
      expect([s.x, s.y, s.age]).toEqual([100, 200, 0])
      expect(s.size).toBeGreaterThanOrEqual(BURST.size[0])
      expect(s.life).toBeLessThanOrEqual(BURST.life[1])
      const speed = Math.hypot(s.vx, s.vy + BURST.lift)
      expect(speed).toBeGreaterThanOrEqual(BURST.speed[0] - 1e-9)
      expect(speed).toBeLessThanOrEqual(BURST.speed[1] + 1e-9)
      for (const k of s.stretch) {
        expect(k).toBeGreaterThanOrEqual(BURST.stretch[0])
        expect(k).toBeLessThanOrEqual(BURST.stretch[1])
      }
    }
  })

  it('moves, turns and pulls the shards down, and drops the dead', () => {
    const [s] = burst(0, 0, mulberry32(2))
    const [next] = stepShards([s], 0.016)
    expect(next.x).toBeCloseTo(next.vx * 0.016)
    expect(next.vy).toBeGreaterThan(s.vy * Math.exp(-BURST.drag * 0.016))
    expect(next.rx).toBeCloseTo(s.rx + s.wx * 0.016)
    expect(next.age).toBeCloseTo(0.016)
    expect(stepShards([s], s.life)).toEqual([])
  })

  it('draws the faces turned to the viewer, lit, snapped and fading', () => {
    const [s] = burst(50, 60, mulberry32(3))
    const faces = shardFaces(s)
    expect(faces.length).toBeGreaterThan(0)
    expect(faces.length).toBeLessThan(4)
    for (const face of faces) {
      expect(face.points).toHaveLength(3)
      for (const [x, y] of face.points) {
        expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true)
        const reach = s.size * BURST.stretch[1] + 1
        expect(Math.abs(x - 50)).toBeLessThanOrEqual(reach)
        expect(Math.abs(y - 60)).toBeLessThanOrEqual(reach)
      }
      expect(face.light).toBeGreaterThanOrEqual(0.2)
      expect(face.light).toBeLessThanOrEqual(1)
      expect(face.alpha).toBe(1)
    }
    const old = shardFaces({ ...s, age: s.life * 0.9 })
    expect(old[0].alpha).toBeLessThanOrEqual(0.25)
  })

  it('blinks as it dies, and fades in steps', () => {
    const [s] = burst(0, 0, mulberry32(5))
    const frame = 1 / BURST.blinkHz
    const late = s.life * 0.7
    const on = Math.floor(late * BURST.blinkHz) * frame + frame / 2
    const lit = shardFaces({ ...s, age: on })
    const dim = shardFaces({ ...s, age: on + frame })
    const pair = [lit[0]?.alpha ?? 0, dim[0]?.alpha ?? 0].sort()
    expect(pair[1]).toBeGreaterThan(pair[0] * 2)
    const early = shardFaces({ ...s, age: s.life * 0.2 })
    for (const face of early) {
      expect((face.alpha * BURST.bands) % 1).toBeCloseTo(0)
    }
  })

  it('always shows a tetrahedron one to three faces, whatever its turn', () => {
    const rng = mulberry32(4)
    for (let i = 0; i < 200; i++) {
      const [s] = burst(0, 0, rng)
      const n = shardFaces(s).length
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(3)
    }
  })
})
