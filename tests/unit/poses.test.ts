import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  blendPose,
  flashlightArm,
  heldPitch,
  JOINTS,
  POSES,
  RUN_STRIDE,
  runShare,
  samplePose,
  strideOf,
  stridePose,
  WALK_STRIDE,
} from '../../src/poses.ts'
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

  it('interpolates straight between the keys of a plain cycle', () => {
    const { keys, seconds } = POSES.dance
    const quarter = seconds / keys.length
    const a = keys[0].joints.shoulderL?.[0] ?? 0
    const b = keys[1].joints.shoulderL?.[0] ?? 0
    expect(samplePose('dance', quarter / 2).joints.shoulderL[0]).toBeCloseTo(
      (a + b) / 2,
      6
    )
  })

  it('passes through every key of a smooth cycle, easing between them', () => {
    const { keys, seconds } = POSES.walk
    keys.forEach((key, i) => {
      const at = samplePose('walk', (i / keys.length) * seconds)
      expect(at.joints.hipL[0]).toBeCloseTo(key.joints.hipL?.[0] ?? 0, 9)
      expect(at.lift).toBeCloseTo(key.lift, 9)
    })
    // Between two keys it moves on, never jumping.
    const step = seconds / 400
    for (let t = 0; t < seconds; t += step) {
      const a = samplePose('walk', t).joints.hipL[0]
      const b = samplePose('walk', t + step).joints.hipL[0]
      expect(Math.abs(b - a)).toBeLessThan(0.02)
    }
  })

  it('strides left then right, the same step mirrored', () => {
    for (const name of ['walk', 'run'] as const) {
      const { seconds } = POSES[name]
      const left = samplePose(name, 0.1 * seconds).joints
      const right = samplePose(name, 0.6 * seconds).joints
      expect(right.hipR[0]).toBeCloseTo(left.hipL[0], 9)
      expect(right.kneeL[0]).toBeCloseTo(left.kneeR[0], 9)
      expect(right.shoulderR[2]).toBeCloseTo(-left.shoulderL[2], 9)
      expect(right.pelvis[1]).toBeCloseTo(-left.pelvis[1], 9)
      expect(right.spine[1]).toBeCloseTo(-left.spine[1], 9)
    }
  })

  it('swings each arm against its own leg', () => {
    // Left heel down: the left leg reaches ahead, the right arm with it.
    const { joints } = samplePose('walk', 0)
    expect(joints.hipL[0]).toBeLessThan(-0.3)
    expect(joints.shoulderR[0]).toBeLessThan(-0.3)
    expect(joints.shoulderL[0]).toBeGreaterThan(0.3)
  })

  it('walks at a walk, runs at a sprint, and blends between', () => {
    const { walkSpeed, sprintSpeed } = CONFIG.player
    expect(runShare(walkSpeed)).toBe(0)
    expect(runShare(1)).toBe(0)
    expect(runShare(sprintSpeed)).toBe(1)
    expect(runShare(sprintSpeed * 2)).toBe(1)
    expect(strideOf(walkSpeed)).toBe(WALK_STRIDE)
    expect(strideOf(sprintSpeed)).toBe(RUN_STRIDE)
    expect(stridePose(0.3, walkSpeed)).toEqual(samplePose('walk', 0.3))
    expect(stridePose(0.3, sprintSpeed)).toEqual(samplePose('run', 0.3))
    const walk = samplePose('walk', 0.3).joints.spine[0]
    const run = samplePose('run', 0.3).joints.spine[0]
    const half = stridePose(0.3, (walkSpeed + sprintSpeed) / 2).joints.spine[0]
    expect(half).toBeCloseTo((walk + run) / 2, 9)
    // Sprinting leans further in than walking.
    expect(run).toBeGreaterThan(walk)
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

describe('heldPitch', () => {
  // Where the haft points, from the fist: the arm's pitch and the turn on
  // the forearm together; 0 hangs plumb, a negative swings it forward.
  const hangOf = (upperArm: number, elbow: number) =>
    upperArm + elbow + heldPitch(upperArm, elbow)

  it('hangs a little forward of plumb at rest, as it always has', () => {
    const { shoulderR, elbowR } = samplePose('stand').joints
    expect(heldPitch(shoulderR[0], elbowR[0])).toBeCloseTo(-0.18, 9)
  })

  it('keeps the head down however the arm is bent', () => {
    for (const name of ['walk', 'run', 'wave', 'dance', 'point'] as const) {
      const { seconds = 1 } = POSES[name] as { seconds?: number }
      for (let t = 0; t < seconds; t += seconds / 32) {
        const { pelvis, spine, shoulderR, elbowR } = samplePose(name, t).joints
        const hang = hangOf(pelvis[0] + spine[0] + shoulderR[0], elbowR[0])
        expect(Math.abs(hang)).toBeLessThan(Math.PI / 2)
      }
    }
  })

  it('trails the arm a little as it swings', () => {
    expect(hangOf(-0.8, -1.2)).toBeLessThan(hangOf(0, -0.12))
    expect(hangOf(0.5, -0.1)).toBeGreaterThan(hangOf(0, -0.12))
  })
})

describe('flashlightArm', () => {
  it('holds the left arm out ahead, raised with the pitch', () => {
    const level = flashlightArm()
    expect(Object.keys(level).sort()).toEqual(['elbowL', 'shoulderL'])
    expect(level.shoulderL?.[0]).toBeCloseTo(-1.3, 9)
    // Looking up swings it further forward and up.
    expect(flashlightArm(0.4).shoulderL?.[0]).toBeCloseTo(-1.7, 9)
  })

  it('blends two poses joint by joint', () => {
    const stand = samplePose('stand')
    const lunge = samplePose('shadow-lunge')
    expect(blendPose(stand, lunge, 0)).toEqual(stand)
    expect(blendPose(stand, lunge, 1)).toEqual(lunge)
    const half = blendPose(stand, lunge, 0.5)
    expect(half.lift).toBeCloseTo(lunge.lift / 2, 6)
    expect(half.joints.spine[0]).toBeCloseTo(lunge.joints.spine[0] / 2, 6)
  })

  it("rears a shadowman's arms up and back, then flings them ahead", () => {
    const windup = samplePose('shadow-windup').joints
    const lunge = samplePose('shadow-lunge').joints
    // Raised past straight up, then out ahead and down from there.
    expect(windup.shoulderL[0]).toBeLessThan(-2.4)
    expect(lunge.shoulderL[0]).toBeGreaterThan(windup.shoulderL[0])
    // Leaning back to wind up, thrown forward to lunge.
    expect(windup.spine[0]).toBeLessThan(0)
    expect(lunge.spine[0]).toBeGreaterThan(0.3)
  })
})
