import * as THREE from 'three'
import { artTexture, makeGlowTexture } from './assetkit.ts'
import { canvas } from './canvas.ts'
import { skull } from './decalart.ts'
import { mulberry32, range } from './rng.ts'

// --- Shadow burst --------------------------------------------------------

// A shadowman caught in the flashlight: a black cloud thrown out from his
// chest, and skulls flung up out of it, spinning, that fall back and fade.
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
  skulls: 5,
  gravity: 9,
}

let burstMist: THREE.Texture | null = null
let burstSkull: THREE.Texture | null = null

function makeSkullTexture(): THREE.Texture {
  const art = canvas([32, 32])
  skull(art.ctx, 16, 12, 9)
  const texture = artTexture(art)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  return texture
}

interface Flung {
  velocity: THREE.Vector3
  spin: number
  size: number
}

export function buildShadowBurst(): ShadowBurst {
  const { mist, skulls } = SHADOW_BURST
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

  burstSkull ??= makeSkullTexture()
  const sprites: THREE.Sprite[] = []
  for (let i = 0; i < skulls; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: burstSkull, transparent: true })
    )
    group.add(sprite)
    sprites.push(sprite)
  }

  let puffs: THREE.Vector3[] = []
  let flung: Flung[] = []
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
    flung = Array.from({ length: skulls }, () => {
      const velocity = out().multiplyScalar(range(rng, 1.5, 3.5))
      velocity.y = range(rng, 3.5, 6)
      return { velocity, spin: range(rng, -9, 9), size: range(rng, 0.6, 0.85) }
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
    // The skulls: thrown, falling, spinning, gone over the last third.
    const g = SHADOW_BURST.gravity
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i]
      const f = flung[i]
      sprite.position.set(
        f.velocity.x * t,
        f.velocity.y * t - 0.5 * g * t * t,
        f.velocity.z * t
      )
      sprite.scale.setScalar(f.size * Math.min(1, t * 8))
      sprite.material.rotation = f.spin * t
      sprite.material.opacity = Math.min(1, 3 * (1 - life))
    }
  }

  start(0x5c011)
  draw(SHADOW_BURST.seconds)
  return { group, start, draw }
}
