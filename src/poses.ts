// Pure: the joints of the shared character body (figure.ts) and the poses
// that drive them. A pose maps joint names to [x, y, z] Euler rotations in
// radians, plus a lift (metres added to the root height, negative to
// crouch). Joints a pose leaves out rest at zero.
//
// Body space: the figure faces +Z, so its left side is +X. A negative x
// rotation swings a hanging limb forward; a positive x rotation bends a
// knee back.

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
}

export type PoseName =
  | 'stand'
  | 'sit'
  | 'lean'
  | 'read'
  | 'crouch'
  | 'walk'
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
  // Contact, passing, contact, passing.
  walk: {
    seconds: 1,
    keys: [
      {
        lift: 0,
        joints: {
          hipL: [-0.45, 0, 0],
          hipR: [0.35, 0, 0],
          kneeR: [0.25, 0, 0],
          shoulderL: [0.35, 0, 0.08],
          shoulderR: [-0.35, 0, -0.08],
          elbowL: [-0.15, 0, 0],
          elbowR: [-0.45, 0, 0],
        },
      },
      {
        lift: 0.03,
        joints: {
          hipL: [0.05, 0, 0],
          hipR: [-0.3, 0, 0],
          kneeR: [0.75, 0, 0],
          ...ARMS_DOWN,
        },
      },
      {
        lift: 0,
        joints: {
          hipL: [0.35, 0, 0],
          hipR: [-0.45, 0, 0],
          kneeL: [0.25, 0, 0],
          shoulderL: [-0.35, 0, 0.08],
          shoulderR: [0.35, 0, -0.08],
          elbowL: [-0.45, 0, 0],
          elbowR: [-0.15, 0, 0],
        },
      },
      {
        lift: 0.03,
        joints: {
          hipL: [-0.3, 0, 0],
          hipR: [0.05, 0, 0],
          kneeL: [0.75, 0, 0],
          ...ARMS_DOWN,
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

// The pose `name` at time t seconds: { lift, joints } with every joint
// present. Cycles interpolate linearly between keys and loop.
export function samplePose(name: PoseName, t = 0): PoseSample {
  const pose: Pose | undefined = POSES[name]
  if (!pose) throw new Error(`Unknown pose: ${name}`)
  const { keys } = pose
  let a = keys[0]
  let b = keys[0]
  let f = 0
  if (keys.length > 1) {
    // A cycle with no length never advances, as before (t / undefined is
    // NaN, which reads as phase 0 below).
    const phase = (((t / (pose.seconds ?? NaN)) % 1) + 1) % 1
    const pos = phase * keys.length
    const i = Math.floor(pos)
    a = keys[i]
    b = keys[(i + 1) % keys.length]
    f = pos - i
  }
  const joints = {} as Record<JointName, Rotation> // filled for every joint below
  for (const joint of JOINTS) {
    joints[joint] = mix(a.joints[joint] || ZERO, b.joints[joint] || ZERO, f)
  }
  return { lift: a.lift + (b.lift - a.lift) * f, joints }
}
