import * as THREE from 'three'
import { makeGlowTexture } from './assetkit.ts'
import { mulberry32, range } from './rng.ts'

// --- Shadow burst --------------------------------------------------------

// A shadowman caught in the flashlight: a black cloud thrown out from his
// chest, and larger black flecks flung up out of it that fall back and fade.
// draw(age) poses the burst age seconds after it went off, from its seed
// alone, so the pool in shadowburst.ts and the Akashic both just pick an
// age. Local space: the chest at the origin.
export interface ShadowBurst {
  group: THREE.Group
  start(seed: number): void
  draw(age: number): void
}

export const SHADOW_BURST = {
  seconds: 1.8,
  mist: 36,
  flecks: 14,
  gravity: 9,
}

const FLECK_SIZE = 0.5

let burstMist: THREE.Texture | null = null

export function buildShadowBurst(): ShadowBurst {
  const { mist, flecks } = SHADOW_BURST
  const group = new THREE.Group()
  group.name = 'shadow-burst'

  burstMist ??= makeGlowTexture('rgba(6, 6, 10, 0.95)')
  const cloudMaterial = new THREE.PointsMaterial({
    map: burstMist,
    color: '#000000',
    size: 1.4,
    transparent: true,
    depthWrite: false,
  })
  const positions = new Float32Array(mist * 3)
  const cloudGeometry = new THREE.BufferGeometry()
  cloudGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3)
  )
  const cloud = new THREE.Points(cloudGeometry, cloudMaterial)
  cloud.frustumCulled = false
  group.add(cloud)

  // Hard-edged squares, no soft map, so they read as chunks in the cloud.
  const fleckMaterial = new THREE.PointsMaterial({
    color: '#000000',
    size: FLECK_SIZE,
    transparent: true,
    depthWrite: false,
  })
  const fleckPositions = new Float32Array(flecks * 3)
  const fleckGeometry = new THREE.BufferGeometry()
  fleckGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(fleckPositions, 3)
  )
  const fleckCloud = new THREE.Points(fleckGeometry, fleckMaterial)
  fleckCloud.frustumCulled = false
  group.add(fleckCloud)

  let puffs: THREE.Vector3[] = []
  let flung: THREE.Vector3[] = []
  const start = (seed: number) => {
    const rng = mulberry32(seed)
    // A direction on the upper half of the sphere, mostly sideways.
    const out = () => {
      const a = rng() * Math.PI * 2
      const up = range(rng, -0.2, 0.7)
      const flat = Math.sqrt(1 - up * up)
      return new THREE.Vector3(Math.cos(a) * flat, up, Math.sin(a) * flat)
    }
    puffs = Array.from({ length: mist }, () =>
      out().multiplyScalar(range(rng, 1.2, 3.4))
    )
    flung = Array.from({ length: flecks }, () => {
      const velocity = out().multiplyScalar(range(rng, 1.5, 3.5))
      velocity.y = range(rng, 3.5, 6)
      return velocity
    })
  }

  const draw = (age: number) => {
    const t = Math.max(0, age)
    const life = Math.min(1, t / SHADOW_BURST.seconds)
    group.visible = t < SHADOW_BURST.seconds
    // The cloud: out fast, slowing, rising a little, and thinning.
    const spread = 1 - Math.exp(-t * 3.5)
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i]
      positions[i * 3] = p.x * spread
      positions[i * 3 + 1] = p.y * spread + t * 0.4
      positions[i * 3 + 2] = p.z * spread
    }
    cloudGeometry.attributes.position.needsUpdate = true
    cloudMaterial.size = 1.1 + spread * 1.4
    cloudMaterial.opacity = 0.9 * (1 - life) ** 1.5
    // The flecks: thrown, falling, gone over the last third.
    const g = SHADOW_BURST.gravity
    for (let i = 0; i < flung.length; i++) {
      const v = flung[i]
      fleckPositions[i * 3] = v.x * t
      fleckPositions[i * 3 + 1] = v.y * t - 0.5 * g * t * t
      fleckPositions[i * 3 + 2] = v.z * t
    }
    fleckGeometry.attributes.position.needsUpdate = true
    fleckMaterial.size = FLECK_SIZE * Math.min(1, t * 8)
    fleckMaterial.opacity = Math.min(1, 3 * (1 - life))
  }

  start(0x5c011)
  draw(SHADOW_BURST.seconds)
  return { group, start, draw }
}
