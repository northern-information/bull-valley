import * as THREE from 'three'
import {
  SODIUM,
  sodiumHaloMaterial,
  sodiumPoolMaterial,
  STREETLIGHT,
  streetlightParts,
} from './assets.ts'
import { POLE_RADIUS } from './poles.ts'
import type { Ground } from './ground.ts'
import type { LampSpot } from './roadside.ts'
import type { Walls } from './walls.ts'

// Sodium streetlights at the junctions (roadside.ts). Each lamp is four
// instanced parts, a halo on one Points cloud, and a pool of orange light
// drawn on the ground under it, standing in for the light of every lamp
// that carries no real one. A few real lights ride to the lamps nearest
// the player and light what stands under them (the player, the truck, the
// trees). Each lamp is a post on `walls`.
const STREETLIGHT_GLOW = {
  // The pool on the ground: radius, rings and sectors of the fan, its
  // strength at the centre, and how far it floats over the ground: past
  // surfaces.ts ROAD_LIFT, so a triangle reaching off a road edge still clears the deck.
  pool: { radius: 13, rings: 6, sectors: 20, alpha: 0.75, lift: 0.35 },
  halo: 7,
  // The real lights: how many, their candela and reach, and the distances
  // over which one fades out as the player walks away from its lamp.
  lights: 4,
  intensity: 60,
  distance: 22,
  fade: [45, 75] as const,
}

export interface Streetlights {
  group: THREE.Group
  // Park the real lights on the lamps nearest (x, z).
  update(x: number, z: number): void
}

export function buildStreetlights(
  spots: readonly LampSpot[],
  ground: Ground,
  walls: Walls
): Streetlights {
  const G = STREETLIGHT_GLOW
  const group = new THREE.Group()
  group.name = 'streetlights'
  const meshes = streetlightParts().map((part) => {
    const mesh = new THREE.InstancedMesh(
      part.geometry,
      part.material,
      spots.length
    )
    mesh.name = part.name
    group.add(mesh)
    return mesh
  })
  const dummy = new THREE.Object3D()
  // Where each lamp's light comes from, in world space.
  const lenses: THREE.Vector3[] = []
  const haloPositions: number[] = []
  const poolPositions: number[] = []
  const poolColors: number[] = []
  const poolIndex: number[] = []
  const sodium = new THREE.Color(SODIUM)
  const { radius, rings, sectors, alpha, lift } = G.pool
  spots.forEach((spot, i) => {
    dummy.position.set(spot.x, ground.at(spot.x, spot.z), spot.z)
    dummy.rotation.set(0, spot.yaw, 0)
    dummy.updateMatrix()
    for (const mesh of meshes) mesh.setMatrixAt(i, dummy.matrix)
    walls.addWall(
      { x: spot.x, z: spot.z },
      { x: spot.x, z: spot.z },
      POLE_RADIUS
    )
    const lens = new THREE.Vector3(...STREETLIGHT.lens).applyMatrix4(
      dummy.matrix
    )
    lenses.push(lens)
    haloPositions.push(lens.x, lens.y - 0.1, lens.z)
    // A fan draped on the ground under the lens, bright at the centre and
    // gone at the rim: the centre, then `rings` rings of `sectors` vertices,
    // each shared by every triangle that meets it.
    const base = poolPositions.length / 3
    const vertex = (px: number, pz: number, k: number) => {
      poolPositions.push(px, ground.at(px, pz) + lift, pz)
      poolColors.push(sodium.r, sodium.g, sodium.b, alpha * k * k)
    }
    vertex(lens.x, lens.z, 1)
    for (let ring = 1; ring <= rings; ring++) {
      const r = (radius * ring) / rings
      for (let s = 0; s < sectors; s++) {
        const a = (Math.PI * 2 * s) / sectors
        vertex(
          lens.x + Math.cos(a) * r,
          lens.z + Math.sin(a) * r,
          1 - ring / rings
        )
      }
    }
    const at = (ring: number, s: number) =>
      ring === 0 ? base : base + 1 + (ring - 1) * sectors + (s % sectors)
    for (let s = 0; s < sectors; s++) {
      poolIndex.push(at(0, 0), at(1, s + 1), at(1, s))
      for (let ring = 1; ring < rings; ring++) {
        poolIndex.push(at(ring, s), at(ring, s + 1), at(ring + 1, s))
        poolIndex.push(at(ring + 1, s), at(ring, s + 1), at(ring + 1, s + 1))
      }
    }
  })
  for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true

  const haloGeometry = new THREE.BufferGeometry()
  haloGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(haloPositions, 3)
  )
  const halos = new THREE.Points(haloGeometry, sodiumHaloMaterial(G.halo))
  halos.name = 'streetlight-halos'
  group.add(halos)

  const poolGeometry = new THREE.BufferGeometry()
  poolGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(poolPositions, 3)
  )
  poolGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(poolColors, 4)
  )
  poolGeometry.setIndex(poolIndex)
  const pools = new THREE.Mesh(poolGeometry, sodiumPoolMaterial())
  pools.name = 'streetlight-pools'
  group.add(pools)

  // The real lights stay in the scene at zero when unused, so the shaders
  // never recompile for a changed count.
  const lights = Array.from({ length: G.lights }, () => {
    const light = new THREE.PointLight(SODIUM, 0, G.distance)
    group.add(light)
    return light
  })
  const order = lenses.map((_, i) => i)
  const dist = new Float32Array(lenses.length)
  const [near, far] = G.fade
  return {
    group,
    update(x, z) {
      for (let i = 0; i < lenses.length; i++) {
        dist[i] = Math.hypot(lenses[i].x - x, lenses[i].z - z)
      }
      order.sort((a, b) => dist[a] - dist[b])
      lights.forEach((light, k) => {
        if (k >= order.length) {
          light.intensity = 0
          return
        }
        const i = order[k]
        light.position.copy(lenses[i])
        light.position.y -= 0.3
        const fade = THREE.MathUtils.clamp((far - dist[i]) / (far - near), 0, 1)
        light.intensity = G.intensity * fade
      })
    },
  }
}
