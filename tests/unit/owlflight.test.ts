import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { huntAt, huntLength, huntOf, owlPose } from '../../src/owlflight.ts'
import type { GroundAt, Perch } from '../../src/owlflight.ts'

const O = CONFIG.castle.yard.jericho.owl
const perch: Perch = { x: 0.05, y: 2.3, z: -1.05, heading: 0.25 }
const flat: GroundAt = () => 0
const hilly: GroundAt = (x, z) => 0.3 * Math.sin(x / 5) + 0.2 * Math.cos(z / 7)

// The first rounds that hold a hunt, and one that holds none.
const rounds = Array.from({ length: 60 }, (_, k) => k)
const hunted = rounds.filter((k) => huntOf(k) !== null)
const quiet = rounds.find((k) => huntOf(k) === null)!
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z)

describe('huntOf', () => {
  it('hunts in about its share of rounds, the same each time asked', () => {
    expect(hunted.length / rounds.length).toBeGreaterThan(O.share - 0.2)
    expect(hunted.length / rounds.length).toBeLessThan(O.share + 0.2)
    expect(quiet).toBeDefined()
    expect(huntOf(hunted[0])).toEqual(huntOf(hunted[0]))
  })

  it('fits each hunt in its round, out in front of him', () => {
    for (const k of hunted) {
      const hunt = huntOf(k)!
      expect(hunt.start).toBeGreaterThanOrEqual(0)
      expect(hunt.start + huntLength()).toBeLessThanOrEqual(O.cycle)
      const d = Math.hypot(hunt.middle.x, hunt.middle.z)
      expect(d).toBeGreaterThanOrEqual(O.out.min)
      expect(d).toBeLessThanOrEqual(O.out.max)
      expect(
        Math.abs(Math.atan2(hunt.middle.z, hunt.middle.x))
      ).toBeLessThanOrEqual(O.swing)
      expect(dist(hunt.kill, hunt.middle)).toBeLessThanOrEqual(O.radius)
    }
  })
})

describe('owlPose', () => {
  it('sits on its perch, wings folded, through a round with no hunt', () => {
    for (let t = quiet * O.cycle; t < (quiet + 1) * O.cycle; t += 1.7) {
      expect(huntAt(t)).toBeNull()
      const pose = owlPose(t, perch, flat)
      expect(pose).toMatchObject({
        ...perch,
        phase: 'perched',
        spread: 0,
        pitch: 0,
      })
    }
  })

  it('rises, circles high, dives to the ground, sits its kill, and comes home', () => {
    const k = hunted[0]
    const hunt = huntOf(k)!
    const t0 = k * O.cycle + hunt.start
    const P = O.phases
    const at = (into: number) => owlPose(t0 + into, perch, hilly)

    expect(owlPose(t0 - 0.01, perch, hilly).phase).toBe('perched')
    expect(at(0.1).phase).toBe('rise')
    expect(at(0.1).spread).toBe(1)

    const circling = at(P.rise + P.circle / 2)
    expect(circling.phase).toBe('circle')
    expect(dist(circling, hunt.middle)).toBeCloseTo(O.radius, 5)
    expect(circling.y).toBeCloseTo(
      hilly(hunt.middle.x, hunt.middle.z) + O.height,
      5
    )

    const diving = at(P.rise + P.circle + P.dive * 0.8)
    expect(diving.phase).toBe('dive')
    expect(diving.pitch).toBeLessThan(0)

    // Down on something no one sees, on the ground itself.
    const kill = at(P.rise + P.circle + P.dive + P.kill / 2)
    expect(kill.phase).toBe('kill')
    expect(kill.x).toBeCloseTo(hunt.kill.x)
    expect(kill.z).toBeCloseTo(hunt.kill.z)
    expect(kill.y).toBeCloseTo(hilly(hunt.kill.x, hunt.kill.z))

    expect(at(huntLength() - 3).phase).toBe('home')
    // Landed as it sat, and the round goes on perched.
    const landed = at(huntLength() - 1e-3)
    expect(dist(landed, perch)).toBeLessThan(0.01)
    expect(landed.y).toBeCloseTo(perch.y, 2)
    expect(landed.heading).toBeCloseTo(perch.heading, 2)
    expect(at(huntLength() + 0.01).phase).toBe('perched')
  })

  it('flies without a jump, and never under the ground', () => {
    for (const k of hunted.slice(0, 8)) {
      const t0 = k * O.cycle + huntOf(k)!.start
      let last = owlPose(t0 - 0.05, perch, hilly)
      for (let into = 0; into <= huntLength() + 0.05; into += 0.05) {
        const pose = owlPose(t0 + into, perch, hilly)
        const step = Math.hypot(
          pose.x - last.x,
          pose.y - last.y,
          pose.z - last.z
        )
        // Its fastest, over the circle, is a lap of 2π·radius at `laps`.
        expect(step).toBeLessThan(0.05 * 12)
        expect(pose.y).toBeGreaterThanOrEqual(hilly(pose.x, pose.z) - 1e-6)
        last = pose
      }
    }
  })
})
