import * as THREE from 'three'
import {
  isMesh,
  makeGlowSprite,
  makeGlowTexture,
  meshBounds,
} from './assetkit.ts'
import { context2d } from './canvas.ts'
import { applyPose, buildFigure } from './figure.ts'
import { blendPose, JOINTS, samplePose, strideOf, stridePose } from './poses.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'
import type { Figure } from './figure.ts'
import type { JointName, PoseSample, Rotation } from './poses.ts'

// --- Shadowman -----------------------------------------------------------

// A shadowman (shadowmen.ts): the raiders' own jointed body (figure.ts) in
// the shadow outfit, hooded, its arms and legs too long, all of it one flat
// unlit black, `height` metres to the top of the hood. Each one stands a
// little crooked its own way, drawn from `seed` (its id), so it looks the
// same on every client. Like the cards it was drawn as before, it is
// flaky: its parts are shot through with holes a few centimetres square
// that the night shows through, a few of them coming and going all the
// time and more opening as it burns (`flaky`), and a thin pixelated smoke
// comes off it. Origin on the ground between its feet, facing +Z.
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
  // Frees what is its own: the body's material, the aura's and its
  // smoke's puffs. The geometry is figure.ts's, shared by every body, and
  // stays, and so do the smoke's material and texture, shared by all.
  dispose(): void
}

const BODY = new THREE.Color('#07080c')
const BURNING = new THREE.Color('#6b6e78')
// The raiders' height: a body this much taller strides this much further
// (poses.ts strideOf), walking or, rushing, running.
const RAIDER_HEIGHT = 1.8

// The holes: the side of one in the body's own metres (before it is
// scaled up), how much of it is holes standing still, how much more comes
// and goes, how many times a second those shuffle, and how much more of it
// a burn takes to bursting.
// How far it thrashes as it burns, radians at the last of its burn: its
// arms forward and back and out, its elbows, its kicks from the hip and
// the knees, and the spine's writhing.
const THRASH = {
  arm: 1.4,
  fling: 0.9,
  elbow: 0.8,
  kick: 0.8,
  knee: 1,
  writhe: 0.35,
}
const FLAKE = { cell: 0.035, holes: 0.16, boil: 0.07, hz: 9, burnt: 0.3 }

// The smoke: how many puffs a body gives off, how long each climbs, how
// far (in heights of a body), how big (metres, the same for every body,
// since they share the material), and how dark.
const SMOKE = { puffs: 18, seconds: 2.6, rise: 0.3, size: 0.45, shade: 0.17 }

interface Flakes {
  time: { value: number }
  amount: { value: number }
}

// Holes punched through a material: each cell of its parts' own space
// is dropped by a hash of the cell and the body's seed, so the holes ride
// the limbs and look the same on every client. Laid over whatever the
// material compiles to already (ps1.ts applyPS1's wobble).
function flaky(material: THREE.Material, seed: number): Flakes {
  const flakes: Flakes = {
    time: { value: 0 },
    amount: { value: FLAKE.holes },
  }
  const before = material.onBeforeCompile.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer)
    shader.uniforms.uFlakeTime = flakes.time
    shader.uniforms.uFlakeAmount = flakes.amount
    shader.uniforms.uFlakeSeed = { value: (seed % 997) + 0.5 }
    shader.vertexShader =
      'varying vec3 vFlake;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFlake = position;'
      )
    shader.fragmentShader =
      [
        'varying vec3 vFlake;',
        'uniform float uFlakeTime;',
        'uniform float uFlakeAmount;',
        'uniform float uFlakeSeed;',
        'float flakeHash(vec3 c) {',
        '  return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
        '}',
      ].join('\n') +
      '\n' +
      shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        [
          '#include <clipping_planes_fragment>',
          `vec3 flakeCell = floor(vFlake / ${FLAKE.cell.toFixed(3)}) + uFlakeSeed;`,
          'if (flakeHash(flakeCell) < uFlakeAmount) discard;',
          'float flakeBeat = floor(uFlakeTime * ' +
            FLAKE.hz.toFixed(1) +
            ' + flakeHash(flakeCell.zyx) * 7.0);',
          `if (flakeHash(flakeCell + flakeBeat * 13.1) < ${FLAKE.boil.toFixed(3)}) discard;`,
        ].join('\n')
      )
  }
  material.needsUpdate = true
  return flakes
}

// A puff of the smoke: a ragged blot of a few big pixels, drawn once and
// shared, so it stays chunky however near it comes.
let puffTexture: THREE.CanvasTexture | null = null
let smokeMaterial: THREE.PointsMaterial | null = null
function smokeMaterialOf(): THREE.PointsMaterial {
  if (smokeMaterial) return smokeMaterial
  const side = 8
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const ctx = context2d(canvas)
  const rng = mulberry32(0x5e0c)
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const d = Math.hypot(x + 0.5 - side / 2, y + 0.5 - side / 2) / (side / 2)
      const a = (1 - d) * range(rng, 0.4, 1.4)
      if (a < 0.25) continue
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, a).toFixed(2)})`
      ctx.fillRect(x, y, 1, 1)
    }
  }
  puffTexture = new THREE.CanvasTexture(canvas)
  puffTexture.magFilter = THREE.NearestFilter
  puffTexture.minFilter = THREE.NearestFilter
  smokeMaterial = new THREE.PointsMaterial({
    map: puffTexture,
    size: SMOKE.size,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  })
  return smokeMaterial
}

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
  const flakes = flaky(skin, seed)

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

  // The smoke: puffs rising off it from anywhere on the body, each on its
  // own beat, thick as it leaves and thinning to nothing as it climbs.
  const puffs = Array.from({ length: SMOKE.puffs }, (_, k) => {
    const rng = mulberry32(seed + k * 7919)
    return {
      offset: (k + rng()) / SMOKE.puffs,
      x: range(rng, -0.18, 0.18),
      y: range(rng, 0.25, 0.95),
      z: range(rng, -0.1, 0.1),
      drift: range(rng, -0.25, 0.25),
    }
  })
  const smokeGeo = new THREE.BufferGeometry()
  smokeGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(puffs.length * 3), 3)
  )
  smokeGeo.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(puffs.length * 4), 4)
  )
  const smoke = new THREE.Points(smokeGeo, smokeMaterialOf())
  smoke.name = 'shadowman-smoke'
  // The puffs move every frame; their bounds would go stale.
  smoke.frustumCulled = false
  group.add(smoke)

  const crook = crookOf(seed)
  const scaled = height / RAIDER_HEIGHT
  // Its own small tremor, out of step with every other.
  const tremor = mulberry32(seed ^ 0x7e3)() * 10
  let cycle = 0
  let time = 0

  return {
    group,
    update({ dt, speed, burn, perception, windup = 0, lunge = 0, sight = 1 }) {
      time += dt
      // Its pace as a raider's, for a body its size.
      const pace = speed / scaled
      cycle += (pace * dt) / strideOf(pace)
      const walking = Math.min(1, pace / 0.8)
      const slam = Math.sin(Math.PI * Math.min(1, Math.max(0, lunge)))
      const rear = Math.min(1, Math.max(0, windup))
      let pose = blendPose(STAND, stridePose(cycle, pace), walking)
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
      // Burning, it thrashes: arms flung about, legs kicking, the spine
      // writhing, wilder the nearer it is to bursting.
      const thrash = burn * burn
      if (thrash > 0) {
        const j = figure.joints
        j.shoulderL.rotation.x += Math.sin(t * 13.1) * THRASH.arm * thrash
        j.shoulderL.rotation.z += Math.sin(t * 8.7 + 2) * THRASH.fling * thrash
        j.shoulderR.rotation.x += Math.sin(t * 12.3 + 1) * THRASH.arm * thrash
        j.shoulderR.rotation.z -= Math.sin(t * 9.9) * THRASH.fling * thrash
        j.elbowL.rotation.x += Math.sin(t * 17.2) * THRASH.elbow * thrash
        j.elbowR.rotation.x += Math.sin(t * 15.8 + 2) * THRASH.elbow * thrash
        j.hipL.rotation.x += Math.sin(t * 10.4) * THRASH.kick * thrash
        j.hipR.rotation.x += Math.sin(t * 11.2 + 3) * THRASH.kick * thrash
        j.kneeL.rotation.x +=
          Math.abs(Math.sin(t * 14.1)) * THRASH.knee * thrash
        j.kneeR.rotation.x +=
          Math.abs(Math.sin(t * 12.6 + 1)) * THRASH.knee * thrash
        j.spine.rotation.z += Math.sin(t * 6.1) * THRASH.writhe * thrash
        j.spine.rotation.x +=
          Math.sin(t * 5.3 + 1) * THRASH.writhe * 0.6 * thrash
      }
      skin.color.lerpColors(BODY, BURNING, burn)
      flakes.time.value = time + tremor
      flakes.amount.value = FLAKE.holes + FLAKE.burnt * burn
      const at = smokeGeo.getAttribute('position') as THREE.BufferAttribute
      const color = smokeGeo.getAttribute('color') as THREE.BufferAttribute
      const shade = SMOKE.shade + 0.25 * burn
      puffs.forEach((puff, i) => {
        const age = time / SMOKE.seconds + puff.offset
        const life = age - Math.floor(age)
        const rise = SMOKE.rise * life * height
        at.setXYZ(
          i,
          (puff.x + puff.drift * life) * height * 0.4,
          puff.y * height + rise,
          (puff.z + puff.drift * life * 0.5) * height * 0.4
        )
        const alpha = 0.7 * Math.min(1, life * 5) * (1 - life)
        color.setXYZW(i, shade, shade, shade * 1.1, alpha)
      })
      at.needsUpdate = true
      color.needsUpdate = true
      aura.material.opacity = perception ? 0.5 * sight : 0
    },
    dispose() {
      skin.dispose()
      aura.material.dispose()
      smokeGeo.dispose()
    },
  }
}
