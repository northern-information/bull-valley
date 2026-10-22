// The account's waypoints as they stand in the valley (waypoints.ts,
// sharedworld.ts rule 37): one roadsideparts.ts buildWaypointPillar on
// ground.at at each. Kept in step with state.waypoints; only this raider
// sees their own.

import * as THREE from 'three'
import { buildWaypointPillar, disposeTree } from './assets.ts'
import type { Waypoints } from './waypoints.ts'

export interface WaypointMeshes {
  group: THREE.Group
  sync(points: Waypoints): void
}

export function createWaypointMeshes(
  groundAt: (x: number, z: number) => number
): WaypointMeshes {
  const group = new THREE.Group()
  group.name = 'waypoints'
  // Each pillar standing, by where it stands.
  const standing = new Map<string, THREE.Group>()
  const keyOf = (x: number, z: number) => `${x},${z}`
  return {
    group,
    sync(points) {
      const wanted = new Set(points.map(({ x, z }) => keyOf(x, z)))
      for (const [key, pillar] of [...standing]) {
        if (wanted.has(key)) continue
        group.remove(pillar)
        disposeTree(pillar)
        standing.delete(key)
      }
      for (const { x, z } of points) {
        const key = keyOf(x, z)
        if (standing.has(key)) continue
        const pillar = buildWaypointPillar()
        pillar.position.set(x, groundAt(x, z), z)
        group.add(pillar)
        standing.set(key, pillar)
      }
    },
  }
}
