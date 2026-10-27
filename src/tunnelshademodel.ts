import * as THREE from 'three'
import { lambert } from './assetkit.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'
import type { Vec3 } from './interfaces.ts'

// A tunnel shade (tunnelshades.ts), seen as a shadow rat: a black rat
// the size of a dog, low to the stone, its back humped, its naked tail
// trailing, two pale pinprick eyes and two pale teeth; or the Warden, a head and
// a half taller than any raider and twice as broad, its face shut in a
// riveted iron helm with one red slit and a padlock at the jaw, a black
// coat over a butcher's apron, grey arms hanging past its knees, a
// rusted cleaver dragged in one hand and a hooked chain in the other.
// Origin at the floor under it, facing +Z. update takes how fast it is
// walking (m/s): the rat's scurry and the Warden's heavy step are drawn
// from it. setBurn pales it and shakes it as a beam burns it, and it
// thrashes, wilder the nearer it is to bursting: the rat's legs flail and
// its body bucks, the Warden's arms, legs and trunk heave.
export interface TunnelShadeRig {
  group: THREE.Group
  update(t: number, speed?: number): void
  setBurn(burn: number): void
}

const SHADE_BODY = new THREE.Color('#040405')
const SHADE_PALE = new THREE.Color('#6a6e78')

type Add = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  at: Vec3,
  turn?: Vec3,
  parent?: THREE.Object3D
) => THREE.Mesh

function adder(group: THREE.Group): Add {
  return (geometry, material, at, turn = [0, 0, 0], parent = group) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...at)
    mesh.rotation.set(...turn)
    parent.add(mesh)
    return mesh
  }
}

// A pivot at `at` under `parent`, for a limb or the head to turn on.
function joint(parent: THREE.Object3D, at: Vec3, name: string): THREE.Group {
  const pivot = new THREE.Group()
  pivot.name = name
  pivot.position.set(...at)
  parent.add(pivot)
  return pivot
}

export function buildTunnelShade(
  kind: 'shade' | 'warden',
  seed = 0x7e11
): TunnelShadeRig {
  return kind === 'warden' ? buildWarden(seed) : buildShade()
}

// How far one scurry of the rat carries it.
const SCURRY = 0.55

function buildShade(): TunnelShadeRig {
  const group = new THREE.Group()
  group.name = 'shadow-rat'
  const body = new THREE.MeshBasicMaterial({
    color: SHADE_BODY,
    transparent: true,
    opacity: 0.94,
  })
  applyPS1(body)
  const pale = applyPS1(new THREE.MeshBasicMaterial({ color: '#d8e4ea' }))
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
      new THREE.BoxGeometry(0.03, 0.025, 0.02),
      pale,
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
  // Two teeth under the snout's tip.
  for (const x of [-0.012, 0.012]) {
    add(
      new THREE.BoxGeometry(0.02, 0.05, 0.012),
      pale,
      [x, -0.06, 0.4],
      [0.2, 0, 0],
      head
    )
  }

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
    // The tail sweeps, a wave down its length, wilder burning.
    tail.forEach((seg, i) => {
      seg.rotation.x = tailBase[i]
      seg.rotation.z =
        Math.sin(t * (2 + run * 6) - i * 0.7) * (0.18 + thrash * 0.5)
    })
  }
  update(0)
  return {
    group,
    update,
    setBurn(next) {
      const burn = Math.max(0, Math.min(1, next))
      thrash = burn * burn
      body.color.copy(SHADE_BODY).lerp(SHADE_PALE, burn)
      body.opacity = 0.94 - burn * 0.4
    },
  }
}

// The Warden's finishes. The coat is unlit black, a hole in the dark the
// way the shades are; the flesh, the leather and the iron are lit, so a
// flashlight finds the grey of its arms and the rust on its blade.
const COAT = new THREE.Color('#050506')
const FLESH = new THREE.Color('#77716a')
const LEATHER = new THREE.Color('#2e2219')
const PALE = new THREE.Color('#9aa0aa')

// How far one stride carries it, and how long a twitch of the head lasts.
const STRIDE = 2.2
const TWITCH = 0.18

// A cheap hash of an integer, 0..1, for the twitches.
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

function buildWarden(seed: number): TunnelShadeRig {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'warden'
  const add = adder(group)

  const coat = applyPS1(
    new THREE.MeshBasicMaterial({
      color: COAT,
      transparent: true,
      opacity: 0.96,
    })
  )
  const flesh = lambert({
    color: FLESH,
    emissive: new THREE.Color('#14120f'),
  })
  const leather = lambert({
    color: LEATHER,
    emissive: new THREE.Color('#0a0705'),
  })
  const iron = lambert({
    color: '#3a3836',
    emissive: new THREE.Color('#0c0b0a'),
  })
  const rust = lambert({
    color: '#5a3424',
    emissive: new THREE.Color('#160a06'),
  })
  const blood = lambert({ color: '#3a0a08' })
  const slit = applyPS1(new THREE.MeshBasicMaterial({ color: '#ff2a1a' }))
  const lit = [
    { m: flesh, from: FLESH },
    { m: leather, from: LEATHER },
  ]

  // Everything above the hips rides on `body`, which bobs and rolls with
  // the step; the legs swing under it from the hips.
  const body = joint(group, [0, 0, 0], 'warden-body')
  const hips = 1.3
  const legs: THREE.Group[] = []
  for (const x of [-0.24, 0.24]) {
    const leg = joint(body, [x, hips, 0], `warden-leg-${x < 0 ? 'l' : 'r'}`)
    add(
      new THREE.CylinderGeometry(0.17, 0.13, hips - 0.12, 5),
      coat,
      [0, -(hips - 0.12) / 2, 0],
      [0, 0, 0],
      leg
    )
    // A boot like a block of iron.
    add(
      new THREE.BoxGeometry(0.3, 0.2, 0.46),
      iron,
      [0, -hips + 0.1, 0.06],
      [0, 0, 0],
      leg
    )
    legs.push(leg)
  }

  // The trunk, stooped forward from the hips: a barrel of a chest under a
  // yoke of shoulders, the coat hanging from it to the shins.
  const trunk = joint(body, [0, hips, 0], 'warden-trunk')
  trunk.rotation.x = 0.16
  add(
    new THREE.CylinderGeometry(0.62, 0.48, 1.15, 6),
    coat,
    [0, 0.6, 0],
    [0, Math.PI / 6, 0],
    trunk
  )
  add(
    new THREE.BoxGeometry(1.5, 0.36, 0.72),
    coat,
    [0, 1.1, -0.02],
    [0, 0, 0],
    trunk
  )
  // Iron plates riveted to each shoulder.
  for (const x of [-0.62, 0.62]) {
    add(
      new THREE.BoxGeometry(0.46, 0.1, 0.62),
      iron,
      [x, 1.3, -0.02],
      [0, 0, x < 0 ? 0.32 : -0.32],
      trunk
    )
  }
  // The skirt of the coat, open at the front, and the ragged strips that
  // hang off its hem and stir as it walks.
  add(
    new THREE.CylinderGeometry(0.56, 0.72, 0.9, 7, 1, true),
    coat,
    [0, -0.2, -0.04],
    [0, 0, 0],
    trunk
  )
  // Round the back and sides only (a, from +Z): the apron is the front.
  const hem: THREE.Mesh[] = []
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * 0.3 + (i / 10) * Math.PI * 1.4
    const long = range(rng, 0.2, 0.5)
    const strip = add(
      new THREE.BoxGeometry(range(rng, 0.1, 0.22), long, 0.03),
      coat,
      [Math.sin(a) * 0.68, -0.62 - long / 2, Math.cos(a) * 0.68 - 0.04],
      [0, a, 0],
      trunk
    )
    hem.push(strip)
  }
  // The apron over the front, stiff with what has dried on it, on a
  // strap round the neck.
  add(
    new THREE.BoxGeometry(0.78, 1.75, 0.04),
    leather,
    [0, 0.05, 0.58],
    [-0.05, 0, 0],
    trunk
  )
  for (let i = 0; i < 5; i++) {
    add(
      new THREE.BoxGeometry(range(rng, 0.12, 0.34), range(rng, 0.1, 0.5), 0.01),
      blood,
      [range(rng, -0.28, 0.28), range(rng, -0.6, 0.6), 0.605],
      [-0.05, 0, range(rng, -0.5, 0.5)],
      trunk
    )
  }
  for (const x of [-0.2, 0.2]) {
    add(
      new THREE.BoxGeometry(0.06, 0.5, 0.04),
      leather,
      [x, 1.05, 0.44],
      [-0.5, 0, x < 0 ? 0.25 : -0.25],
      trunk
    )
  }

  // The head, shut in iron: a squat neck, then the helm, a heavy wedge
  // far wider at the jaw than at the crown, its seams riveted, one slit
  // across it with the red behind, nails driven into it, and a padlock
  // through the hasp at its chin. It hangs forward to look down at
  // whoever it finds, a little to one side, as if listening.
  add(
    new THREE.CylinderGeometry(0.2, 0.26, 0.25, 6),
    flesh,
    [0, 1.35, 0.06],
    [0, 0, 0],
    trunk
  )
  const head = joint(trunk, [0, 1.45, 0.08], 'warden-head')
  const helm = add(
    new THREE.CylinderGeometry(0.26, 0.48, 1.0, 4, 1),
    iron,
    [0, 0.48, 0],
    [0, Math.PI / 4, 0],
    head
  )
  helm.name = 'warden-helm'
  // The helm's front face, z at height y on it.
  const face = (y: number) => 0.352 - ((y + 0.02) / 1.0) * 0.156
  add(
    new THREE.BoxGeometry(0.4, 0.06, 0.4),
    iron,
    [0, 0.99, 0],
    [0, 0, 0],
    head
  )
  for (let row = 0; row < 3; row++) {
    const y = 0.15 + row * 0.27
    for (let i = 0; i < 4; i++) {
      add(
        new THREE.BoxGeometry(0.04, 0.04, 0.04),
        rust,
        [(-0.24 + i * 0.16) * (1 - row * 0.2), y, face(y)],
        [0, 0, 0],
        head
      )
    }
  }
  add(
    new THREE.BoxGeometry(0.36, 0.03, 0.02),
    slit,
    [0, 0.55, face(0.55) + 0.006],
    [-0.15, 0, 0],
    head
  )
  // Long nails driven into it, crooked, from the crown and the sides.
  for (let i = 0; i < 6; i++) {
    const a = range(rng, -Math.PI, Math.PI)
    const up = range(rng, 0.45, 0.95)
    const long = range(rng, 0.35, 0.6)
    const nail = joint(
      head,
      [Math.sin(a) * 0.2, up, Math.cos(a) * 0.2 - 0.04],
      `warden-nail-${i}`
    )
    nail.rotation.set(
      Math.cos(a) * range(rng, 0.5, 1.1),
      0,
      -Math.sin(a) * range(rng, 0.5, 1.1)
    )
    add(
      new THREE.CylinderGeometry(0.012, 0.022, long, 4),
      rust,
      [0, long / 2, 0],
      [0, 0, 0],
      nail
    )
  }
  add(
    new THREE.BoxGeometry(0.1, 0.12, 0.05),
    iron,
    [0, 0.04, face(0.04) + 0.02],
    [0, 0, 0],
    head
  )
  add(
    new THREE.BoxGeometry(0.17, 0.19, 0.08),
    rust,
    [0, -0.13, 0.37],
    [0, 0, 0],
    head
  )
  add(
    new THREE.TorusGeometry(0.06, 0.017, 3, 8, Math.PI),
    iron,
    [0, -0.03, 0.37],
    [0, 0, 0],
    head
  )

  // The arms: from the shoulder in the coat's black, then bare grey
  // forearms, hanging so long the hands are at its knees.
  const arm = (side: -1 | 1): { shoulder: THREE.Group; hand: THREE.Group } => {
    const shoulder = joint(trunk, [side * 0.78, 1.12, 0], `warden-arm-${side}`)
    shoulder.rotation.z = side * 0.1
    add(
      new THREE.CylinderGeometry(0.17, 0.15, 0.85, 5),
      coat,
      [0, -0.42, 0],
      [0, 0, 0],
      shoulder
    )
    const elbow = joint(shoulder, [0, -0.85, 0], `warden-elbow-${side}`)
    elbow.rotation.x = -0.15
    add(
      new THREE.CylinderGeometry(0.13, 0.1, 0.85, 5),
      flesh,
      [0, -0.42, 0],
      [0, 0, 0],
      elbow
    )
    const hand = joint(elbow, [0, -0.9, 0], `warden-hand-${side}`)
    add(
      new THREE.BoxGeometry(0.2, 0.24, 0.16),
      flesh,
      [0, -0.08, 0],
      [0, 0, 0],
      hand
    )
    // Fingers, too long.
    for (let i = 0; i < 4; i++) {
      add(
        new THREE.BoxGeometry(0.035, 0.22, 0.035),
        flesh,
        [-0.07 + i * 0.047, -0.28, 0.04],
        [0.3, 0, 0],
        hand
      )
    }
    return { shoulder, hand }
  }
  const right = arm(1)
  const left = arm(-1)

  // In the right hand, a cleaver as long as a raider's leg, out from its
  // side and back, its point on the floor, dragged.
  const DRAG = 0.55
  const cleaver = joint(right.hand, [0, -0.18, 0], 'warden-cleaver')
  cleaver.rotation.set(DRAG, 0, 1.05)
  add(
    new THREE.CylinderGeometry(0.04, 0.045, 0.42, 5),
    leather,
    [0, 0, 0],
    [0, 0, 0],
    cleaver
  )
  add(
    new THREE.BoxGeometry(0.06, 1.35, 0.5),
    rust,
    [0, -0.86, 0.12],
    [0, 0, 0],
    cleaver
  )
  add(
    new THREE.BoxGeometry(0.065, 1.2, 0.06),
    iron,
    [0, -0.86, 0.39],
    [0, 0, 0],
    cleaver
  )
  add(
    new THREE.BoxGeometry(0.07, 0.4, 0.3),
    blood,
    [0, -1.25, 0.14],
    [0, 0, 0],
    cleaver
  )

  // In the left, a chain to the floor with a meat hook on its end.
  const chain = joint(left.hand, [0, -0.2, 0.04], 'warden-chain')
  const links: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    links.push(
      add(
        new THREE.TorusGeometry(0.055, 0.016, 3, 6),
        iron,
        [0, -i * 0.1, 0],
        [0, i % 2 ? Math.PI / 2 : 0, 0],
        chain
      )
    )
  }
  add(
    new THREE.TorusGeometry(0.12, 0.022, 3, 7, Math.PI * 1.4),
    rust,
    [0, -0.5, 0.08],
    [0, Math.PI / 2, Math.PI * 0.8],
    chain
  )

  // The step and everything that sways with it.
  let phase = 0
  let last = 0
  let walk = 0
  // How hard it thrashes as it burns (setBurn).
  let thrash = 0
  const hemBase = hem.map((m) => m.rotation.x)
  const update = (t: number, speed = 0) => {
    // A blink across the chamber is no stride.
    const pace = Math.min(speed, 5)
    const dt = Math.min(0.1, Math.max(0, t - last))
    last = t
    // How far into a walk it is, eased so a stop settles.
    const target = Math.min(1, pace / 1.2)
    walk += (target - walk) * Math.min(1, dt * 4)
    phase += (pace * dt * Math.PI * 2) / STRIDE
    const step = Math.sin(phase)
    // Each foot comes down hard: the body drops and rolls onto it.
    const fall = Math.abs(Math.cos(phase))
    body.position.y = walk * (fall * 0.09 - 0.06)
    body.rotation.z = walk * step * 0.06
    legs[0].rotation.x = walk * step * 0.4
    legs[1].rotation.x = -walk * step * 0.4
    // It breathes, slow and deep.
    const breath = Math.sin(t * 1.1)
    trunk.rotation.x = 0.16 + breath * 0.015 + walk * 0.08
    trunk.scale.set(1 + breath * 0.012, 1, 1 + breath * 0.02)
    // The head sits cocked, drifts, and now and then jerks.
    const beat = Math.floor(t / 1.7 + seed)
    const into = t / 1.7 + seed - beat
    const jerk =
      hash(beat) < 0.3 && into < TWITCH
        ? Math.sin((into / TWITCH) * Math.PI)
        : 0
    head.rotation.z = 0.16 + Math.sin(t * 0.31) * 0.05 + jerk * 0.3
    head.rotation.y = Math.sin(t * 0.23) * 0.12 - jerk * 0.22
    head.rotation.x = 0.22 + Math.sin(t * 0.4) * 0.04
    // The arms hang dead and swing only with the step; the cleaver's
    // weight holds the right one back.
    right.shoulder.rotation.x = -walk * step * 0.12 + 0.05
    left.shoulder.rotation.x = walk * step * 0.3 + Math.sin(t * 0.9) * 0.03
    cleaver.rotation.x = DRAG + walk * 0.05 + Math.sin(phase * 2) * walk * 0.03
    links.forEach((m, i) => {
      m.rotation.x = Math.sin(t * 1.3 + i * 0.4) * (0.06 + walk * 0.1)
    })
    chain.rotation.x = Math.sin(t * 1.1) * 0.08 + walk * step * 0.25
    // Burning, it thrashes: the arms flung up and about, the legs
    // kicking, the trunk heaving.
    if (thrash > 0) {
      right.shoulder.rotation.x += Math.sin(t * 9.1) * 1.1 * thrash
      right.shoulder.rotation.z += Math.sin(t * 7.3 + 1) * 0.6 * thrash
      left.shoulder.rotation.x += Math.sin(t * 10.2 + 2) * 1.1 * thrash
      left.shoulder.rotation.z -= Math.sin(t * 8.1) * 0.6 * thrash
      legs[0].rotation.x += Math.sin(t * 8.7) * 0.5 * thrash
      legs[1].rotation.x += Math.sin(t * 9.4 + 2) * 0.5 * thrash
      trunk.rotation.z = Math.sin(t * 5.2) * 0.2 * thrash
    }
    hem.forEach((m, i) => {
      m.rotation.x =
        hemBase[i] + Math.sin(t * 1.6 + i * 1.3) * 0.08 + walk * step * 0.15
    })
  }
  update(0)
  return {
    group,
    update,
    setBurn(next) {
      const burn = Math.max(0, Math.min(1, next))
      thrash = burn * burn
      coat.color.copy(COAT).lerp(PALE, burn)
      coat.opacity = 0.96 - burn * 0.4
      for (const { m, from } of lit) m.color.copy(from).lerp(PALE, burn)
    },
  }
}
