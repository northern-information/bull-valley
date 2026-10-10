import * as THREE from 'three'
import {
  POLE_ARM_DROP,
  POLE_INSULATOR_X,
  poleParts,
  poleWireAnchors,
  WIRE_SAG,
  wireMaterial,
} from './assets.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { PoleSpot } from './roadside.ts'
import type { Walls } from './walls.ts'

// The poles are bucketed into square tiles, one InstancedMesh per part per
// tile, so frustum culling (which bounds each mesh by its instances) skips
// the tiles behind and beside you. One mesh across the whole valley would
// draw every pole, every frame.
const TILE = 1000

function byTile<T>(items: readonly T[], at: (item: T) => XZ): T[][] {
  const tiles = new Map<string, T[]>()
  for (const item of items) {
    const { x, z } = at(item)
    const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`
    let list = tiles.get(key)
    if (!list) {
      list = []
      tiles.set(key, list)
    }
    list.push(item)
  }
  return [...tiles.values()]
}

// Utility poles in lines along the named roads (roadside.ts), crossarms
// square to the road, three wires sagging from one pole to the next: two
// on the insulators, the telephone cable lower down. Each pole is a post

const WIRE_SEGMENTS = 4
export const POLE_RADIUS = 0.25

export function buildPoles(
  spots: readonly PoleSpot[],
  heightAt: HeightAt,
  walls: Walls
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'poles'
  const parts = poleParts()
  const wire = wireMaterial()
  const local = new THREE.Matrix4()
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  // A pole's frame: standing on the ground, turned and tilted.
  const frameOf = (spot: PoleSpot, out: THREE.Matrix4) =>
    out.compose(
      pos.set(spot.x, heightAt(spot.x, spot.z), spot.z),
      q.setFromEuler(euler.set(0, spot.yaw, spot.tilt)),
      one
    )
  const frame = new THREE.Matrix4()
  const nextFrame = new THREE.Matrix4()
  const anchorsOf = (spot: PoleSpot, f: THREE.Matrix4) =>
    poleWireAnchors(spot.height).map((a) =>
      new THREE.Vector3(...a).applyMatrix4(f)
    )

  const indexed = spots.map((spot, i) => ({ spot, i }))
  for (const tile of byTile(indexed, (e) => e.spot)) {
    const poles = new THREE.InstancedMesh(
      parts.pole.geometry,
      parts.pole.material,
      tile.length
    )
    const arms = new THREE.InstancedMesh(
      parts.arm.geometry,
      parts.arm.material,
      tile.length
    )
    const insulators = new THREE.InstancedMesh(
      parts.insulator.geometry,
      parts.insulator.material,
      tile.length * POLE_INSULATOR_X.length
    )
    const wirePoints: number[] = []
    tile.forEach(({ spot, i }, n) => {
      const { x, z, height: h } = spot
      frameOf(spot, frame)
      poles.setMatrixAt(n, m.copy(frame).multiply(local.makeScale(1, h, 1)))
      const armY = h - POLE_ARM_DROP
      arms.setMatrixAt(
        n,
        m.copy(frame).multiply(local.makeTranslation(0, armY, 0))
      )
      POLE_INSULATOR_X.forEach((ix, k) => {
        insulators.setMatrixAt(
          n * POLE_INSULATOR_X.length + k,
          m.copy(frame).multiply(local.makeTranslation(ix, armY, 0))
        )
      })
      walls.addWall({ x, z }, { x, z }, POLE_RADIUS)
      // The span to the next pole of the same line, filed with this pole.
      if (i + 1 >= spots.length) return
      const next = spots[i + 1]
      if (next.line !== spot.line) return
      const from = anchorsOf(spot, frame)
      const to = anchorsOf(next, frameOf(next, nextFrame))
      for (let w = 0; w < from.length; w++) {
        const a = from[w]
        const b = to[w]
        const sag = WIRE_SAG * a.distanceTo(b)
        for (let s = 0; s < WIRE_SEGMENTS; s++) {
          for (const t of [s / WIRE_SEGMENTS, (s + 1) / WIRE_SEGMENTS]) {
            wirePoints.push(
              a.x + (b.x - a.x) * t,
              a.y + (b.y - a.y) * t - 4 * sag * t * (1 - t),
              a.z + (b.z - a.z) * t
            )
          }
        }
      }
    })
    poles.instanceMatrix.needsUpdate = true
    arms.instanceMatrix.needsUpdate = true
    insulators.instanceMatrix.needsUpdate = true
    group.add(poles, arms, insulators)
    if (wirePoints.length) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(wirePoints, 3)
      )
      const wires = new THREE.LineSegments(geometry, wire)
      wires.name = 'wires'
      group.add(wires)
    }
  }
  return group
}

// Sodium streetlights at the junctions (roadside.ts). Each lamp is four
// instanced parts, a halo on one Points cloud, and a pool of orange light
// drawn on the ground under it, standing in for the light of every lamp
// that carries no real one. A few real lights ride to the lamps nearest
// the player and light what stands under them (the player, the truck, the
