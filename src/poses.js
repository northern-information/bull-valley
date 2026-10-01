// Pure: the joints of the shared character body (figure.js) and the poses
// that drive them. A pose maps joint names to [x, y, z] Euler rotations in
// radians, plus a lift (metres added to the root height, negative to
// crouch). Joints a pose leaves out rest at zero.
//
// Body space: the figure faces +Z, so its left side is +X. A negative x
// rotation swings a hanging limb forward; a positive x rotation bends a
// knee back.

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
]

const ARMS_DOWN = {
  shoulderL: [0, 0, 0.08],
  shoulderR: [0, 0, -0.08],
  elbowL: [-0.12, 0, 0],
  elbowR: [-0.12, 0, 0],
}

// Each entry is a list of keys; a cycle spreads its keys evenly over
// `seconds` and loops.
export const POSES = {
  stand: { keys: [{ lift: 0, joints: { ...ARMS_DOWN } }] },
  // Driving: thighs forward, shins down, hands on a wheel.
  sit: {
    keys: [
      {
        lift: 0,
        joints: {
          hipL: [-1.5, 0, 0.04],
          hipR: [-1.5, 0, -0.04],
          kneeL: [1.45, 0, 0],
          kneeR: [1.45, 0, 0],
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
}

const ZERO = [0, 0, 0]

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

// The pose `name` at time t seconds: { lift, joints } with every joint
// present. Cycles interpolate linearly between keys and loop.
export function samplePose(name, t = 0) {
  const pose = POSES[name]
  if (!pose) throw new Error(`Unknown pose: ${name}`)
  const { keys } = pose
  let a = keys[0]
  let b = keys[0]
  let f = 0
  if (keys.length > 1) {
    const phase = (((t / pose.seconds) % 1) + 1) % 1
    const pos = phase * keys.length
    const i = Math.floor(pos)
    a = keys[i]
    b = keys[(i + 1) % keys.length]
    f = pos - i
  }
  const joints = {}
  for (const joint of JOINTS) {
    joints[joint] = mix(a.joints[joint] || ZERO, b.joints[joint] || ZERO, f)
  }
  return { lift: a.lift + (b.lift - a.lift) * f, joints }
}
