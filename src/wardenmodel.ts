import * as THREE from 'three'
import { adder, joint, lambert } from './assetkit.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'
import { buildShadowSmoke, flakeAmount, flaky } from './shadowmanmodel.ts'
import type { FoeRig } from './assetkit.ts'

// The Warden (undercroftfoes.ts): a heavy man a head and a half taller
// than any raider (2.4 m), thick through the chest and the shoulders but
// built like a man, its face shut in a riveted iron helm with one red slit
// and a padlock at the jaw, a black coat over a butcher's apron, long grey
// arms hanging nearly to its knees, a rusted butcher's cleaver dragged in
// one hand and a hooked chain in the other. Its coat and its flesh are
// shot through with the shadowmen's holes and give off their smoke
// (shadowmanmodel.ts flaky, buildShadowSmoke); what it wears and carries,
// the iron, the leather, the blade, is whole. Origin at the floor under
// it, facing +Z.
// update takes how fast it is walking (m/s): its heavy step is drawn from
// it, never a run. setBurn pales it and shakes it as a beam burns it; it
// never flails, it convulses: a tremor through all of it, its arms
// wrenched out and its elbows locking in jerks it holds a beat, its head
// snapping back and aside, its back arching and its knees giving.

// The Warden's finishes. The coat is unlit black, a hole in the dark the
// way the rats are; the flesh, the leather and the iron are lit, so a
// flashlight finds the grey of its arms and the rust on its blade.
const COAT = new THREE.Color('#050506')
const FLESH = new THREE.Color('#77716a')
const LEATHER = new THREE.Color('#2e2219')
const PALE = new THREE.Color('#9aa0aa')

// How far one stride carries it, and how long a twitch of the head lasts.
const STRIDE = 1.7
const TWITCH = 0.18
// How long a spasm takes to snap in; it then holds and slackens over the
// rest of its beat.
const SNAP = 0.05

// A cheap hash of an integer, 0..1, for the twitches.
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

// A spasm at `t`: beats of `every` seconds, each struck at random with
// `odds`, snapping in over SNAP, held, then slackening by its end. Signed
// and sized by the beat, -1..1; 0 between spasms. `salt` keeps one limb's
// beats from another's.
function spasm(t: number, every: number, odds: number, salt: number): number {
  const b = t / every + salt
  const beat = Math.floor(b)
  if (hash(beat + salt * 31) >= odds) return 0
  const into = (b - beat) * every
  const hold =
    into < SNAP ? into / SNAP : 1 - ((into - SNAP) / (every - SNAP)) ** 3
  const size = 0.5 + hash(beat * 3 + salt) * 0.5
  return (hash(beat * 7 + salt) < 0.5 ? -1 : 1) * size * Math.max(0, hold)
}

export function buildWarden(seed = 0x7e11): FoeRig {
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

  // The shadowmen's holes through its coat and its flesh.
  const flakes = [flaky(coat, seed), flaky(flesh, seed + 1)]

  // Everything above the hips rides on `body`, which bobs and rolls with
  // the step; the legs swing under it from the hips.
  const body = joint(group, [0, 0, 0], 'warden-body')
  const hips = 1.15
  const legs: THREE.Group[] = []
  for (const x of [-0.15, 0.15]) {
    const leg = joint(body, [x, hips, 0], `warden-leg-${x < 0 ? 'l' : 'r'}`)
    add(
      new THREE.CylinderGeometry(0.13, 0.09, hips - 0.1, 6),
      coat,
      [0, -(hips - 0.1) / 2, 0],
      [0, 0, 0],
      leg
    )
    // A heavy iron-shod boot.
    add(
      new THREE.BoxGeometry(0.16, 0.13, 0.32),
      iron,
      [0, -hips + 0.065, 0.05],
      [0, 0, 0],
      leg
    )
    legs.push(leg)
  }

  // The trunk, stooped forward from the hips: a deep chest under heavy,
  // sloping shoulders, the coat hanging from it to the knees.
  const trunk = joint(body, [0, hips, 0], 'warden-trunk')
  trunk.rotation.x = 0.16
  add(
    new THREE.CylinderGeometry(0.35, 0.28, 0.72, 7),
    coat,
    [0, 0.38, 0],
    [0, Math.PI / 7, 0],
    trunk
  )
  // The shoulders, sloping into the neck.
  for (const x of [-0.23, 0.23]) {
    add(
      new THREE.BoxGeometry(0.32, 0.17, 0.4),
      coat,
      [x, 0.72, -0.02],
      [0, 0, x < 0 ? 0.3 : -0.3],
      trunk
    )
  }
  // Iron plates riveted to each shoulder.
  for (const x of [-0.34, 0.34]) {
    add(
      new THREE.BoxGeometry(0.2, 0.05, 0.32),
      iron,
      [x, 0.77, -0.02],
      [0, 0, x < 0 ? 0.42 : -0.42],
      trunk
    )
  }
  // The skirt of the coat, open at the front, and the ragged strips that
  // hang off its hem and stir as it walks.
  add(
    new THREE.CylinderGeometry(0.3, 0.39, 0.62, 7, 1, true),
    coat,
    [0, -0.27, -0.02],
    [0, 0, 0],
    trunk
  )
  // Round the back and sides only (a, from +Z): the apron is the front.
  const hem: THREE.Mesh[] = []
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * 0.3 + (i / 10) * Math.PI * 1.4
    const long = range(rng, 0.1, 0.26)
    const strip = add(
      new THREE.BoxGeometry(range(rng, 0.06, 0.12), long, 0.02),
      coat,
      [Math.sin(a) * 0.38, -0.58 - long / 2, Math.cos(a) * 0.38 - 0.02],
      [0, a, 0],
      trunk
    )
    hem.push(strip)
  }
  // The apron over the front, stiff with what has dried on it, on a
  // strap round the neck.
  add(
    new THREE.BoxGeometry(0.48, 1.12, 0.03),
    leather,
    [0, 0.08, 0.33],
    [-0.05, 0, 0],
    trunk
  )
  for (let i = 0; i < 5; i++) {
    add(
      new THREE.BoxGeometry(
        range(rng, 0.06, 0.18),
        range(rng, 0.06, 0.3),
        0.01
      ),
      blood,
      [range(rng, -0.18, 0.18), range(rng, -0.35, 0.45), 0.348],
      [-0.05, 0, range(rng, -0.5, 0.5)],
      trunk
    )
  }
  for (const x of [-0.1, 0.1]) {
    add(
      new THREE.BoxGeometry(0.035, 0.3, 0.025),
      leather,
      [x, 0.72, 0.25],
      [-0.5, 0, x < 0 ? 0.25 : -0.25],
      trunk
    )
  }

  // The head, shut in iron: a thick neck, then the helm, a heavy wedge
  // wider at the jaw than at the crown, its seams riveted, one slit across
  // it with the red behind, nails driven into it, and a padlock through
  // the hasp at its chin. It hangs forward to look down at whoever it
  // finds, a little to one side, as if listening. The helm is drawn at
  // over twice its size inside `skull`, which shrinks it.
  add(
    new THREE.CylinderGeometry(0.1, 0.13, 0.14, 6),
    flesh,
    [0, 0.8, 0.03],
    [0, 0, 0],
    trunk
  )
  const head = joint(trunk, [0, 0.86, 0.04], 'warden-head')
  const skull = joint(head, [0, 0, 0], 'warden-skull')
  skull.scale.setScalar(0.44)
  const helm = add(
    new THREE.CylinderGeometry(0.26, 0.48, 1.0, 4, 1),
    iron,
    [0, 0.48, 0],
    [0, Math.PI / 4, 0],
    skull
  )
  helm.name = 'warden-helm'
  // The helm's front face, z at height y on it.
  const face = (y: number) => 0.352 - ((y + 0.02) / 1.0) * 0.156
  add(
    new THREE.BoxGeometry(0.4, 0.06, 0.4),
    iron,
    [0, 0.99, 0],
    [0, 0, 0],
    skull
  )
  for (let row = 0; row < 3; row++) {
    const y = 0.15 + row * 0.27
    for (let i = 0; i < 4; i++) {
      add(
        new THREE.BoxGeometry(0.04, 0.04, 0.04),
        rust,
        [(-0.24 + i * 0.16) * (1 - row * 0.2), y, face(y)],
        [0, 0, 0],
        skull
      )
    }
  }
  add(
    new THREE.BoxGeometry(0.36, 0.03, 0.02),
    slit,
    [0, 0.55, face(0.55) + 0.006],
    [-0.15, 0, 0],
    skull
  )
  // Long nails driven into it, crooked, from the crown and the sides.
  for (let i = 0; i < 6; i++) {
    const a = range(rng, -Math.PI, Math.PI)
    const up = range(rng, 0.45, 0.95)
    const long = range(rng, 0.35, 0.6)
    const nail = joint(
      skull,
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
    skull
  )
  add(
    new THREE.BoxGeometry(0.17, 0.19, 0.08),
    rust,
    [0, -0.13, 0.37],
    [0, 0, 0],
    skull
  )
  add(
    new THREE.TorusGeometry(0.06, 0.017, 3, 8, Math.PI),
    iron,
    [0, -0.03, 0.37],
    [0, 0, 0],
    skull
  )

  // The arms: from the shoulder in the coat's black, then bare grey
  // forearms, long, the hands hanging nearly to its knees.
  const arm = (
    side: -1 | 1
  ): { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group } => {
    const shoulder = joint(trunk, [side * 0.4, 0.7, 0], `warden-arm-${side}`)
    shoulder.rotation.z = side * 0.1
    add(
      new THREE.CylinderGeometry(0.1, 0.085, 0.44, 6),
      coat,
      [0, -0.22, 0],
      [0, 0, 0],
      shoulder
    )
    const elbow = joint(shoulder, [0, -0.44, 0], `warden-elbow-${side}`)
    elbow.rotation.x = -0.15
    add(
      new THREE.CylinderGeometry(0.075, 0.055, 0.4, 6),
      flesh,
      [0, -0.2, 0],
      [0, 0, 0],
      elbow
    )
    const hand = joint(elbow, [0, -0.42, 0], `warden-hand-${side}`)
    add(
      new THREE.BoxGeometry(0.11, 0.13, 0.07),
      flesh,
      [0, -0.05, 0],
      [0, 0, 0],
      hand
    )
    // Fingers, long.
    for (let i = 0; i < 4; i++) {
      add(
        new THREE.BoxGeometry(0.02, 0.12, 0.022),
        flesh,
        [-0.036 + i * 0.024, -0.16, 0.015],
        [0.3, 0, 0],
        hand
      )
    }
    return { shoulder, elbow, hand }
  }
  const right = arm(1)
  const left = arm(-1)

  // In the right hand, a butcher's cleaver, heavy and over-long, out from
  // its side and back, its corner dragging on the floor.
  const DRAG = 0.45
  const cleaver = joint(right.hand, [0, -0.1, 0], 'warden-cleaver')
  cleaver.rotation.set(DRAG, 0, 0.22)
  add(
    new THREE.CylinderGeometry(0.025, 0.028, 0.26, 5),
    leather,
    [0, 0, 0],
    [0, 0, 0],
    cleaver
  )
  add(
    new THREE.BoxGeometry(0.03, 0.86, 0.3),
    rust,
    [0, -0.56, 0.08],
    [0, 0, 0],
    cleaver
  )
  add(
    new THREE.BoxGeometry(0.034, 0.8, 0.035),
    iron,
    [0, -0.56, 0.225],
    [0, 0, 0],
    cleaver
  )
  add(
    new THREE.BoxGeometry(0.036, 0.22, 0.18),
    blood,
    [0, -0.86, 0.1],
    [0, 0, 0],
    cleaver
  )

  // In the left, a chain to the floor with a meat hook on its end.
  const chain = joint(left.hand, [0, -0.12, 0.02], 'warden-chain')
  const links: THREE.Mesh[] = []
  for (let i = 0; i < 11; i++) {
    links.push(
      add(
        new THREE.TorusGeometry(0.035, 0.01, 3, 6),
        iron,
        [0, -i * 0.065, 0],
        [0, i % 2 ? Math.PI / 2 : 0, 0],
        chain
      )
    )
  }
  add(
    new THREE.TorusGeometry(0.08, 0.015, 3, 7, Math.PI * 1.4),
    rust,
    [0, -0.78, 0.05],
    [0, Math.PI / 2, Math.PI * 0.8],
    chain
  )

  // The shadowmen's smoke, off its shoulders, its back and its arms.
  const smoke = buildShadowSmoke({
    seed,
    puffs: 22,
    from: { min: [-0.4, 0.9, -0.25], max: [0.4, 2.1, 0.25] },
    rise: 0.7,
    drift: 0.3,
  })
  group.add(smoke.points)
  let burnt = 0

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
    body.position.y = walk * (fall * 0.06 - 0.04)
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
    right.shoulder.rotation.z = 0.1
    left.shoulder.rotation.z = -0.1
    right.elbow.rotation.set(-0.15, 0, 0)
    left.elbow.rotation.set(-0.15, 0, 0)
    // Burning, it convulses rather than flails: a fine tremor through it
    // all, and spasms that wrench an arm out from its side and lock the
    // elbow, held a beat and let go; the head snaps back and aside, the
    // back arches against it, the knees give. Never a swing round.
    if (thrash > 0) {
      const odds = 0.25 + thrash * 0.6
      const tremor = (Math.sin(t * 41) + Math.sin(t * 67 + 1)) * 0.02 * thrash
      for (const [i, limb] of [right, left].entries()) {
        const side = i === 0 ? 1 : -1
        const out = Math.abs(spasm(t, 0.34, odds, 1 + i))
        const lift = spasm(t, 0.42, odds, 5 + i)
        limb.shoulder.rotation.z += side * out * 0.75 * thrash + tremor
        limb.shoulder.rotation.x += -Math.abs(lift) * 0.5 * thrash - tremor
        limb.elbow.rotation.x =
          -0.15 - Math.abs(spasm(t, 0.27, odds, 9 + i)) * 0.9 * thrash
      }
      const snap = spasm(t, 0.5, odds, 13)
      head.rotation.z += snap * 0.55 * thrash
      head.rotation.x -= Math.abs(spasm(t, 0.6, odds, 17)) * 0.7 * thrash
      head.rotation.y += tremor * 4
      const arch = Math.abs(spasm(t, 0.7, odds, 21))
      trunk.rotation.x -= arch * 0.35 * thrash
      trunk.rotation.z = snap * 0.08 * thrash + tremor
      // The knees give: it sinks and catches itself.
      body.position.y -= Math.abs(spasm(t, 0.8, odds * 0.7, 25)) * 0.08 * thrash
    } else {
      trunk.rotation.z = 0
    }
    hem.forEach((m, i) => {
      m.rotation.x =
        hemBase[i] + Math.sin(t * 1.6 + i * 1.3) * 0.08 + walk * step * 0.15
    })
    for (const f of flakes) f.time.value = t + (seed % 10)
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
      for (const f of flakes) f.amount.value = flakeAmount(burn)
      coat.color.copy(COAT).lerp(PALE, burn)
      coat.opacity = 0.96 - burn * 0.4
      for (const { m, from } of lit) m.color.copy(from).lerp(PALE, burn)
    },
  }
}
