import * as THREE from 'three'
import { makeGlowSprite, makeGlowTexture, mergeStatic } from './assetkit.ts'
import { mulberry32, range } from './rng.ts'

// --- Shadow spider -------------------------------------------------------

// A shadow spider (shadowmen.ts, CONFIG.shadowmen.spider): a spider of the
// same black as the shadowmen, `height` metres to the tops of its knees,
// twice a shadowman. Its body hangs at about half that height under eight
// legs that arch up high over it and come down far out round it. A ragged
// abdomen bristles behind; a cluster of eight red eyes and two fangs face
// forward, +Z. The eyes glow through the fog, so it is seen first by
// them. Origin on the ground under its body. update() walks the legs in two
// alternating sets at `speed` (m/s), lifts and sways the body with them,
// pales it toward grey as it burns in a beam (0 to 1), and shows the
// violet aura while a joint is working. `sight` (0 to 1, 1 if left out)
// fades the eyes and the aura that ignore the fog, for one far off.
export interface ShadowSpider {
  group: THREE.Group
  // windup: how far through winding up to strike (0 to 1), rearing with
  // its front legs raised; lunge: how far through the lunge (0 to 1), the
  // front slammed down and forward. Both 0 when it is not striking.
  update(frame: {
    dt: number
    speed: number
    burn: number
    perception: boolean
    windup?: number
    lunge?: number
    sight?: number
  }): void
}

// Each leg as it stands, in multiples of the height: how far round from
// straight ahead its foot comes down (radians, per side), how far out,
// and which of the two alternating sets it walks in.
const SPIDER_LEGS: readonly { turn: number; reach: number; set: 0 | 1 }[] = [
  { turn: 0.55, reach: 0.82, set: 0 },
  { turn: 1.15, reach: 0.78, set: 1 },
  { turn: 1.95, reach: 0.78, set: 0 },
  { turn: 2.55, reach: 0.86, set: 1 },
]

const UP_Y = new THREE.Vector3(0, 1, 0)
const SPIDER_BODY = new THREE.Color('#050608')
const SPIDER_BURNING = new THREE.Color('#6b6e78')

export function buildShadowSpider(height = 5.6, seed = 0x5b1d): ShadowSpider {
  const rng = mulberry32(seed)
  const H = height
  const group = new THREE.Group()
  group.name = 'shadow-spider'
  const skin = new THREE.MeshBasicMaterial({ color: SPIDER_BODY })
  // The body sways on its own pivot; the legs reach to it every frame.
  const body = new THREE.Group()
  group.add(body)
  const bodyY = 0.52 * H
  body.position.y = bodyY

  const blob = (
    r: number,
    scale: [number, number, number],
    at: [number, number, number]
  ) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), skin)
    mesh.scale.set(...scale)
    mesh.position.set(...at)
    body.add(mesh)
    return mesh
  }
  // The head and the great abdomen behind it, raised a little.
  blob(0.11 * H, [1, 0.72, 1.2], [0, 0, 0.1 * H])
  const abdomen = blob(0.19 * H, [1, 0.85, 1.3], [0, 0.07 * H, -0.24 * H])
  abdomen.rotation.x = -0.25
  // Bristles off the abdomen: a ragged edge against the sky.
  const bristle = new THREE.ConeGeometry(0.012 * H, 0.09 * H, 3)
  bristle.translate(0, 0.045 * H, 0)
  for (let i = 0; i < 46; i++) {
    const mesh = new THREE.Mesh(bristle, skin)
    const u = range(rng, -1, 1)
    const a = range(rng, 0, Math.PI * 2)
    const s = Math.sqrt(1 - u * u)
    const dir = new THREE.Vector3(
      Math.cos(a) * s,
      Math.abs(u) * 0.9 + 0.1,
      Math.sin(a) * s
    )
    mesh.position.set(
      dir.x * 0.18 * H,
      0.07 * H + dir.y * 0.16 * H,
      -0.24 * H + dir.z * 0.24 * H
    )
    mesh.quaternion.setFromUnitVectors(UP_Y, dir.normalize())
    mesh.scale.setScalar(range(rng, 0.6, 1.5))
    body.add(mesh)
  }
  // Two fangs, curling down and in under the head.
  const fang = new THREE.ConeGeometry(0.018 * H, 0.12 * H, 4)
  fang.rotateX(Math.PI)
  fang.translate(0, -0.06 * H, 0)
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(fang, skin)
    mesh.position.set(side * 0.035 * H, -0.04 * H, 0.21 * H)
    mesh.rotation.set(-0.35, 0, side * 0.25)
    body.add(mesh)
  }
  // The head, the abdomen, its bristles and the fangs never move against
  // the body: one draw for the lot. The eyes and the legs stay their own.
  mergeStatic(body)

  // The eyes: two big ones, two beside them, and four small over them, a
  // red that ignores the fog, each with a glow.
  const eye = new THREE.MeshBasicMaterial({
    color: '#ff2414',
    fog: false,
    transparent: true,
  })
  const glow = makeGlowTexture('rgba(255, 40, 20, 0.9)')
  const eyes: [number, number, number][] = [
    [-0.03, 0.03, 0.022],
    [0.03, 0.03, 0.022],
    [-0.065, 0.045, 0.014],
    [0.065, 0.045, 0.014],
    [-0.022, 0.07, 0.01],
    [0.022, 0.07, 0.01],
    [-0.05, 0.075, 0.009],
    [0.05, 0.075, 0.009],
  ]
  const glows: THREE.Sprite[] = []
  for (const [x, y, r] of eyes) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r * H, 6, 4), eye)
    mesh.position.set(x * H, y * H, 0.215 * H)
    body.add(mesh)
    const halo = makeGlowSprite(glow, r * H * 7)
    halo.material.fog = false
    halo.position.copy(mesh.position)
    halo.position.z += r * H
    body.add(halo)
    glows.push(halo)
  }

  // The perception aura: a violet bloom over the whole of it.
  const aura = makeGlowSprite(
    makeGlowTexture('rgba(139, 92, 246, 0.55)'),
    1.6 * H
  )
  aura.material.opacity = 0
  aura.material.fog = false
  aura.position.y = bodyY
  group.add(aura)

  // The legs: three segments each, hip to knee, knee to ankle, ankle to
  // foot, laid between their joints every frame.
  const segment = (r0: number, r1: number) => {
    const geometry = new THREE.CylinderGeometry(r1 * H, r0 * H, 1, 5)
    geometry.translate(0, 0.5, 0)
    return geometry
  }
  const femur = segment(0.03, 0.022)
  const tibia = segment(0.021, 0.012)
  const tarsus = segment(0.012, 0.004)
  const legs = SPIDER_LEGS.flatMap(({ turn, reach, set }) =>
    [-1, 1].map((side) => {
      const parts = [femur, tibia, tarsus].map((g) => {
        const mesh = new THREE.Mesh(g, skin)
        group.add(mesh)
        return mesh
      })
      // Each side's sets are swapped, so the four on the ground at once
      // straddle the body.
      return {
        side,
        turn: side * turn,
        reach: reach * H,
        set: side < 0 ? set : 1 - set,
        hipTurn: side * (0.35 + turn * 0.45),
        parts,
      }
    })
  )
  const hip = new THREE.Vector3()
  const knee = new THREE.Vector3()
  const ankle = new THREE.Vector3()
  const foot = new THREE.Vector3()
  const along = new THREE.Vector3()
  const lay = (mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) => {
    along.subVectors(to, from)
    const length = along.length()
    mesh.position.copy(from)
    mesh.quaternion.setFromUnitVectors(UP_Y, along.divideScalar(length || 1))
    mesh.scale.set(1, length, 1)
  }

  let phase = range(rng, 0, Math.PI * 2)
  let shown = 0
  const update: ShadowSpider['update'] = ({
    dt,
    speed,
    burn,
    perception,
    windup = 0,
    lunge = 0,
    sight = 1,
  }) => {
    // A stride a little longer the faster it goes, and steps to match.
    const pace = Math.min(1, speed / 8)
    const stride = (0.08 + 0.12 * pace) * H
    if (speed > 0) phase += (dt * speed) / (stride * 0.9)
    // Standing still, it settles and its legs twitch.
    shown += (pace - shown) * Math.min(1, dt * 4)
    const lift = 0.1 * H * Math.max(0.15, shown)
    // Striking: rearing back over the windup, then the lunge throws the
    // front down and forward and lets it settle.
    const rear = Math.min(1, Math.max(0, windup))
    const slam = Math.sin(Math.PI * Math.min(1, Math.max(0, lunge)))
    body.position.y =
      bodyY +
      Math.sin(phase * 2) * 0.012 * H * shown +
      0.1 * H * rear -
      0.05 * H * slam
    body.position.z = -0.06 * H * rear + 0.22 * H * slam
    body.rotation.z = Math.sin(phase) * 0.04 * shown
    body.rotation.x =
      Math.sin(phase * 2 + 1) * 0.02 * shown - 0.5 * rear + 0.3 * slam
    body.updateMatrix()
    for (const [i, leg] of legs.entries()) {
      const p = phase + leg.set * Math.PI
      const swing = Math.sin(p) * stride * Math.max(0.2, shown)
      // The front pair raised over the windup, then struck down ahead.
      const front = i < 2
      const up = Math.max(0, Math.cos(p)) * lift + (front ? 0.45 * H * rear : 0)
      hip
        .set(
          Math.sin(leg.hipTurn) * 0.08 * H,
          0,
          Math.cos(leg.hipTurn) * 0.1 * H
        )
        .applyMatrix4(body.matrix)
      foot.set(
        Math.sin(leg.turn) * leg.reach * (front ? 1 - 0.4 * rear : 1),
        up,
        Math.cos(leg.turn) * leg.reach +
          swing +
          (front ? 0.12 * H * rear + 0.35 * H * slam : 0)
      )
      // The knee high over the leg, a third of the way out; the ankle low,
      // just short of the foot.
      knee.lerpVectors(hip, foot, 0.32)
      knee.y = H * (0.97 + 0.03 * Math.sin(p + 0.5)) - 0.4 * up
      ankle.lerpVectors(hip, foot, 0.9)
      ankle.y = foot.y + 0.16 * H
      lay(leg.parts[0], hip, knee)
      lay(leg.parts[1], knee, ankle)
      lay(leg.parts[2], ankle, foot)
    }
    skin.color.lerpColors(SPIDER_BODY, SPIDER_BURNING, Math.min(1, burn))
    // The eyes flare as it burns.
    for (const halo of glows) halo.material.opacity = (0.8 + 0.2 * burn) * sight
    eye.opacity = sight
    aura.material.opacity = perception ? 0.45 * sight : 0
  }
  update({ dt: 0, speed: 0, burn: 0, perception: false })
  return { group, update }
}

// Anything that strikes, over and over in Akashic: a stride, the windup,
// the lunge, a rest.
const STRIKE_LOOP = { walk: 1.2, windup: 0.35, lunge: 0.3, rest: 0.6 }

// Where a strike loop is at `t` seconds: the windup and lunge progress
// (0 to 1), and how fast it walks.
export function strikeLoopAt(t: number): {
  speed: number
  windup: number
  lunge: number
} {
  const { walk, windup, lunge, rest } = STRIKE_LOOP
  const at = t % (walk + windup + lunge + rest)
  if (at < walk) return { speed: 6, windup: 0, lunge: 0 }
  if (at < walk + windup) {
    return { speed: 0, windup: (at - walk) / windup, lunge: 0 }
  }
  if (at < walk + windup + lunge) {
    return { speed: 0, windup: 0, lunge: (at - walk - windup) / lunge }
  }
  return { speed: 0, windup: 0, lunge: 0 }
}
