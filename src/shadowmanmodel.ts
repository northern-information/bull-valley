import * as THREE from 'three'
import {
  isMesh,
  makeGlowSprite,
  makeGlowTexture,
  meshBounds,
} from './assetkit.ts'
import { applyPose, buildFigure } from './figure.ts'
import { blendPose, JOINTS, POSES, samplePose } from './poses.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'
import type { Figure } from './figure.ts'
import type { JointName, PoseSample, Rotation } from './poses.ts'

// --- Shadowman -----------------------------------------------------------

// A shadowman (shadowmen.ts): the raiders' own jointed body (figure.ts) in
// the shadow outfit, hooded, its arms and legs too long, all of it one flat
// unlit black, `height` metres to the top of the hood. Each one stands a
// little crooked its own way, drawn from `seed` (its id), so it looks the
// same on every client. Origin on the ground between its feet, facing +Z.
// update() walks it at `speed` (m/s), rears it back with both arms raised
// over the windup and flings it forward, arms out, in the lunge; pales it
// toward grey as it burns in a beam (0 to 1); and shows the violet aura
// while a joint is working, faded by `sight` (0 to 1) for one far off.
export interface ShadowmanRig {
  group: THREE.Group
  // windup: how far through winding up to strike (0 to 1); lunge: how far
  // through the lunge (0 to 1). Both 0 when it is not striking.
  update(frame: {
    dt: number
    speed: number
    burn: number
    perception: boolean
    windup?: number
    lunge?: number
    sight?: number
  }): void
  // Frees what is its own: the body's material and the aura's. The
  // geometry is figure.ts's, shared by every body, and stays.
  dispose(): void
}

const BODY = new THREE.Color('#07080c')
const BURNING = new THREE.Color('#6b6e78')
// Metres one walk cycle covers for a body of the raiders' height; the same
// stride as peers.ts, scaled with the body.
const STRIDE = 1.5
const RAIDER_HEIGHT = 1.8

// How tall the shadow outfit stands at scale 1, hood and all: measured
// once, so a body can be scaled to any height.
let natural = 0
function naturalHeight(figure: Figure): number {
  if (!natural) {
    applyPose(figure, samplePose('stand'))
    natural = meshBounds(figure.group).max.y
  }
  return natural
}

// Rotations added to whatever pose it is in: how this one stands crooked.
type Crook = Partial<Record<JointName, Rotation>>

function crookOf(seed: number): Crook {
  const rng = mulberry32(seed)
  // One shoulder hangs lower than the other, whichever side.
  const drop = range(rng, 0.05, 0.22) * (rng() < 0.5 ? -1 : 1)
  return {
    spine: [range(rng, 0.12, 0.35), range(rng, -0.12, 0.12), 0],
    neck: [range(rng, -0.3, 0.05), 0, range(rng, -0.3, 0.3)],
    shoulderL: [range(rng, -0.18, 0.08), 0, Math.max(0, drop)],
    shoulderR: [range(rng, -0.18, 0.08), 0, Math.min(0, drop)],
    elbowL: [range(rng, -0.35, 0), 0, 0],
    elbowR: [range(rng, -0.35, 0), 0, 0],
  }
}

function crooked(pose: PoseSample, crook: Crook, amount: number): PoseSample {
  const joints = { ...pose.joints }
  for (const joint of JOINTS) {
    const add = crook[joint]
    if (!add) continue
    const [x, y, z] = joints[joint]
    joints[joint] = [
      x + add[0] * amount,
      y + add[1] * amount,
      z + add[2] * amount,
    ]
  }
  return { lift: pose.lift, joints }
}

const STAND = samplePose('stand')
const WINDUP = samplePose('shadow-windup')
const LUNGE = samplePose('shadow-lunge')

export function buildShadowman(height = 2.8, seed = 0xd06): ShadowmanRig {
  const group = new THREE.Group()
  group.name = 'shadowman'
  const figure = buildFigure('shadow')
  const scale = height / naturalHeight(figure)
  figure.group.scale.setScalar(scale)
  group.add(figure.group)
  // One flat black over every part, its own so it can pale as it burns.
  const skin = applyPS1(new THREE.MeshBasicMaterial({ color: BODY }))
  figure.group.traverse((o) => {
    if (!isMesh(o)) return
    o.material = skin
    o.castShadow = false
  })

  // The perception aura: a violet bloom over the whole of it.
  const aura = makeGlowSprite(
    makeGlowTexture('rgba(139, 92, 246, 0.55)'),
    height
  )
  aura.scale.set(height * 0.75, height * 1.2, 1)
  aura.material.opacity = 0
  aura.material.fog = false
  aura.position.y = height / 2
  group.add(aura)

  const crook = crookOf(seed)
  const stride = STRIDE * (height / RAIDER_HEIGHT)
  // Its own small tremor, out of step with every other.
  const tremor = mulberry32(seed ^ 0x7e3)() * 10
  let cycle = 0
  let time = 0

  return {
    group,
    update({ dt, speed, burn, perception, windup = 0, lunge = 0, sight = 1 }) {
      time += dt
      cycle += (speed * dt) / stride
      const walking = Math.min(1, speed / 1.2)
      const slam = Math.sin(Math.PI * Math.min(1, Math.max(0, lunge)))
      const rear = Math.min(1, Math.max(0, windup))
      let pose = blendPose(
        STAND,
        samplePose('walk', cycle * POSES.walk.seconds),
        walking
      )
      pose = crooked(pose, crook, 1 - Math.max(rear, slam))
      pose = blendPose(pose, WINDUP, rear)
      pose = blendPose(pose, LUNGE, slam)
      applyPose(figure, pose)
      // The head twitches and the arms shake, harder as it burns.
      const shake = 0.04 + 0.25 * burn
      const t = time + tremor
      figure.joints.neck.rotation.z +=
        Math.sin(t * 7.3) * Math.sin(t * 2.1) * shake
      figure.joints.elbowL.rotation.x += Math.sin(t * 11.7) * shake
      figure.joints.elbowR.rotation.x += Math.sin(t * 9.4 + 1) * shake
      skin.color.lerpColors(BODY, BURNING, burn)
      aura.material.opacity = perception ? 0.5 * sight : 0
    },
    dispose() {
      skin.dispose()
      aura.material.dispose()
    },
  }
}
