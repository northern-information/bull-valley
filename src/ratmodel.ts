import * as THREE from 'three'
import { adder, joint } from './assetkit.ts'
import { applyPS1 } from './ps1.ts'
import { buildShadowSmoke, flakeAmount, flaky } from './shadowmanmodel.ts'
import type { FoeRig } from './assetkit.ts'
import type { Vec3 } from './interfaces.ts'

// A shadow rat (undercroftfoes.ts): a black rat the size of a dog, low to
// the stone, its back humped, its naked tail trailing, two red eyes and a
// mouth of pale spikes, its jaw hanging open and snapping as it runs, shot
// through with the shadowmen's holes and giving off their smoke
// (shadowmanmodel.ts flaky, buildShadowSmoke). Origin at the floor under
// it, facing +Z. update takes how fast it is walking (m/s), and its scurry
// is drawn from it. setBurn pales it and shakes it as a beam burns it, and
// it thrashes, wilder the nearer it is to bursting: its legs flail and its
// body bucks.

const RAT_BODY = new THREE.Color('#040405')
const RAT_PALE = new THREE.Color('#6a6e78')

// How far one scurry of the rat carries it.
const SCURRY = 0.55

// The rat's eyes, red as the Warden's slit.
const RAT_EYES = '#ff2a1a'

export function buildRat(seed = 0x7e11): FoeRig {
  const group = new THREE.Group()
  group.name = 'shadow-rat'
  const body = new THREE.MeshBasicMaterial({
    color: RAT_BODY,
    transparent: true,
    opacity: 0.94,
  })
  applyPS1(body)
  const flakes = flaky(body, seed)
  const pale = applyPS1(new THREE.MeshBasicMaterial({ color: '#d8e4ea' }))
  const red = applyPS1(new THREE.MeshBasicMaterial({ color: RAT_EYES }))
  const add = adder(group)

  // Everything but the legs rides on `trunk`, which bucks with the scurry.
  const trunk = joint(group, [0, 0, 0], 'rat-trunk')
  // The long body, humped over the haunches, the shoulders lower.
  const belly = add(
    new THREE.IcosahedronGeometry(0.3, 1),
    body,
    [0, 0.34, -0.05],
    [0, 0, 0],
    trunk
  )
  belly.scale.set(0.85, 0.75, 1.55)
  const haunch = add(
    new THREE.IcosahedronGeometry(0.26, 1),
    body,
    [0, 0.42, -0.3],
    [0, 0, 0],
    trunk
  )
  haunch.scale.set(1, 0.9, 1.1)

  // The head on its neck, a long snout to the front, sniffing.
  const head = joint(trunk, [0, 0.36, 0.38], 'rat-head')
  add(
    new THREE.ConeGeometry(0.16, 0.48, 6),
    body,
    [0, 0, 0.18],
    [Math.PI / 2, 0, 0],
    head
  )
  for (const x of [-0.1, 0.1]) {
    // Round ears, set back, and the eyes before them.
    add(
      new THREE.CylinderGeometry(0.09, 0.09, 0.015, 6),
      body,
      [x, 0.13, -0.02],
      [Math.PI / 2 - 0.3, 0, x < 0 ? 0.4 : -0.4],
      head
    )
    add(
      new THREE.BoxGeometry(0.04, 0.03, 0.02),
      red,
      [x * 0.75, 0.07, 0.1],
      [0, x < 0 ? -0.5 : 0.5, 0],
      head
    )
    // Whiskers, splayed.
    for (const tip of [-0.12, 0.12]) {
      add(
        new THREE.BoxGeometry(0.22, 0.006, 0.006),
        body,
        [x * 1.6, -0.01, 0.36],
        [0, x < 0 ? tip : -tip, 0],
        head
      )
    }
  }
  // The radius of a cone `long` long, `wide` at its base, `z` back from
  // its tip: where along the snout or the jaw a tooth stands.
  const girth = (wide: number, long: number, z: number) => (wide * z) / long
  // A row of spikes down each side of the snout, pointing down, the two
  // at its tip the longest.
  const spike = (
    at: Vec3,
    long: number,
    down: boolean,
    parent: THREE.Object3D
  ) =>
    add(
      new THREE.ConeGeometry(0.014, long, 4),
      pale,
      [at[0], at[1] + (down ? -long / 2 : long / 2), at[2]],
      [down ? Math.PI : 0, 0, 0],
      parent
    )
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = 0.38 - i * 0.055
      const r = girth(0.16, 0.48, 0.42 - z)
      spike([side * r * 0.7, -r * 0.6, z], i === 0 ? 0.09 : 0.05, true, head)
    }
  }
  // The lower jaw, hanging open under the snout, spiked along its rim.
  const jaw = joint(head, [0, -0.07, 0.02], 'rat-jaw')
  add(
    new THREE.ConeGeometry(0.08, 0.34, 5),
    body,
    [0, 0, 0.17],
    [Math.PI / 2, 0, 0],
    jaw
  )
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = 0.3 - i * 0.06
      const r = girth(0.08, 0.34, 0.34 - z)
      spike([side * r * 0.7, r * 0.5, z], i === 0 ? 0.07 : 0.045, false, jaw)
    }
  }

  // The shadowmen's smoke, off its back and haunches.
  const smoke = buildShadowSmoke({
    seed,
    puffs: 12,
    from: { min: [-0.15, 0.3, -0.5], max: [0.15, 0.55, 0.3] },
    rise: 0.35,
    drift: 0.12,
  })
  group.add(smoke.points)

  // The tail: a chain of joints from the rump, tapering, nearly as long as
  // the rat, lying along the floor and sweeping as it goes.
  const tail: THREE.Group[] = []
  let parent: THREE.Object3D = trunk
  let at: Vec3 = [0, 0.36, -0.56]
  for (let i = 0; i < 6; i++) {
    const seg = joint(parent, at, `rat-tail-${i}`)
    seg.rotation.x = i === 0 ? 1.2 : 0.06
    const long = 0.15
    add(
      new THREE.CylinderGeometry(0.035 - i * 0.005, 0.04 - i * 0.005, long, 4),
      body,
      [0, -long / 2, 0],
      [0, 0, 0],
      seg
    )
    tail.push(seg)
    parent = seg
    at = [0, -long, 0]
  }
  const tailBase = tail.map((seg) => seg.rotation.x)

  // Four legs on the group, so the trunk can buck over them: forelegs
  // under the shoulders, hind legs under the haunches.
  const legs: THREE.Group[] = []
  for (const [x, z] of [
    [-0.17, 0.22],
    [0.17, 0.22],
    [-0.19, -0.3],
    [0.19, -0.3],
  ] as const) {
    const hip = 0.28
    const leg = joint(group, [x, hip, z], 'rat-leg')
    add(
      new THREE.BoxGeometry(0.06, hip, 0.07),
      body,
      [0, -hip / 2, 0],
      [0, 0, 0],
      leg
    )
    add(
      new THREE.BoxGeometry(0.08, 0.025, 0.12),
      body,
      [0, -hip + 0.012, 0.03],
      [0, 0, 0],
      leg
    )
    legs.push(leg)
  }

  let phase = 0
  let last = 0
  let run = 0
  let thrash = 0
  let burnt = 0
  const update = (t: number, speed = 0) => {
    const dt = Math.min(0.1, Math.max(0, t - last))
    last = t
    const pace = Math.min(speed, 6)
    run += (Math.min(1, pace / 1.5) - run) * Math.min(1, dt * 6)
    phase += (pace * dt * Math.PI * 2) / SCURRY
    const step = Math.sin(phase)
    // A trot: each foreleg with the hind leg across from it.
    legs.forEach((leg, i) => {
      const pair = i === 0 || i === 3 ? 1 : -1
      leg.rotation.x =
        pair * step * 0.7 * run + Math.sin(t * 13 + i * 1.7) * 1.1 * thrash
      leg.rotation.z = Math.sin(t * 11 + i) * 0.5 * thrash
    })
    // The back flexes with the scurry, the trunk bucks as it burns.
    trunk.position.y = Math.abs(Math.cos(phase)) * 0.04 * run
    trunk.rotation.x =
      Math.sin(phase * 2) * 0.05 * run + Math.sin(t * 9) * 0.3 * thrash
    trunk.rotation.z = Math.sin(t * 7.5) * 0.25 * thrash
    // Still, it lifts its head and sniffs; running, it holds it low.
    const idle = 1 - run
    head.rotation.x =
      -0.15 * idle +
      0.1 * run +
      Math.sin(t * 17) * 0.04 * idle +
      Math.sin(t * 12) * 0.4 * thrash
    head.rotation.y = Math.sin(t * 0.8) * 0.35 * idle
    // The jaw hangs open, snapping as it runs, gaping as it burns.
    jaw.rotation.x =
      0.25 +
      Math.max(0, Math.sin(phase * 2)) * 0.3 * run +
      Math.abs(Math.sin(t * 15)) * 0.4 * thrash
    // The tail sweeps, a wave down its length, wilder burning.
    tail.forEach((seg, i) => {
      seg.rotation.x = tailBase[i]
      seg.rotation.z =
        Math.sin(t * (2 + run * 6) - i * 0.7) * (0.18 + thrash * 0.5)
    })
    flakes.time.value = t + (seed % 10)
    smoke.update(t, burnt)
  }
  update(0)
  return {
    group,
    update,
    setBurn(next) {
      const burn = Math.max(0, Math.min(1, next))
      thrash = burn * burn
      burnt = burn
      flakes.amount.value = flakeAmount(burn)
      body.color.copy(RAT_BODY).lerp(RAT_PALE, burn)
      body.opacity = 0.94 - burn * 0.4
    },
  }
}
