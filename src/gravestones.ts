// The shadowmen's tombstones as they stand in the valley (sharedworld.ts
// rule 17): the stones and the mounds of every grave drawn instanced, one
// assets.ts tombstoneParts mesh a part, and the carved face alone built
// per grave (buildTombstoneFace) on ground.at, kept in step with the
// grave list, the valley's or this raider's alone.

import * as THREE from 'three'
import {
  buildTombstoneFace,
  tombstoneParts,
  tombstoneSettle,
} from './assets.ts'
import { CONFIG } from './config.ts'
import type { Grave } from './graves.ts'

export interface Gravestones {
  group: THREE.Group
  sync(graves: readonly Grave[]): void
}

// One grave as it stands: its face, and where its stone and its mound
// are, for the instance slot it holds. A grave past every slot (more
// than CONFIG.graves.max standing, which bury never allows) keeps its
// face and has no slot.
interface Standing {
  face: { mesh: THREE.Mesh; dispose: () => void }
  stone: THREE.Matrix4
  mound: THREE.Matrix4
  slot: number
}

export function createGravestones(
  groundAt: (x: number, z: number) => number
): Gravestones {
  const group = new THREE.Group()
  group.name = 'tombstones'
  const parts = tombstoneParts()
  const max = CONFIG.graves.max
  const stones = [parts.slab, parts.arch, parts.plinth].map((geometry) => {
    const mesh = new THREE.InstancedMesh(geometry, parts.stone, max)
    mesh.count = 0
    group.add(mesh)
    return mesh
  })
  const mounds = new THREE.InstancedMesh(parts.mound, parts.earth, max)
  mounds.count = 0
  group.add(mounds)
  const byId = new Map<number, Standing>()
  // The grave in each slot, the slots in use packed first.
  const slots: number[] = []
  const place = (grave: Standing, slot: number) => {
    grave.slot = slot
    for (const mesh of stones) mesh.setMatrixAt(slot, grave.stone)
    mounds.setMatrixAt(slot, grave.mound)
  }
  const settle = () => {
    for (const mesh of [...stones, mounds]) {
      mesh.count = slots.length
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }
  const base = new THREE.Object3D()
  const stone = new THREE.Object3D()
  return {
    group,
    sync(graves) {
      const standing = new Set(graves.map((g) => g.id))
      let changed = false
      for (const [id, grave] of [...byId]) {
        if (standing.has(id)) continue
        group.remove(grave.face.mesh)
        grave.face.dispose()
        byId.delete(id)
        if (grave.slot >= 0) {
          // The last slot moves into the one freed, so the used ones
          // stay packed first.
          const lastId = slots.pop()
          if (lastId !== undefined && lastId !== id) {
            const last = byId.get(lastId)
            if (last) {
              place(last, grave.slot)
              slots[grave.slot] = lastId
            }
          }
          changed = true
        }
      }
      for (const grave of graves) {
        if (byId.has(grave.id)) continue
        // The id seeds the weathering and turns the stone, so a row of
        // them never stands the same way.
        const seed = grave.id + 1
        base.position.set(grave.x, groundAt(grave.x, grave.z), grave.z)
        base.rotation.set(0, grave.id * 2.4, 0)
        base.updateMatrix()
        const tilt = tombstoneSettle(seed)
        stone.rotation.set(tilt.x, 0, tilt.z)
        stone.updateMatrix()
        const face = buildTombstoneFace(grave.name, seed)
        const stoneMatrix = base.matrix.clone().multiply(stone.matrix)
        face.mesh.matrixAutoUpdate = false
        face.mesh.matrix.copy(stoneMatrix)
        group.add(face.mesh)
        const next: Standing = {
          face,
          stone: stoneMatrix,
          mound: base.matrix.clone(),
          slot: -1,
        }
        byId.set(grave.id, next)
        if (slots.length < max) {
          place(next, slots.length)
          slots.push(grave.id)
          changed = true
        }
      }
      if (changed) settle()
    },
  }
}
