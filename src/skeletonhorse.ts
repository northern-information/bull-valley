import * as THREE from 'three'
import {
  castShadows,
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  mergeStatic,
  setMotion,
} from './assetkit.ts'
import { buildFlames } from './fire.ts'
import type { Flames, FlameSpot } from './fire.ts'
import type { Vec3 } from './interfaces.ts'

// --- Skeleton horse ------------------------------------------------------

// Moab Coldë's horse: bare bone from skull to tail, under a saddle with
// saddlebags, burning at the mane, the tail and the hooves, its eyes lit.
// It stands at ease: the ribs rise and fall, the head nods and looks about,
// the tail swishes now and then, and every so often it stamps a forehoof.
// Horse-local space: origin on the ground under the middle of the barrel,
// facing +Z, left side +X, like a figure. Call update(t) every frame with
// a running time, or once with a fixed time to hold it still.
export interface SkeletonHorse {
  group: THREE.Group
  update(t: number): void
}

// The top of the seat, metres off the ground.
const HORSE_SADDLE_TOP = 1.55

// The spine's height along the back, from the croup (-Z) to the withers
// (+Z), as [z, y] stations to interpolate between.
const HORSE_SPINE: [number, number][] = [
  [-0.9, 1.38],
  [-0.6, 1.4],
  [-0.2, 1.37],
  [0.2, 1.4],
  [0.55, 1.47],
]

function horseSpineY(z: number): number {
  const last = HORSE_SPINE.length - 1
  if (z <= HORSE_SPINE[0][0]) return HORSE_SPINE[0][1]
  if (z >= HORSE_SPINE[last][0]) return HORSE_SPINE[last][1]
  let i = 0
  while (HORSE_SPINE[i + 1][0] < z) i++
  const [z0, y0] = HORSE_SPINE[i]
  const [z1, y1] = HORSE_SPINE[i + 1]
  return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0)
}

// Ribs as [z, radius]: deepest behind the shoulder, closing toward the
// loin.
const HORSE_RIBS: [number, number][] = [
  [0.4, 0.27],
  [0.3, 0.31],
  [0.2, 0.33],
  [0.1, 0.33],
  [0.0, 0.32],
  [-0.1, 0.3],
  [-0.2, 0.27],
  [-0.3, 0.23],
]

// Each rib is an arch round the barrel, open at the top where the spine
// runs: a torus arc missing this much either side of straight up.
const RIB_GAP = 0.45

// The joints the horse moves about, in horse-local space.
const HORSE_NECK_BASE: Vec3 = [0, 1.48, 0.6]
const HORSE_POLL: Vec3 = [0, 2.0, 1.02]
const HORSE_CROUP: Vec3 = [0, 1.36, -0.95]
const HORSE_CHEST: Vec3 = [0, 1.4, 0.05]

// The idle, in seconds and radians. A stamp comes once a cycle, the tail
// swishes in bouts, and the breath and the nod never stop.
const HORSE_IDLE = {
  breathSeconds: 4.5,
  breathDepth: 0.025,
  nod: 0.1,
  nodSeconds: 13,
  look: 0.2,
  lookSeconds: 21,
  swish: 0.35,
  swishSeconds: 1.6,
  swishBoutSeconds: 11,
  stampSeconds: 9,
  stampLength: 0.8,
  stampLift: 0.35,
}

const UP = new THREE.Vector3(0, 1, 0)

// A bone from a to b: a thin five-sided cylinder, narrower at b.
function boneBetween(
  a: Vec3,
  b: Vec3,
  radius: number,
  material: THREE.Material
): THREE.Mesh {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const length = dir.length()
  // CylinderGeometry runs top (+Y) to bottom; the bottom is at a.
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.8, radius, length, 5),
    material
  )
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize())
  return mesh
}

// A knuckle of bone at a joint.
function knob(at: Vec3, radius: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 0),
    material
  )
  mesh.position.set(...at)
  return mesh
}

function boxAt(
  size: Vec3,
  at: Vec3,
  material: THREE.Material,
  rotation?: Vec3
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...at)
  if (rotation) mesh.rotation.set(...rotation)
  return mesh
}

// A moving part of the horse: `pivot` turns about `at`, and everything
// added to `body` is placed in horse-local space as if it never moved.
function hinge(
  parent: THREE.Object3D,
  name: string,
  at: Vec3
): { pivot: THREE.Group; body: THREE.Group } {
  const pivot = new THREE.Group()
  pivot.name = name
  pivot.position.set(...at)
  const body = new THREE.Group()
  body.position.set(-at[0], -at[1], -at[2])
  pivot.add(body)
  parent.add(pivot)
  return { pivot, body }
}

// The horse's skull: a cranium and a long muzzle with the jaw under it,
// in its own space with the poll at the origin and the nose along +Z.
// Its eyes burn in their sockets.
let horseEyeGlow: THREE.Texture | null = null
function horseSkull(bone: THREE.Material, socket: THREE.Material): THREE.Group {
  const group = new THREE.Group()
  group.name = 'horse-skull'
  group.add(boxAt([0.2, 0.2, 0.24], [0, 0, 0.04], bone))
  // The muzzle narrows toward the nose.
  const muzzle = new THREE.BoxGeometry(0.15, 0.13, 0.4)
  const pos = muzzle.attributes.position
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > 0) {
      pos.setX(i, pos.getX(i) * 0.7)
      pos.setY(i, pos.getY(i) * 0.8)
    }
  }
  muzzle.computeVertexNormals()
  const snout = new THREE.Mesh(muzzle, bone)
  snout.position.set(0, -0.02, 0.34)
  group.add(snout)
  group.add(boxAt([0.11, 0.05, 0.42], [0, -0.12, 0.3], bone, [0.12, 0, 0]))
  // The nostril hole, and an eye socket each side with its ember.
  group.add(boxAt([0.08, 0.04, 0.02], [0, 0.01, 0.545], socket))
  horseEyeGlow ??= makeGlowTexture('rgba(255, 80, 24, 0.9)')
  for (const side of [1, -1]) {
    group.add(boxAt([0.02, 0.07, 0.08], [side * 0.1, 0.02, 0.08], socket))
    const eye = makeGlowSprite(horseEyeGlow, 0.12)
    eye.position.set(side * 0.115, 0.02, 0.08)
    group.add(eye)
  }
  // The front teeth, in rows along the end of the jaw.
  for (let i = 0; i < 5; i++) {
    group.add(boxAt([0.1, 0.03, 0.016], [0, -0.085, 0.42 + i * 0.025], bone))
  }
  return group
}

// 0 to 1 and back to 0 across the first `length` seconds of every
// `period`, and 0 the rest of the time.
function pulse(t: number, period: number, length: number): number {
  const at = ((t % period) + period) % period
  return at < length ? Math.sin((at / length) * Math.PI) : 0
}

export function buildSkeletonHorse(): SkeletonHorse {
  const group = new THREE.Group()
  group.name = 'skeleton-horse'
  const bone = lambert({ color: '#d6cfb8' })
  const socket = lambert({ color: '#060606' })
  const hoofMat = lambert({ color: '#2a241c' })
  const leather = lambert({ color: '#3a2216' })
  const bag = lambert({ color: '#4a2c1a' })
  const strap = lambert({ color: '#0a0a0b' })
  const iron = lambert({ color: '#8a8a86' })
  const blanket = lambert({ color: '#5e0f0f' })

  // The backbone, a vertebra every 10 cm, with the spines over the
  // withers standing tallest.
  for (let i = 0; i <= 14; i++) {
    const z = -0.9 + i * 0.1
    const y = horseSpineY(z)
    group.add(boxAt([0.08, 0.09, 0.08], [0, y, z], bone))
    const spine = 0.05 + Math.max(0, z - 0.1) * 0.25
    group.add(boxAt([0.025, spine, 0.04], [0, y + 0.045 + spine / 2, z], bone))
  }

  // The ribcage, each rib a torus arc open at the top, the sternum along
  // the bottom of it, and a girth strap round it just behind the elbows
  // holding the saddle on. They breathe together, out from the chest.
  const ribs = hinge(group, 'horse-ribs', HORSE_CHEST)
  for (const [z, r] of HORSE_RIBS) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.022, 3, 9, Math.PI * 2 - RIB_GAP * 2),
      bone
    )
    rib.rotation.z = Math.PI / 2 + RIB_GAP
    rib.position.set(0, horseSpineY(z) - r * 0.92, z)
    ribs.body.add(rib)
  }
  ribs.body.add(boxAt([0.07, 0.04, 0.7], [0, 0.82, 0.08], bone, [-0.08, 0, 0]))
  const girth = new THREE.Mesh(
    new THREE.TorusGeometry(0.345, 0.018, 3, 12),
    strap
  )
  girth.position.set(0, horseSpineY(0.15) - 0.33 * 0.92, 0.15)
  ribs.body.add(girth)

  // Shoulder blades and the pelvis.
  for (const side of [1, -1]) {
    group.add(
      boxAt([0.025, 0.32, 0.12], [side * 0.25, 1.25, 0.46], bone, [
        0.35,
        0,
        side * 0.12,
      ])
    )
  }
  group.add(boxAt([0.44, 0.12, 0.3], [0, 1.3, -0.75], bone, [-0.2, 0, 0]))
  for (const side of [1, -1]) {
    group.add(boxAt([0.08, 0.22, 0.08], [side * 0.2, 1.2, -0.7], bone))
  }

  // The legs, as [y, z] joints: shoulder or hip, knee or stifle (and the
  // hock behind), the fetlock, the hoof. A bone between each pair, a knob
  // at each joint below the top, and the hoof burning. Each leg swings
  // from its top joint; only the near forehoof (+X) stamps.
  const legFlames: Flames[] = []
  const leg = (x: number, joints: [number, number][]) => {
    const [topY, topZ] = joints[0]
    const { pivot, body } = hinge(group, 'horse-leg', [x, topY, topZ])
    for (let i = 0; i < joints.length - 1; i++) {
      const a: Vec3 = [x, ...joints[i]]
      const b: Vec3 = [x, ...joints[i + 1]]
      body.add(boneBetween(a, b, i === 0 ? 0.045 : 0.03, bone))
      if (i > 0) body.add(knob(a, 0.045, bone))
    }
    const [, footZ] = joints[joints.length - 1]
    const hoof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.07, 0.08, 6),
      hoofMat
    )
    hoof.position.set(x, 0.04, footZ + 0.02)
    body.add(hoof)
    const fire = buildFlames(
      [{ at: [x, 0.06, footZ + 0.02], size: 0.22 }],
      0x40f + legFlames.length
    )
    body.add(fire.group)
    legFlames.push(fire)
    return { pivot, fire }
  }
  const legs = [1, -1].flatMap((side) => {
    const x = side * 0.17
    return [
      leg(x, [
        [1.18, 0.44],
        [0.7, 0.42],
        [0.2, 0.42],
        [0.08, 0.47],
      ]),
      leg(x, [
        [1.25, -0.72],
        [0.92, -0.6],
        [0.52, -0.82],
        [0.2, -0.8],
        [0.08, -0.75],
      ]),
    ]
  })
  const stamper = legs[0]

  // The neck, rising forward from the withers to the poll, the skull hung
  // nose-down off the end of it, and the mane burning up its length. It
  // nods and looks about from the withers.
  const neck = hinge(group, 'horse-neck', HORSE_NECK_BASE)
  const mane: FlameSpot[] = []
  const steps = 5
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps
    const y = HORSE_NECK_BASE[1] + (HORSE_POLL[1] - HORSE_NECK_BASE[1]) * t
    const z = HORSE_NECK_BASE[2] + (HORSE_POLL[2] - HORSE_NECK_BASE[2]) * t
    neck.body.add(boxAt([0.09, 0.08, 0.11], [0, y, z], bone, [-0.9, 0, 0]))
    mane.push({ at: [0, y + 0.05, z - 0.04], size: 0.32 - t * 0.08 })
  }
  const maneFire = buildFlames(mane, 0x3a7e)
  neck.body.add(maneFire.group)
  const skull = horseSkull(bone, socket)
  skull.position.set(...HORSE_POLL)
  skull.rotation.x = 0.6
  neck.body.add(skull)

  // The tail, a string of small bones curling down off the croup, burning
  // at the end. It swishes from the croup.
  const tail = hinge(group, 'horse-tail', HORSE_CROUP)
  let tip: Vec3 = HORSE_CROUP
  for (let i = 0; i < 6; i++) {
    const next: Vec3 = [0, tip[1] - 0.09, tip[2] - 0.05 + i * 0.012]
    tail.body.add(boneBetween(tip, next, 0.022, bone))
    tip = next
  }
  const tailFire = buildFlames([{ at: tip, size: 0.3 }], 0x7a11)
  tail.body.add(tailFire.group)

  // The saddle on a blanket over the ribs, with its pommel and cantle,
  // and the stirrups on their leathers.
  const seatY = HORSE_SADDLE_TOP - 0.04
  group.add(
    boxAt([0.62, 0.03, 0.72], [0, horseSpineY(0) + 0.05, 0.02], blanket)
  )
  group.add(boxAt([0.46, 0.08, 0.56], [0, seatY, 0.02], leather))
  group.add(boxAt([0.16, 0.14, 0.07], [0, seatY + 0.08, 0.29], leather))
  group.add(boxAt([0.34, 0.12, 0.06], [0, seatY + 0.07, -0.25], leather))
  for (const side of [1, -1]) {
    group.add(
      boxAt([0.02, 0.6, 0.07], [side * 0.27, seatY - 0.32, 0.06], strap)
    )
    group.add(boxAt([0.1, 0.03, 0.12], [side * 0.29, seatY - 0.63, 0.08], iron))
  }

  // The saddlebags, slung over the loin behind the cantle: a strap across
  // the spine, and a bag down each side with a flap over its top and two
  // buckled straps down its outer face.
  const bagZ = -0.5
  const bagTop = horseSpineY(bagZ) + 0.04
  group.add(boxAt([0.62, 0.025, 0.24], [0, bagTop, bagZ], leather))
  for (const side of [1, -1]) {
    const x = side * 0.34
    group.add(boxAt([0.14, 0.34, 0.34], [x, bagTop - 0.19, bagZ], bag))
    group.add(boxAt([0.155, 0.13, 0.35], [x, bagTop - 0.07, bagZ], leather))
    for (const dz of [-0.09, 0.09]) {
      const face = x + side * 0.074
      group.add(
        boxAt([0.012, 0.26, 0.03], [face, bagTop - 0.2, bagZ + dz], strap)
      )
      group.add(
        boxAt(
          [0.014, 0.03, 0.036],
          [face + side * 0.004, bagTop - 0.15, bagZ + dz],
          iron
        )
      )
    }
  }

  // Some 150 bones and fittings, a few draws per moving part.
  mergeStatic(group)
  castShadows(group)

  const I = HORSE_IDLE
  const update = (t: number) => {
    const breath =
      1 + I.breathDepth * Math.sin((t / I.breathSeconds) * Math.PI * 2)
    ribs.pivot.scale.set(breath, breath, 1)
    // The head sinks a little, comes up, and turns to look about.
    const nod = I.nod * (0.5 + 0.5 * Math.sin((t / I.nodSeconds) * Math.PI * 2))
    neck.pivot.rotation.set(
      nod,
      I.look * Math.sin((t / I.lookSeconds) * Math.PI * 2),
      0
    )
    maneFire.counter(nod, 0)
    maneFire.update(t)
    // A bout of swishing, then the tail hangs still a while.
    const bout = pulse(t, I.swishBoutSeconds, I.swishSeconds * 2)
    const swish = I.swish * bout * Math.sin((t / I.swishSeconds) * Math.PI * 2)
    tail.pivot.rotation.z = swish
    tailFire.counter(0, swish)
    tailFire.update(t)
    // The near forehoof comes up, forward, and down.
    const stamp = -I.stampLift * pulse(t, I.stampSeconds, I.stampLength)
    stamper.pivot.rotation.x = stamp
    stamper.fire.counter(stamp, 0)
    for (const fire of legFlames) fire.update(t)
  }
  update(0)
  setMotion(group, update)
  return { group, update }
}
