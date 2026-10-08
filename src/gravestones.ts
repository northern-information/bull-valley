// The shadowmen's tombstones as they stand in the valley (sharedworld.ts
// rule 17): one assets.ts buildTombstone per grave on ground.at, kept in
// step with the grave list, the valley's or this raider's alone.

import * as THREE from 'three'
import { buildTombstone } from './assets.ts'
import type { Tombstone } from './assets.ts'
import type { Grave } from './graves.ts'

export interface Gravestones {
  group: THREE.Group
  sync(graves: readonly Grave[]): void
}

export function createGravestones(
  groundAt: (x: number, z: number) => number
): Gravestones {
  const group = new THREE.Group()
  group.name = 'tombstones'
  const byId = new Map<number, Tombstone>()
  return {
    group,
    sync(graves) {
      const standing = new Set(graves.map((g) => g.id))
      for (const [id, stone] of [...byId]) {
        if (standing.has(id)) continue
        group.remove(stone.group)
        stone.dispose()
        byId.delete(id)
      }
      for (const grave of graves) {
        if (byId.has(grave.id)) continue
        // The id seeds the weathering and turns the stone, so a row of
        // them never stands the same way.
        const stone = buildTombstone(grave.name, grave.id + 1)
        stone.group.position.set(grave.x, groundAt(grave.x, grave.z), grave.z)
        stone.group.rotation.y = grave.id * 2.4
        group.add(stone.group)
        byId.set(grave.id, stone)
      }
    },
  }
}
