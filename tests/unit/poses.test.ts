import { describe, expect, it } from 'vitest'
import { JOINTS, POSES, samplePose } from '../../src/poses.ts'
import type { PoseName } from '../../src/poses.ts'

describe('poses', () => {
  it('uses only known joints', () => {
    for (const pose of Object.values(POSES)) {
      for (const key of pose.keys) {
        for (const joint of Object.keys(key.joints)) {
          expect(JOINTS).toContain(joint)
        }
      }
    }
  })

  it('returns every joint, resting at zero when a pose leaves it out', () => {
    const { joints, lift } = samplePose('stand')
    expect(Object.keys(joints)).toEqual(JOINTS)
    expect(joints.neck).toEqual([0, 0, 0])
    expect(lift).toBe(0)
  })

  it('starts a cycle on its first key and loops', () => {
    const first = POSES.walk.keys[0]
    expect(samplePose('walk', 0).joints.hipL).toEqual(first.joints.hipL)
    expect(samplePose('walk', POSES.walk.seconds).joints.hipL).toEqual(
      first.joints.hipL
    )
    expect(samplePose('walk', -POSES.walk.seconds).joints.hipL).toEqual(
      first.joints.hipL
    )
  })

  it('interpolates between keys', () => {
    const quarter = POSES.walk.seconds / 4
    const a = POSES.walk.keys[0].joints.hipL[0]
    const b = POSES.walk.keys[1].joints.hipL[0]
    expect(samplePose('walk', quarter / 2).joints.hipL[0]).toBeCloseTo(
      (a + b) / 2,
      6
    )
  })

  it('reads with the head down and both hands raised to the book', () => {
    const { joints } = samplePose('read')
    const lean = samplePose('lean').joints
    // The head nods forward (a positive x rotation) toward the page.
    expect(joints.neck[0]).toBeGreaterThan(0.3)
    // Both forearms swing forward, as far as the lean's folded arms.
    expect(joints.elbowL[0]).toBeLessThan(-1.5)
    expect(joints.elbowR[0]).toBeLessThan(-1.5)
    // Mirrored across the body, over the lean's stance.
    expect(joints.shoulderL[2]).toBeCloseTo(-joints.shoulderR[2], 6)
    expect(joints.elbowL[2]).toBeCloseTo(-joints.elbowR[2], 6)
    expect(joints.hipR).toEqual(lean.hipR)
    expect(joints.kneeR).toEqual(lean.kneeR)
  })

  it('throws on an unknown pose', () => {
    // An id from outside the table, on purpose.
    expect(() => samplePose('moonwalk' as PoseName)).toThrow()
  })
})
