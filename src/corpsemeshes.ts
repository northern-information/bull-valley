// The bodies as they lie in the valley (sharedworld.ts rule 18): one
// figure.ts body per corpse, in the outfit its raider wore, laid on its
// back in the sprawl pose on ground.at, kept in step with the corpse list,
// the valley's or this raider's alone. The figure's parts are shared with
// every other figure in the game, so a body taken back is only removed.

import * as THREE from 'three'
import { applyPose, buildFigure } from './figure.ts'
import { samplePose } from './poses.ts'
import type { CorpseWire } from './corpses.ts'
import type { Figure } from './figure.ts'

// How far the figure's spine lies over the ground, laid on its back, so
// the shoulders and the seat rest on it rather than in it.
const BACK_LIFT = 0.12

export interface CorpseMeshes {
  group: THREE.Group
  // The body drawn for corpse `id`, for the glow; null when none lies.
  objectOf(id: number): THREE.Object3D | null
  sync(corpses: readonly CorpseWire[]): void
}

export function createCorpseMeshes(
  groundAt: (x: number, z: number) => number
): CorpseMeshes {
  const group = new THREE.Group()
  group.name = 'corpses'
  const byId = new Map<number, THREE.Group>()

  const lay = (corpse: CorpseWire): THREE.Group => {
    const figure: Figure = buildFigure(corpse.outfit)
    applyPose(figure, samplePose('sprawl'))
    // On its back: the figure's up (+Y) along the ground, its face (+Z) to
    // the sky.
    figure.group.rotation.x = -Math.PI / 2
    figure.group.position.y = BACK_LIFT
    const body = new THREE.Group()
    body.name = `corpse-${corpse.id}`
    body.userData.corpse = corpse.id
    body.userData.playerName = corpse.name
    body.add(figure.group)
    body.position.set(corpse.x, groundAt(corpse.x, corpse.z), corpse.z)
    // Fallen the way they faced (a yaw of 0 faces -Z, as peers.ts turns
    // a figure).
    body.rotation.y = corpse.yaw + Math.PI
    body.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return body
  }

  return {
    group,
    objectOf: (id) => byId.get(id) ?? null,
    sync(corpses) {
      const lying = new Set(corpses.map((c) => c.id))
      for (const [id, body] of [...byId]) {
        if (lying.has(id)) continue
        group.remove(body)
        byId.delete(id)
      }
      for (const corpse of corpses) {
        if (byId.has(corpse.id)) continue
        const body = lay(corpse)
        group.add(body)
        byId.set(corpse.id, body)
      }
    },
  }
}
