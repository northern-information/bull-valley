// Pure: the joints of the shared character body (figure.ts) and the poses
// that drive them. A pose maps joint names to [x, y, z] Euler rotations in
// radians, plus a lift (metres added to the root height, negative to
// crouch). Joints a pose leaves out rest at zero.
//
// Body space: the figure faces +Z, so its left side is +X. A negative x
// rotation swings a hanging limb forward; a positive x rotation bends a
// knee back.

import { CONFIG } from './config.ts'
import { clamp01 } from './math.ts'
import type { Vec3 } from './interfaces.ts'

export const JOINTS = [
  'pelvis',
  'spine',
  'neck',
  'shoulderL',
  'shoulderR',
  'elbowL',
  'elbowR',
  'hipL',
  'hipR',
  'kneeL',
  'kneeR',
] as const

export type JointName = (typeof JOINTS)[number]

// An Euler rotation [x, y, z] in radians.
export type Rotation = Vec3

export interface PoseKey {
  // Metres added to the root height; negative crouches.
  lift: number
  joints: Partial<Record<JointName, Rotation>>
}

export interface Pose {
  keys: PoseKey[]
  // Cycle length; only poses with more than one key loop.
  seconds?: number
  // A cycle that eases through its keys on a Catmull-Rom curve instead of
  // straight lines between them, so a limb never snaps at a key.
  smooth?: boolean
}

export type PoseName =
  | 'stand'
  | 'sit'
  | 'lean'
  | 'read'
  | 'crouch'
  | 'walk'
  | 'run'
  | 'hunch'
  | 'wield'
  | 'sprawl'
  // The emotes (emotes.ts).
  | 'wave'
  | 'rest'
  | 'smoke'
  | 'dance'
  | 'point'
  | 'shrug'
  | 'kneel'
  // A shadowman's strike (shadowmanmodel.ts).
  | 'shadow-windup'
  | 'shadow-lunge'

// A sampled pose: every joint present.
export interface PoseSample {
  lift: number
  joints: Record<JointName, Rotation>
}

const ARMS_DOWN: Partial<Record<JointName, Rotation>> = {
  shoulderL: [0, 0, 0.08],
  shoulderR: [0, 0, -0.08],
  elbowL: [-0.12, 0, 0],
  elbowR: [-0.12, 0, 0],
}

// The left arm held out ahead with the flashlight on, over any pose: the
// wield pose's sword arm, mirrored, raised or lowered with the raider's
// pitch (up positive) so the beam goes where they look. figure.ts
// applyJoints lays it on.
export function flashlightArm(pitch = 0): Partial<Record<JointName, Rotation>> {
  return {
    shoulderL: [-1.3 - pitch, 0, -0.05],
    elbowL: [-0.15, 0, 0],
  }
}

// The joints a stride mirrors, left for right.
const MIRROR: Record<JointName, JointName> = {
  pelvis: 'pelvis',
  spine: 'spine',
  neck: 'neck',
  shoulderL: 'shoulderR',
  shoulderR: 'shoulderL',
  elbowL: 'elbowR',
  elbowR: 'elbowL',
  hipL: 'hipR',
  hipR: 'hipL',
  kneeL: 'kneeR',
  kneeR: 'kneeL',
}

// A whole stride from its left step: the keys as given, then each again
// with left and right swapped and every turn and roll (y, z) reversed.
function stride(half: PoseKey[]): PoseKey[] {
  const mirrored = half.map((key) => {
    const joints: Partial<Record<JointName, Rotation>> = {}
    for (const joint of JOINTS) {
      const rotation = key.joints[joint]
      if (rotation) {
        joints[MIRROR[joint]] = [rotation[0], -rotation[1], -rotation[2]]
      }
    }
    return { lift: key.lift, joints }
  })
  return [...half, ...mirrored]
}

// The left step of the walk: the left heel strikes, takes the weight,
// carries the body over it while the right leg swings through, and
// pushes off as the right reaches ahead. The pelvis turns the left hip
// forward with the left leg (a negative y), the chest turns back against
// it so the right arm leads, and the neck turns the head back to the way
// it goes.
const WALK_HALF: PoseKey[] = [
  {
    lift: -0.005,
    joints: {
      pelvis: [0, -0.09, 0],
      spine: [0.06, 0.17, 0],
      neck: [-0.04, -0.08, 0],
      hipL: [-0.5, 0, 0.02],
      kneeL: [0.06, 0, 0],
      hipR: [0.38, 0, -0.02],
      kneeR: [0.3, 0, 0],
      shoulderL: [0.42, 0, 0.1],
      shoulderR: [-0.48, 0, -0.1],
      elbowL: [-0.12, 0, 0],
      elbowR: [-0.62, 0, 0],
    },
  },
  {
    lift: -0.03,
    joints: {
      pelvis: [0, -0.05, -0.04],
      spine: [0.08, 0.1, 0.03],
      neck: [-0.05, -0.05, 0],
      hipL: [-0.34, 0, 0.02],
      kneeL: [0.28, 0, 0],
      hipR: [0.22, 0, -0.02],
      kneeR: [0.62, 0, 0],
      shoulderL: [0.26, 0, 0.1],
      shoulderR: [-0.3, 0, -0.1],
      elbowL: [-0.2, 0, 0],
      elbowR: [-0.5, 0, 0],
    },
  },
  {
    lift: 0.035,
    joints: {
      pelvis: [0, 0, -0.05],
      spine: [0.05, 0, 0.04],
      neck: [-0.03, 0, 0],
      hipL: [-0.06, 0, 0.02],
      kneeL: [0.08, 0, 0],
      hipR: [-0.3, 0, -0.02],
      kneeR: [1.05, 0, 0],
      shoulderL: [0.02, 0, 0.09],
      shoulderR: [-0.04, 0, -0.09],
      elbowL: [-0.3, 0, 0],
      elbowR: [-0.32, 0, 0],
    },
  },
  {
    lift: 0.015,
    joints: {
      pelvis: [0, 0.06, -0.03],
      spine: [0.06, -0.11, 0.02],
      neck: [-0.04, 0.05, 0],
      hipL: [0.28, 0, 0.02],
      kneeL: [0.1, 0, 0],
      hipR: [-0.55, 0, -0.02],
      kneeR: [0.4, 0, 0],
      shoulderL: [-0.3, 0, 0.1],
      shoulderR: [0.3, 0, -0.1],
      elbowL: [-0.5, 0, 0],
      elbowR: [-0.2, 0, 0],
    },
  },
]

// The left step of the sprint: leaning well in, the arms pumping bent at
// the elbow, the left foot landing under the body with the knee soft,
// driving off it, and the body flying between steps while the right knee
// folds high and comes through.
const RUN_HALF: PoseKey[] = [
  {
    lift: -0.02,
    joints: {
      pelvis: [0, -0.12, 0],
      spine: [0.28, 0.22, 0],
      neck: [-0.22, -0.1, 0],
      hipL: [-0.72, 0, 0.03],
      kneeL: [0.32, 0, 0],
      hipR: [0.42, 0, -0.03],
      kneeR: [1.0, 0, 0],
      shoulderL: [0.75, 0, 0.14],
      shoulderR: [-0.85, 0, -0.14],
      elbowL: [-1.05, 0, 0],
      elbowR: [-1.55, 0, 0],
    },
  },
  {
    lift: -0.07,
    joints: {
      pelvis: [0, -0.04, -0.05],
      spine: [0.32, 0.08, 0.03],
      neck: [-0.26, -0.04, 0],
      hipL: [-0.3, 0, 0.03],
      kneeL: [0.62, 0, 0],
      hipR: [-0.15, 0, -0.03],
      kneeR: [1.85, 0, 0],
      shoulderL: [0.3, 0, 0.13],
      shoulderR: [-0.35, 0, -0.13],
      elbowL: [-1.3, 0, 0],
      elbowR: [-1.45, 0, 0],
    },
  },
  {
    lift: 0.02,
    joints: {
      pelvis: [0, 0.06, -0.03],
      spine: [0.3, -0.1, 0.02],
      neck: [-0.24, 0.05, 0],
      hipL: [0.38, 0, 0.03],
      kneeL: [0.25, 0, 0],
      hipR: [-0.9, 0, -0.03],
      kneeR: [1.5, 0, 0],
      shoulderL: [-0.55, 0, 0.14],
      shoulderR: [0.5, 0, -0.14],
      elbowL: [-1.5, 0, 0],
      elbowR: [-1.1, 0, 0],
    },
  },
  {
    lift: 0.08,
    joints: {
      pelvis: [0, 0.1, 0],
      spine: [0.28, -0.18, 0],
      neck: [-0.22, 0.08, 0],
      hipL: [0.5, 0, 0.03],
      kneeL: [0.9, 0, 0],
      hipR: [-0.85, 0, -0.03],
      kneeR: [0.75, 0, 0],
      shoulderL: [-0.8, 0, 0.14],
      shoulderR: [0.7, 0, -0.14],
      elbowL: [-1.55, 0, 0],
      elbowR: [-1.05, 0, 0],
    },
  },
]

// How far a prop hanging from the right fist (the bat, the axe) turns
// on the forearm (an x rotation) to hang head down: the arm's own pitch
// down to the shoulder (the pelvis, the spine and the shoulder summed)
// and the elbow's. Held still, it hangs a little forward of plumb, as
// it always has (HANG); as the arm swings it swings a share of the way
// with it (HANG_FOLLOW), so it trails the hand like a weight, but never
// turns over, however far the elbow bends.
const HANG = -0.3
const HANG_FOLLOW = 0.2
// The arm's pitch at rest (the stand pose's elbow), where it hangs at
// HANG exactly.
const ARM_REST = -0.12

export function heldPitch(upperArm: number, elbow: number): number {
  const arm = upperArm + elbow
  return HANG + HANG_FOLLOW * (arm - ARM_REST) - arm
}

// Each entry is a list of keys; a cycle spreads its keys evenly over
// `seconds` and loops.
export const POSES = {
  stand: { keys: [{ lift: 0, joints: { ...ARMS_DOWN } }] },
  // Driving: thighs forward, shins angled down to a low floor, hands on a
  // wheel.
  sit: {
    keys: [
      {
        lift: 0,
        joints: {
          hipL: [-1.5, 0, 0.04],
          hipR: [-1.5, 0, -0.04],
          kneeL: [1.0, 0, 0],
          kneeR: [1.0, 0, 0],
          shoulderL: [-0.95, 0, 0.12],
          shoulderR: [-0.95, 0, -0.12],
          elbowL: [-0.55, 0, 0],
          elbowR: [-0.55, 0, 0],
        },
      },
    ],
  },
  // Weight on one leg, arms folded.
  lean: {
    keys: [
      {
        lift: 0,
        joints: {
          pelvis: [0, 0, 0.05],
          spine: [0, 0, -0.07],
          hipL: [0, 0, -0.06],
          hipR: [-0.12, 0, -0.1],
          kneeR: [0.2, 0, 0],
          shoulderL: [-0.55, 0, -0.35],
          shoulderR: [-0.55, 0, 0.35],
          elbowL: [-1.7, 0, 0],
          elbowR: [-1.7, 0, 0],
        },
      },
    ],
  },
  // Reading: the lean's stance, the head down, both hands up in front of
  // the chest holding an open book (attachBook in figure.ts).
  read: {
    keys: [
      {
        lift: 0,
        joints: {
          pelvis: [0, 0, 0.05],
          spine: [0.1, 0, -0.07],
          neck: [0.55, 0, 0],
          hipL: [0, 0, -0.06],
          hipR: [-0.12, 0, -0.1],
          kneeR: [0.2, 0, 0],
          shoulderL: [-0.3, 0, -0.1],
          shoulderR: [-0.3, 0, 0.1],
          elbowL: [-1.65, 0, -0.2],
          elbowR: [-1.65, 0, 0.2],
        },
      },
    ],
  },
  crouch: {
    keys: [
      {
        lift: -0.45,
        joints: {
          spine: [0.35, 0, 0],
          hipL: [-1.25, 0, 0.08],
          hipR: [-1.25, 0, -0.08],
          kneeL: [1.9, 0, 0],
          kneeR: [1.9, 0, 0],
          ...ARMS_DOWN,
        },
      },
    ],
  },
  // Gron's stoop: bent at the back under his hump, the head craned up to
  // look ahead, knees soft, hands hanging forward of the hips.
  hunch: {
    keys: [
      {
        lift: -0.06,
        joints: {
          spine: [0.55, 0, 0],
          neck: [-0.5, 0, 0],
          hipL: [-0.18, 0, 0.04],
          hipR: [-0.18, 0, -0.04],
          kneeL: [0.32, 0, 0],
          kneeR: [0.32, 0, 0],
          shoulderL: [-0.3, 0, 0.12],
          shoulderR: [-0.3, 0, -0.12],
          elbowL: [-0.5, 0, 0],
          elbowR: [-0.5, 0, 0],
        },
      },
    ],
  },
  // Moab's stance: the left fist out at his side round the snath of a
  // scythe planted beside him, the right arm held straight out in front
  // with a scroll hanging from the fist for whoever stands there to read
  // (figure.ts buildMoab places both).
  wield: {
    keys: [
      {
        lift: 0,
        joints: {
          shoulderL: [-0.35, 0, 0.2],
          elbowL: [-1.05, 0, 0],
          shoulderR: [-1.3, 0, 0.05],
          elbowR: [-0.15, 0, 0],
        },
      },
    ],
  },
  // Struck down where they stood (corpses.ts): laid on the back
  // (corpsemeshes.ts), the arms flung out, one knee up, the head lolled.
  sprawl: {
    keys: [
      {
        lift: 0,
        joints: {
          neck: [0, 0.55, 0.1],
          shoulderL: [0.1, 0, 1.25],
          shoulderR: [-0.2, 0, -0.95],
          elbowL: [-0.35, 0, 0],
          elbowR: [-0.8, 0, 0],
          hipL: [-0.55, 0, 0.12],
          hipR: [0, 0, -0.18],
          kneeL: [1.1, 0, 0],
          kneeR: [0.1, 0, 0],
        },
      },
    ],
  },
  // The emotes (emotes.ts), each what a raider types to take it.
  // /wave: the right arm up high and out, the hand rocking side to side
  // over the head.
  wave: {
    seconds: 0.7,
    keys: [
      {
        lift: 0,
        joints: {
          ...ARMS_DOWN,
          neck: [0, 0, -0.05],
          shoulderR: [-2.75, 0, -0.35],
          elbowR: [-0.35, 0, 0.35],
        },
      },
      {
        lift: 0,
        joints: {
          ...ARMS_DOWN,
          neck: [0, 0, -0.05],
          shoulderR: [-2.75, 0, -0.05],
          elbowR: [-0.35, 0, -0.45],
        },
      },
    ],
  },
  // /sit: down on the ground, knees up, forearms resting on them.
  rest: {
    keys: [
      {
        lift: -0.86,
        joints: {
          spine: [-0.12, 0, 0],
          neck: [0.05, 0, 0],
          hipL: [-2.15, 0, 0.2],
          hipR: [-2.15, 0, -0.2],
          kneeL: [2.35, 0, 0],
          kneeR: [2.35, 0, 0],
          shoulderL: [-1.05, 0, 0.18],
          shoulderR: [-1.05, 0, -0.18],
          elbowL: [-0.35, 0, 0],
          elbowR: [-0.35, 0, 0],
        },
      },
    ],
  },
  // /smoke: weight on one leg, the left arm across the chest, the right
  // hand brought up to the mouth, held for a drag, and lowered again.
  smoke: {
    seconds: 4,
    keys: [
      {
        lift: 0,
        joints: {
          pelvis: [0, 0, 0.05],
          hipR: [-0.12, 0, -0.1],
          kneeR: [0.2, 0, 0],
          shoulderL: [-0.6, 0, -0.3],
          elbowL: [-1.7, 0, 0],
          shoulderR: [-1.15, 0, 0.45],
          elbowR: [-2.45, 0, 0],
          neck: [-0.12, 0, 0],
        },
      },
      {
        lift: 0,
        joints: {
          pelvis: [0, 0, 0.05],
          hipR: [-0.12, 0, -0.1],
          kneeR: [0.2, 0, 0],
          shoulderL: [-0.6, 0, -0.3],
          elbowL: [-1.7, 0, 0],
          shoulderR: [-1.15, 0, 0.45],
          elbowR: [-2.45, 0, 0],
          neck: [-0.22, 0, 0],
        },
      },
      {
        lift: 0,
        joints: {
          pelvis: [0, 0, 0.05],
          hipR: [-0.12, 0, -0.1],
          kneeR: [0.2, 0, 0],
          shoulderL: [-0.6, 0, -0.3],
          elbowL: [-1.7, 0, 0],
          shoulderR: [-0.35, 0, 0.1],
          elbowR: [-1.2, 0, 0],
        },
      },
      {
        lift: 0,
        joints: {
          pelvis: [0, 0, 0.05],
          hipR: [-0.12, 0, -0.1],
          kneeR: [0.2, 0, 0],
          shoulderL: [-0.6, 0, -0.3],
          elbowL: [-1.7, 0, 0],
          shoulderR: [-0.3, 0, 0.1],
          elbowR: [-1.25, 0, 0],
        },
      },
    ],
  },
  // /dance: a bounce on bent knees, hips swinging side to side, the arms
  // pumping up by turns.
  dance: {
    seconds: 1,
    keys: [
      {
        lift: -0.06,
        joints: {
          pelvis: [0, 0.25, 0.1],
          spine: [0, -0.2, -0.12],
          neck: [0, 0, 0.15],
          hipL: [-0.3, 0, 0.08],
          hipR: [-0.15, 0, -0.04],
          kneeL: [0.5, 0, 0],
          kneeR: [0.3, 0, 0],
          shoulderL: [-2.6, 0, 0.3],
          elbowL: [-0.4, 0, 0],
          shoulderR: [-0.5, 0, -0.5],
          elbowR: [-1.4, 0, 0],
        },
      },
      {
        lift: 0.02,
        joints: {
          ...ARMS_DOWN,
          hipL: [-0.1, 0, 0],
          hipR: [-0.1, 0, 0],
          kneeL: [0.15, 0, 0],
          kneeR: [0.15, 0, 0],
          shoulderL: [-1.2, 0, 0.5],
          shoulderR: [-1.2, 0, -0.5],
          elbowL: [-1.2, 0, 0],
          elbowR: [-1.2, 0, 0],
        },
      },
      {
        lift: -0.06,
        joints: {
          pelvis: [0, -0.25, -0.1],
          spine: [0, 0.2, 0.12],
          neck: [0, 0, -0.15],
          hipL: [-0.15, 0, 0.04],
          hipR: [-0.3, 0, -0.08],
          kneeL: [0.3, 0, 0],
          kneeR: [0.5, 0, 0],
          shoulderL: [-0.5, 0, 0.5],
          elbowL: [-1.4, 0, 0],
          shoulderR: [-2.6, 0, -0.3],
          elbowR: [-0.4, 0, 0],
        },
      },
      {
        lift: 0.02,
        joints: {
          ...ARMS_DOWN,
          hipL: [-0.1, 0, 0],
          hipR: [-0.1, 0, 0],
          kneeL: [0.15, 0, 0],
          kneeR: [0.15, 0, 0],
          shoulderL: [-1.2, 0, 0.5],
          shoulderR: [-1.2, 0, -0.5],
          elbowL: [-1.2, 0, 0],
          elbowR: [-1.2, 0, 0],
        },
      },
    ],
  },
  // /point: the right arm straight out ahead, the body leaning after it.
  point: {
    keys: [
      {
        lift: 0,
        joints: {
          ...ARMS_DOWN,
          spine: [0.06, 0.15, 0],
          neck: [-0.08, -0.12, 0],
          hipL: [0.12, 0, 0],
          hipR: [-0.2, 0, 0],
          shoulderR: [-1.55, 0, -0.08],
          elbowR: [-0.05, 0, 0],
        },
      },
    ],
  },
  // /shrug: the shoulders up, the elbows tucked and the forearms turned out
  // with the palms up, the head tipped.
  shrug: {
    keys: [
      {
        lift: 0.02,
        joints: {
          neck: [0.1, 0, 0.22],
          shoulderL: [-0.15, 0, 0.35],
          shoulderR: [-0.15, 0, -0.35],
          elbowL: [-1.45, 0, 0.6],
          elbowR: [-1.45, 0, -0.6],
        },
      },
    ],
  },
  // /kneel: down on the right knee, the left foot planted ahead, a hand
  // on the raised knee.
  kneel: {
    keys: [
      {
        lift: -0.48,
        joints: {
          spine: [0.12, 0, 0],
          hipL: [-1.5, 0, 0.06],
          kneeL: [1.5, 0, 0],
          hipR: [0.05, 0, -0.06],
          kneeR: [1.55, 0, 0],
          shoulderL: [-0.9, 0, 0.1],
          elbowL: [-0.6, 0, 0],
          shoulderR: [0, 0, -0.08],
          elbowR: [-0.12, 0, 0],
        },
      },
    ],
  },
  // The stride: contact, loading, passing and push-off on the left foot,
  // then the same on the right (stride below). The hips swing and the
  // stance knee takes the weight, the pelvis turns into the step and the
  // chest against it, the arms counter-swing bent at the elbow, and the
  // body dips at the load and rises over the passing foot.
  walk: { seconds: 1, smooth: true, keys: stride(WALK_HALF) },
  // The sprint: leaning in, elbows bent, the swing knee folded high, both
  // feet off the ground between steps.
  run: { seconds: 1, smooth: true, keys: stride(RUN_HALF) },
  // A shadowman winding up: reared back on its heels, the head thrown up,
  // both too-long arms raised high and drawn back over it, claws curled.
  'shadow-windup': {
    keys: [
      {
        lift: -0.08,
        joints: {
          spine: [-0.35, 0, 0],
          neck: [-0.35, 0, 0],
          shoulderL: [-2.7, 0, 0.35],
          shoulderR: [-2.7, 0, -0.35],
          elbowL: [-0.6, 0, 0],
          elbowR: [-0.6, 0, 0],
          hipL: [-0.35, 0, 0.06],
          hipR: [0.3, 0, -0.06],
          kneeL: [0.35, 0, 0],
          kneeR: [0.4, 0, 0],
        },
      },
    ],
  },
  // A shadowman lunging: thrown forward off the back foot, the head
  // craned at its raider, both arms flung straight out at them.
  'shadow-lunge': {
    keys: [
      {
        lift: -0.15,
        joints: {
          spine: [0.6, 0, 0],
          neck: [-0.45, 0, 0],
          shoulderL: [-2.0, 0, 0.18],
          shoulderR: [-2.0, 0, -0.18],
          elbowL: [-0.1, 0, 0],
          elbowR: [-0.1, 0, 0],
          hipL: [-0.95, 0, 0.04],
          hipR: [0.45, 0, -0.04],
          kneeL: [0.8, 0, 0],
          kneeR: [0.3, 0, 0],
        },
      },
    ],
  },
} satisfies Record<PoseName, Pose>

const ZERO: Rotation = [0, 0, 0]

function mix(a: Rotation, b: Rotation, t: number): Rotation {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

// The uniform Catmull-Rom curve through p1 at t = 0 and p2 at t = 1.
function spline(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (3 * p1 - p0 - 3 * p2 + p3) * t2 * t)
  )
}

function curve(
  p0: Rotation,
  p1: Rotation,
  p2: Rotation,
  p3: Rotation,
  t: number
): Rotation {
  return [
    spline(p0[0], p1[0], p2[0], p3[0], t),
    spline(p0[1], p1[1], p2[1], p3[1], t),
    spline(p0[2], p1[2], p2[2], p3[2], t),
  ]
}

// The pose `name` at time t seconds: { lift, joints } with every joint
// present. Cycles loop, straight from key to key or, smooth, on a curve
// through them.
export function samplePose(name: PoseName, t = 0): PoseSample {
  const pose: Pose | undefined = POSES[name]
  if (!pose) throw new Error(`Unknown pose: ${name}`)
  const { keys } = pose
  const n = keys.length
  let i = 0
  let f = 0
  if (n > 1) {
    // A cycle with no length never advances, as before (t / undefined is
    // NaN, which reads as phase 0 below).
    const phase = (((t / (pose.seconds ?? NaN)) % 1) + 1) % 1
    const pos = phase * n
    i = Math.floor(pos)
    f = pos - i
  }
  const at = (k: number) => keys[(((i + k) % n) + n) % n]
  const a = at(0)
  const b = at(1)
  const joints = {} as Record<JointName, Rotation> // filled for every joint below
  if (pose.smooth && n > 1) {
    const before = at(-1)
    const after = at(2)
    for (const joint of JOINTS) {
      joints[joint] = curve(
        before.joints[joint] || ZERO,
        a.joints[joint] || ZERO,
        b.joints[joint] || ZERO,
        after.joints[joint] || ZERO,
        f
      )
    }
    return {
      lift: spline(before.lift, a.lift, b.lift, after.lift, f),
      joints,
    }
  }
  for (const joint of JOINTS) {
    joints[joint] = mix(a.joints[joint] || ZERO, b.joints[joint] || ZERO, f)
  }
  return { lift: a.lift + (b.lift - a.lift) * f, joints }
}

// Metres covered by one whole stride (two steps), walking and sprinting.
export const WALK_STRIDE = 1.6
export const RUN_STRIDE = 2.8

// How far into the sprint a raider moving at speed (m/s) is, 0 to 1: at
// the walking speed the legs walk, at the sprint they run, and between
// them the two blend.
export function runShare(speed: number): number {
  const { walkSpeed, sprintSpeed } = CONFIG.player
  return clamp01((speed - walkSpeed) / (sprintSpeed - walkSpeed))
}

// Metres one stride covers at speed: longer the faster.
export function strideOf(speed: number): number {
  return WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * runShare(speed)
}

// The legs moving at speed, phase strides in (a stride is 1): the walk,
// the sprint, or between them at the same point of the stride, so a
// raider breaking into a run never skips a step.
export function stridePose(phase: number, speed: number): PoseSample {
  const walk = samplePose('walk', phase * POSES.walk.seconds)
  const share = runShare(speed)
  if (share <= 0) return walk
  const run = samplePose('run', phase * POSES.run.seconds)
  if (share >= 1) return run
  const joints = {} as Record<JointName, Rotation> // filled for every joint below
  for (const joint of JOINTS) {
    joints[joint] = mix(walk.joints[joint], run.joints[joint], share)
  }
  return { lift: walk.lift + (run.lift - walk.lift) * share, joints }
}

// Two sampled poses mixed: a at t 0, b at t 1.
export function blendPose(a: PoseSample, b: PoseSample, t: number): PoseSample {
  const joints = {} as Record<JointName, Rotation> // filled for every joint below
  for (const joint of JOINTS)
    joints[joint] = mix(a.joints[joint], b.joints[joint], t)
  return { lift: a.lift + (b.lift - a.lift) * t, joints }
}
