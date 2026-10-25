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
import { mulberry32, range } from './rng.ts'

// The campfire by a firefly pond's landing (cooking.ts places it,
// sharedworld.ts rule 40): a ring of fieldstones round a bed of ash, split
// logs leaned together in a teepee and burning, a blackened grate laid
// across two of the stones to cook on, and the fire's glow on the ground
// round it. Origin on the ground under its middle.

export const CAMPFIRE = {
  // The stone ring's radius, and how many stones.
  ring: 0.55,
  stones: 9,
  // The logs: how many, how long, how thick.
  logs: 4,
  log: 0.7,
  logRadius: 0.05,
  // The grate's height over the ground.
  grate: 0.32,
}

export interface Campfire {
  group: THREE.Group
  update(t: number): void
}

export function buildCampfire(seed = 0xca4f): Campfire {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'campfire'
  const { ring, stones, logs, log, logRadius, grate } = CAMPFIRE
  const solid = new THREE.Group()
  group.add(solid)

  // The ash bed, and the stones round it, each its own lump.
  const ash = new THREE.Mesh(
    new THREE.CylinderGeometry(ring * 0.85, ring * 0.9, 0.02, 12),
    lambert({ color: '#2a2724' })
  )
  ash.position.y = 0.01
  solid.add(ash)
  const stone = lambert({ color: '#77746c' })
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2 + range(rng, -0.1, 0.1)
    const size = range(rng, 0.09, 0.13)
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), stone)
    rock.scale.set(1.2, range(rng, 0.6, 0.85), 1)
    rock.position.set(Math.cos(a) * ring, size * 0.45, Math.sin(a) * ring)
    rock.rotation.set(range(rng, 0, 1), a, range(rng, 0, 1))
    solid.add(rock)
  }

  // The logs, leaned together over the middle, charred toward their tops.
  const bark = lambert({ color: '#4a3220' })
  const char = lambert({ color: '#1a1410' })
  for (let i = 0; i < logs; i++) {
    const a = (i / logs) * Math.PI * 2 + 0.4
    const stick = new THREE.Group()
    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(logRadius, logRadius, log * 0.6, 6),
      bark
    )
    lower.position.y = log * 0.3
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(logRadius * 0.8, logRadius, log * 0.4, 6),
      char
    )
    upper.position.y = log * 0.8
    stick.add(lower, upper)
    // Its foot out on the ash, leaned in so the tops meet over the middle.
    stick.position.set(Math.cos(a) * ring * 0.6, 0, Math.sin(a) * ring * 0.6)
    stick.rotation.order = 'YXZ'
    stick.rotation.y = -a + Math.PI / 2
    stick.rotation.x = -0.62
    solid.add(stick)
  }

  // The grate across two stones on opposite sides, its bars blackened.
  const iron = lambert({ color: '#1c1c1e' })
  const span = ring * 2
  for (let i = -3; i <= 3; i++) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, span, 4),
      iron
    )
    bar.rotation.z = Math.PI / 2
    bar.position.set(0, grate, i * 0.06)
    solid.add(bar)
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.4), iron)
    rail.position.set((side * span) / 2, grate, 0)
    solid.add(rail)
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.02, grate, 0.02), iron)
    leg.position.set((side * span) / 2, grate / 2, 0)
    solid.add(leg)
  }
  castShadows(solid)
  mergeStatic(solid)

  // The fire in the teepee, and its light on the ground round it.
  const fire = buildFlames(
    [
      { at: [0, 0.05, 0], size: 0.55 },
      { at: [0.12, 0.04, 0.08], size: 0.35 },
      { at: [-0.1, 0.04, -0.1], size: 0.38 },
      { at: [0.05, 0.04, -0.14], size: 0.3 },
      { at: [-0.12, 0.04, 0.1], size: 0.28 },
    ],
    seed
  )
  group.add(fire.group)
  const glow = makeGlowSprite(makeGlowTexture('rgba(255, 150, 60, 0.45)'), 4.5)
  glow.position.y = 0.5
  group.add(glow)

  const update = (t: number) => fire.update(t)
  update(0)
  setMotion(group, update)
  return { group, update }
}
