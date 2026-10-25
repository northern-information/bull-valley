// The drops as they lie in the valley (sharedworld.ts rule 12): one
// assets.ts buildPickup mesh per drop, standing on the deck it was set
// down on (ground.ts lieAt), kept in step with the valley's drop list.
// Each comes back as a Pickup, so E, the glow and the floating label treat
// a drop like any pickup; `drop` says which one it is.

import * as THREE from 'three'
import { buildDimes, buildPickup, buildTwenty, disposeTree } from './assets.ts'
import { isCash, isPickupKind, TWENTY } from './drops.ts'
import type { Drop } from './drops.ts'
import type { LieAt } from './interfaces.ts'
import type { Pickup } from './world.ts'

interface DropPickup extends Pickup {
  drop: number
}

export interface DropMeshes {
  group: THREE.Group
  // The drops on the ground now, in the list's order.
  readonly pickups: readonly DropPickup[]
  sync(drops: readonly Drop[]): void
}

export function isDropPickup(pickup: Pickup): pickup is DropPickup {
  return 'drop' in pickup
}

export function createDropMeshes(lieAt: LieAt): DropMeshes {
  const group = new THREE.Group()
  group.name = 'drops'
  const byId = new Map<number, DropPickup>()
  let pickups: DropPickup[] = []

  const remove = (pickup: DropPickup) => {
    group.remove(pickup.mesh)
    // Every pickup mesh is built fresh; its art and glow are shared.
    disposeTree(pickup.mesh)
    byId.delete(pickup.drop)
  }

  return {
    group,
    get pickups() {
      return pickups
    },
    sync(drops) {
      const lying = new Set(drops.map((d) => d.id))
      for (const pickup of [...byId.values()]) {
        if (!lying.has(pickup.drop)) remove(pickup)
      }
      pickups = drops.flatMap((d) => {
        const known = byId.get(d.id)
        if (known) {
          // Cabbages taken up only as far as the arms had room leave the
          // rest lying.
          known.count = d.count
          return [known]
        }
        // The valley drops only items (the cabbage and the gold bullion
        // among them) and cash (dimes, a spider's $20); anything else is
        // not drawn.
        if (!isPickupKind(d.kind)) return []
        const kind = d.kind
        // The id seeds the look (a pack's brand art, how the dimes lie) and
        // turns it, so two drops side by side never lie the same way.
        const mesh =
          kind === TWENTY
            ? buildTwenty(d.id)
            : isCash(kind)
              ? buildDimes(d.count, d.id)
              : buildPickup(kind, d.id)
        mesh.position.set(d.x, lieAt(d.x, d.z, d.y), d.z)
        mesh.rotation.y = d.id * 2.4
        group.add(mesh)
        const pickup: DropPickup = {
          drop: d.id,
          kind,
          count: d.count,
          x: d.x,
          z: d.z,
          mesh,
          taken: false,
        }
        byId.set(d.id, pickup)
        return [pickup]
      })
    },
  }
}
