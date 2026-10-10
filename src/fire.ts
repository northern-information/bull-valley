import * as THREE from 'three'
import {
  lambert,
  makeGlowSprite,
  makeGlowTexture,
  mergeStatic,
  setMotion,
} from './assetkit.ts'
import { applyPS1 } from './ps1.ts'
import { mulberry32, range } from './rng.ts'
import type { Vec3 } from './interfaces.ts'

// Weather and fire that never go out: Gron's raincloud, the flames Moab
// Coldë and his horse burn with (and the scroll, the halo and the wreck),
// and the fire roots that writhe over the ground at his feet.

// --- Raincloud -----------------------------------------------------------

// Gron's own weather: a low grey cloud that never leaves him, raining on
// him alone. Origin at the cloud's underside, where the rain starts; the
// drops fall `fall` metres, to the ground under it. update(t) moves the
// rain; call it every frame with a running time in seconds, or once with a
// fixed time to hold it still.
export interface Raincloud {
  group: THREE.Group
  update(t: number): void
}

// Metres a drop falls per second, and how many fall at once.
const RAIN_SPEED = 4.5
const RAIN_DROPS = 26

export function buildRaincloud(fall = 2.6, seed = 0x7a1c): Raincloud {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'raincloud'
  const shades = [lambert({ color: '#5a6069' }), lambert({ color: '#474c55' })]
  // A flattened cluster, wider than it is tall, its belly lowest.
  for (let i = 0; i < 7; i++) {
    const r = i === 0 ? 0.36 : range(rng, 0.2, 0.32)
    const a = (i / 7) * Math.PI * 2 + range(rng, -0.4, 0.4)
    const d = i === 0 ? 0 : range(rng, 0.22, 0.4)
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0),
      shades[i % shades.length]
    )
    puff.position.set(
      Math.cos(a) * d,
      r * 0.6 + range(rng, 0, 0.12),
      Math.sin(a) * d * 0.7
    )
    puff.scale.y = 0.7
    puff.rotation.set(range(rng, 0, Math.PI), range(rng, 0, Math.PI), 0)
    group.add(puff)
  }
  // The puffs in one draw a shade.
  mergeStatic(group)
  // The rain: thin streaks under the cloud, each starting at its own point
  // of the fall so the sheet never empties. One instanced mesh, each drop
  // its own matrix.
  const dropMat = new THREE.MeshBasicMaterial({
    color: '#9fb4c8',
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  })
  const dropGeo = new THREE.BoxGeometry(0.012, 0.18, 0.012)
  const rain = new THREE.InstancedMesh(dropGeo, dropMat, RAIN_DROPS)
  rain.name = 'rain'
  // The drops fall the whole column under the cloud; bounds set by hand,
  // since those computed from one moment would go stale.
  rain.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, -fall / 2, 0),
    fall / 2 + 0.6
  )
  group.add(rain)
  const drops = Array.from({ length: RAIN_DROPS }, () => {
    const a = range(rng, 0, Math.PI * 2)
    const d = Math.sqrt(rng()) * 0.42
    return { x: Math.cos(a) * d, z: Math.sin(a) * d * 0.7, phase: rng() }
  })
  const matrix = new THREE.Matrix4()
  const update = (t: number) => {
    drops.forEach(({ x, z, phase }, i) => {
      const along = ((t * RAIN_SPEED) / fall + phase) % 1
      rain.setMatrixAt(i, matrix.makeTranslation(x, -along * fall, z))
    })
    rain.instanceMatrix.needsUpdate = true
  }
  update(0)
  setMotion(group, update)
  return { group, update }
}

// --- Flames --------------------------------------------------------------

// Moab Coldë and his horse burn without burning down: tongues of flame
// that stand up off them, each a pair of low-poly cones (an orange skin
// round a yellow heart) over a soft halo, with sparks and smoke rising off
// them. Each tongue swells slowly and flickers a little over it, and its
// halo brightens and dims on its own phase. update(t) moves them; call it
// every frame with a running time, or once with a fixed time to hold them
// still.
export interface Flames {
  group: THREE.Group
  update(t: number): void
  // Stand the tongues back up when what they burn on tips by (x, z)
  // radians, so fire always rises.
  counter(x: number, z: number): void
}

// One tongue: its base [x, y, z] in the owner's space and its height in
// metres.
export interface FlameSpot {
  at: Vec3
  size: number
}

interface FlameParts {
  geometry: THREE.ConeGeometry
  skin: THREE.MeshBasicMaterial
  heart: THREE.MeshBasicMaterial
  halo: THREE.Texture
  spark: THREE.Texture
  smoke: THREE.Texture
}

// Unit cones with their base at the origin, shared by every tongue.
let flameParts: FlameParts | null = null
export function getFlameParts(): FlameParts {
  if (!flameParts) {
    const geometry = new THREE.ConeGeometry(0.5, 1, 5)
    geometry.translate(0, 0.5, 0)
    const flame = (color: string, opacity: number) =>
      applyPS1(
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
    flameParts = {
      geometry,
      skin: flame('#ff4a12', 0.85),
      heart: flame('#ffc23a', 0.9),
      halo: makeGlowTexture('rgba(255, 96, 32, 0.55)'),
      spark: makeGlowTexture('rgba(255, 255, 255, 1)'),
      smoke: makeGlowTexture('rgba(255, 255, 255, 0.9)'),
    }
  }
  return flameParts
}

// A tongue is this much narrower than it is tall, and its halo this many
// times its height across.
const FLAME_WIDTH = 0.45
const FLAME_HALO = 2.4

// What rises off a tongue, in multiples of its height: how many at once,
// how long one takes to rise, how high and how wide it goes, how much it
// flutters side to side, and its point size against the biggest tongue.
interface ParticleKind {
  perTongue: number
  seconds: number
  rise: number
  spread: number
  flutter: number
  size: number
  opacity: number
}

// Quick and bright: a spark flies up a few tongue heights and goes out.
const SPARKS: ParticleKind = {
  perTongue: 3,
  seconds: 1.3,
  rise: 4,
  spread: 0.9,
  flutter: 0.15,
  size: 0.12,
  opacity: 1,
}

// Slow and thin: smoke climbs higher, spreading as it thins.
const SMOKE: ParticleKind = {
  perTongue: 2,
  seconds: 4,
  rise: 7,
  spread: 1.6,
  flutter: 0.3,
  size: 1.1,
  opacity: 0.35,
}

export function buildFlames(
  spots: readonly FlameSpot[],
  seed = 0xf1a3
): Flames {
  const rng = mulberry32(seed)
  const { geometry, skin, heart, halo, spark, smoke } = getFlameParts()
  const group = new THREE.Group()
  group.name = 'flames'
  // Every tongue's skin in one draw and every heart in another: instanced
  // cones, each placed, turned and stretched by its own matrix.
  const skins = new THREE.InstancedMesh(geometry, skin, spots.length)
  const hearts = new THREE.InstancedMesh(geometry, heart, spots.length)
  group.add(skins, hearts)
  const tongues = spots.map(({ at, size }) => {
    // Each halo has its own material, so each one can dim on its own.
    const sprite = makeGlowSprite(halo, size * FLAME_HALO)
    sprite.position.set(at[0], at[1] + size * 0.35, at[2])
    group.add(sprite)
    return { at, sprite, size, phase: range(rng, 0, Math.PI * 2) }
  })
  // How far what they burn on has tipped (counter), undone on every tongue.
  const tip = new THREE.Euler()
  const tipped = new THREE.Quaternion()
  const turn = new THREE.Euler()
  const turned = new THREE.Quaternion()
  const where = new THREE.Vector3()
  const stretch = new THREE.Vector3()
  const matrix = new THREE.Matrix4()

  // Sparks and smoke rise off every tongue: a few of each per tongue, each
  // on its own point in its own cycle, so they never leave together. One
  // set of points for each, so the whole fire is two more draws.
  const rise = (kind: ParticleKind) =>
    tongues.flatMap((tongue) =>
      Array.from({ length: kind.perTongue }, (_, k) => ({
        tongue,
        offset: (k + rng()) / kind.perTongue,
        turn: range(rng, 0, Math.PI * 2),
      }))
    )
  const sparks = rise(SPARKS)
  const puffs = rise(SMOKE)
  const biggest = Math.max(...spots.map((s) => s.size), 0.05)
  // Where the tongues stand together, and how far anything off them goes.
  const middle = new THREE.Vector3()
  for (const { at } of spots) middle.add(where.set(...at))
  middle.divideScalar(Math.max(1, spots.length))
  const farthest = Math.max(
    ...spots.map(({ at }) => where.set(...at).distanceTo(middle)),
    0
  )
  const reach = Math.max(
    SPARKS.rise + SPARKS.spread + SPARKS.flutter,
    SMOKE.rise + SMOKE.spread + SMOKE.flutter
  )
  const extent = farthest + biggest * (0.6 + reach)
  const points = (
    count: number,
    channels: 3 | 4,
    material: THREE.PointsMaterial,
    name: string
  ) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(count * 3), 3)
    )
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(count * channels), channels)
    )
    const cloud = new THREE.Points(geometry, material)
    cloud.name = name
    // The points move every frame, so the bounds computed from them would
    // go stale; a sphere set by hand round the tongues, out to the top of
    // the highest rise and the widest spread, holds for culling.
    geometry.boundingSphere = new THREE.Sphere(middle, extent)
    group.add(cloud)
    return geometry
  }
  const sparkGeo = points(
    sparks.length,
    3,
    new THREE.PointsMaterial({
      map: spark,
      size: Math.max(0.025, biggest * SPARKS.size),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    'sparks'
  )
  const smokeGeo = points(
    puffs.length,
    4,
    new THREE.PointsMaterial({
      map: smoke,
      size: biggest * SMOKE.size,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    }),
    'smoke'
  )

  // Where a particle is `life` (0 to 1) of the way up its rise: drifting
  // round its own turn, which shifts every time it starts again.
  const place = (
    out: THREE.BufferAttribute,
    i: number,
    { tongue, turn }: { tongue: (typeof tongues)[number]; turn: number },
    kind: ParticleKind,
    life: number,
    cycle: number,
    t: number
  ) => {
    const { at, size } = tongue
    const a = turn + cycle * 2.4
    const spread = size * kind.spread * life
    out.setXYZ(
      i,
      at[0] +
        Math.cos(a) * spread +
        Math.sin(t * 3 + turn) * size * kind.flutter,
      at[1] + size * (0.6 + kind.rise * life),
      at[2] + Math.sin(a) * spread
    )
  }

  const update = (t: number) => {
    tongues.forEach(({ at, sprite, size, phase }, i) => {
      // A slow swell with a quicker flicker over it.
      const swell =
        0.84 +
        0.08 * Math.sin(t * 2.4 + phase) +
        0.05 * Math.sin(t * 5.3 + phase * 1.7) +
        0.03 * Math.sin(t * 9.1 + phase * 2.3)
      const w = size * FLAME_WIDTH * (1.1 - 0.2 * swell)
      turned.setFromEuler(
        turn.set(0, t * 0.9 + phase, 0.12 * Math.sin(t * 1.8 + phase))
      )
      turned.premultiply(tipped)
      where.set(...at)
      skins.setMatrixAt(
        i,
        matrix.compose(where, turned, stretch.set(w, size * swell, w))
      )
      // The heart is the skin at a little over half the size.
      hearts.setMatrixAt(
        i,
        matrix.compose(where, turned, stretch.multiplyScalar(0.55))
      )
      const glow = 0.5 + 0.5 * Math.sin(t * 1.2 + phase)
      sprite.material.opacity = 0.45 + 0.4 * glow
      sprite.scale.setScalar(size * FLAME_HALO * (0.9 + 0.15 * glow))
    })
    skins.instanceMatrix.needsUpdate = true
    hearts.instanceMatrix.needsUpdate = true
    const sparkAt = sparkGeo.getAttribute('position') as THREE.BufferAttribute
    const sparkColor = sparkGeo.getAttribute('color') as THREE.BufferAttribute
    sparks.forEach((p, i) => {
      const age = t / SPARKS.seconds + p.offset
      const life = age - Math.floor(age)
      place(sparkAt, i, p, SPARKS, life, Math.floor(age), t)
      // Additive: fading to black is fading out. Yellow cools to red.
      const heat = 1 - life
      sparkColor.setXYZ(i, heat, heat * (0.4 + 0.4 * heat), heat * 0.15)
    })
    const smokeAt = smokeGeo.getAttribute('position') as THREE.BufferAttribute
    const smokeColor = smokeGeo.getAttribute('color') as THREE.BufferAttribute
    puffs.forEach((p, i) => {
      const age = t / SMOKE.seconds + p.offset
      const life = age - Math.floor(age)
      place(smokeAt, i, p, SMOKE, life, Math.floor(age), t)
      // Thickening as it leaves the flame, thinning as it climbs.
      const alpha = SMOKE.opacity * Math.min(1, life * 5) * (1 - life)
      smokeColor.setXYZW(i, 0.42, 0.4, 0.4, alpha)
    })
    sparkAt.needsUpdate = true
    sparkColor.needsUpdate = true
    smokeAt.needsUpdate = true
    smokeColor.needsUpdate = true
  }
  const counter = (x: number, z: number) => {
    tipped.setFromEuler(tip.set(-x, 0, -z))
  }
  update(0)
  // Culled by where the tongues stand: they swell and sway a little past
  // these bounds, never far.
  skins.computeBoundingSphere()
  hearts.computeBoundingSphere()
  setMotion(group, update)
  return { group, update, counter }
}

// --- Fire roots ----------------------------------------------------------

// Cracks of fire spreading out over the ground from where Moab Coldë
// stands: roots that wander outward, fork, and thin to nothing, glowing on
// a soft pool of light, writhing slowly, with a pulse of heat running out
// along them.
// Origin on the ground at the middle; everything lies a hair over the
// ground, draped over it by `groundAt` (heights in the roots' own space;
// flat when left out), so the roots follow a sloping lot as they writhe. update(t) moves the pulse; call it every frame with a running time,
// or once with a fixed time to hold it still.
export interface FireRoots {
  group: THREE.Group
  update(t: number): void
}

// The roots, in metres and radians: how many leave the middle, how far a
// root runs before it gives out, its step, how much it wanders a step, how
// wide it starts and ends, and how often it forks.
const ROOTS = {
  count: 8,
  reach: [1.6, 3.0] as const,
  step: 0.22,
  wander: 0.35,
  width: [0.08, 0.022] as const,
  fork: 0.22,
  // Over the ground, clear of the lot without floating off it.
  lift: 0.04,
  // The pulse: how fast it runs outward (m/s), and its wavelength.
  pulseSpeed: 0.9,
  pulseLength: 1.6,
  pool: 6.5,
  // The writhe: every point of every root turns about the middle by up to
  // `twist` radians a metre out (so the tips swing widest), and runs a
  // little longer and shorter by up to `stretch` of its reach, each on a
  // slow wave that travels out along the roots. One smooth field over the
  // ground, so a fork never comes apart from its root.
  twist: 0.07,
  twistSeconds: 6.5,
  twistLength: 3.5,
  stretch: 0.05,
  stretchSeconds: 4.2,
  stretchLength: 2.2,
  // The ground under them, sampled once into a grid this many cells a
  // side over this span (wide enough for the pool and the writhe), and
  // read between samples as they move.
  grid: 28,
  span: 7.2,
}

// Heights in the roots' own space, from the origin's ground.
export type GroundAt = (x: number, z: number) => number

// `ground` sampled once on a grid round the origin; between samples, the
// blend of the four round the point. Off the grid, the nearest edge.
function groundGrid(ground: GroundAt): GroundAt {
  const n = ROOTS.grid
  const half = ROOTS.span / 2
  const cell = ROOTS.span / n
  const heights: number[] = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      heights.push(ground(-half + i * cell, -half + j * cell))
    }
  }
  const at = (i: number, j: number) => heights[j * (n + 1) + i]
  return (x, z) => {
    const u = Math.min(n, Math.max(0, (x + half) / cell))
    const v = Math.min(n, Math.max(0, (z + half) / cell))
    const i = Math.min(n - 1, Math.floor(u))
    const j = Math.min(n - 1, Math.floor(v))
    const fu = u - i
    const fv = v - j
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fu
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu
    return top + (bottom - top) * fv
  }
}

export function buildFireRoots(
  seed = 0xf007,
  ground: GroundAt = () => 0
): FireRoots {
  const heightAt = groundGrid(ground)
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'fire-roots'
  const positions: number[] = []
  // Each quad's distance out from the middle, for the pulse and the fade.
  const reachOf: number[] = []

  // One root: steps out from (x, z) heading `a`, `left` metres still to
  // run, `from` metres already out; a fork is a shorter root of its own.
  const grow = (
    x: number,
    z: number,
    a: number,
    left: number,
    from: number
  ) => {
    let heading = a
    let run = 0
    while (run < left) {
      heading += range(rng, -ROOTS.wander, ROOTS.wander)
      const nx = x + Math.cos(heading) * ROOTS.step
      const nz = z + Math.sin(heading) * ROOTS.step
      const out = from + run
      const total = from + left
      const half = (t: number) =>
        (ROOTS.width[0] + (ROOTS.width[1] - ROOTS.width[0]) * t) / 2
      const w0 = half(out / total)
      const w1 = half((out + ROOTS.step) / total)
      // Square to the step, either side.
      const px = -Math.sin(heading)
      const pz = Math.cos(heading)
      const y = ROOTS.lift
      positions.push(
        x + px * w0,
        y,
        z + pz * w0,
        x - px * w0,
        y,
        z - pz * w0,
        nx - px * w1,
        y,
        nz - pz * w1,
        x + px * w0,
        y,
        z + pz * w0,
        nx - px * w1,
        y,
        nz - pz * w1,
        nx + px * w1,
        y,
        nz + pz * w1
      )
      for (let k = 0; k < 6; k++) reachOf.push(out / total)
      if (rng() < ROOTS.fork && left - run > 0.6) {
        const side = rng() < 0.5 ? -1 : 1
        grow(
          nx,
          nz,
          heading + side * range(rng, 0.4, 0.8),
          (left - run) * 0.6,
          out
        )
      }
      x = nx
      z = nz
      run += ROOTS.step
    }
  }
  for (let i = 0; i < ROOTS.count; i++) {
    const a = (i / ROOTS.count) * Math.PI * 2 + range(rng, -0.25, 0.25)
    grow(0, 0, a, range(rng, ...ROOTS.reach), 0)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  const colors = new Float32Array(positions.length)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const cracks = new THREE.Mesh(
    geometry,
    applyPS1(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        // Drawn over the ground they lie on, never under it.
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      })
    )
  )
  cracks.name = 'fire-root-cracks'
  // The points move every frame, so the bounds computed from them would
  // go stale; a sphere set by hand over the whole span they writhe in,
  // high and low enough for a sloping lot, holds for culling.
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    ROOTS.span / 2 + ROOTS.lift + 1
  )
  group.add(cracks)

  // A soft pool of firelight on the ground under them, draped over it.
  const poolGeo = new THREE.PlaneGeometry(ROOTS.pool, ROOTS.pool, 16, 16)
  poolGeo.rotateX(-Math.PI / 2)
  const poolAt = poolGeo.getAttribute('position') as THREE.BufferAttribute
  for (let v = 0; v < poolAt.count; v++) {
    poolAt.setY(v, heightAt(poolAt.getX(v), poolAt.getZ(v)) + ROOTS.lift - 0.01)
  }
  const pool = new THREE.Mesh(
    poolGeo,
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture('rgba(255, 90, 28, 0.35)'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    })
  )
  pool.name = 'fire-root-pool'
  group.add(pool)

  const color = geometry.getAttribute('color') as THREE.BufferAttribute
  const at = geometry.getAttribute('position') as THREE.BufferAttribute
  // Where each point lies at rest, as distance and angle from the middle.
  const rest = Array.from({ length: at.count }, (_, v) => {
    const x = at.getX(v)
    const z = at.getZ(v)
    return { r: Math.hypot(x, z), a: Math.atan2(z, x) }
  })
  const TAU = Math.PI * 2
  const update = (t: number) => {
    const R = ROOTS
    for (let v = 0; v < rest.length; v++) {
      const { r, a } = rest[v]
      // The angle term gives each direction its own phase, so the roots
      // never all swing the same way at once.
      const twist =
        R.twist *
        r *
        Math.sin(TAU * (t / R.twistSeconds - r / R.twistLength) + 2 * a)
      const stretch =
        1 +
        R.stretch *
          Math.sin(TAU * (t / R.stretchSeconds - r / R.stretchLength) + 3 * a)
      const x = Math.cos(a + twist) * r * stretch
      const z = Math.sin(a + twist) * r * stretch
      at.setXYZ(v, x, heightAt(x, z) + ROOTS.lift, z)
    }
    at.needsUpdate = true
    const longest = ROOTS.reach[1]
    for (let v = 0; v < reachOf.length; v++) {
      const out = reachOf[v] * longest
      const wave =
        0.5 +
        0.5 *
          Math.sin(
            ((out - t * ROOTS.pulseSpeed) / ROOTS.pulseLength) * Math.PI * 2
          )
      // Hot at the middle, dimming toward the tips; the pulse rides over.
      const heat = (1 - reachOf[v] * 0.7) * (0.35 + 0.65 * wave)
      color.setXYZ(v, heat, heat * 0.32, heat * 0.07)
    }
    color.needsUpdate = true
    pool.material.opacity = 0.7 + 0.3 * Math.sin(t * 1.3)
  }
  update(0)
  setMotion(group, update)
  return { group, update }
}
