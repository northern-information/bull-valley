// The Citgo portals as they stand in the valley (sharedworld.ts rule 28):
// both ends of each, one cornmazeparts.ts buildPortal in CITGO_PORTAL's
// blue on ground.at, turned the way the end faces, with the name of the
// raider who opened it over it. Kept in step with the open portals, the
// valley's or this raider's alone.

import * as THREE from 'three'
import { buildPortal, CITGO_PORTAL } from './assets.ts'
import { canvas, EGGSHELL, MONO, text } from './canvas.ts'
import type { PortalRig } from './assets.ts'
import type { Portal, PortalEnd } from './portals.ts'

// The name over each end: its canvas, and how high it floats.
const LABEL_W = 128
const LABEL_H = 32
const LABEL_HEIGHT = 3.2

export interface PortalMeshes {
  group: THREE.Group
  sync(portals: readonly Portal[]): void
  update(t: number): void
}

interface Standing {
  ends: PortalRig[]
  dispose(): void
}

function nameSprite(name: string): THREE.Sprite {
  const art = canvas([LABEL_W, LABEL_H])
  text(art.ctx, name, LABEL_W / 2, LABEL_H / 2, LABEL_W - 8, 18, MONO, EGGSHELL)
  const texture = new THREE.CanvasTexture(art.c)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      fog: true,
    })
  )
  sprite.scale.set(1.2, 0.3, 1)
  sprite.position.y = LABEL_HEIGHT
  return sprite
}

// Everything one end was built with is its own (a sprite's geometry is
// three's, shared by every sprite, so it stays).
function disposeEnd(group: THREE.Object3D): void {
  const free = (material: THREE.Material) => {
    if ('map' in material && material.map instanceof THREE.Texture) {
      material.map.dispose()
    }
    material.dispose()
  }
  group.traverse((node) => {
    if (node instanceof THREE.Sprite) free(node.material)
    if (!(node instanceof THREE.Mesh)) return
    const mesh = node as THREE.Mesh
    mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]
    for (const material of materials) free(material)
  })
}

export function createPortalMeshes(
  groundAt: (x: number, z: number) => number
): PortalMeshes {
  const group = new THREE.Group()
  group.name = 'citgo-portals'
  const byId = new Map<number, Standing>()
  const place = (end: PortalEnd, name: string): PortalRig => {
    const rig = buildPortal(CITGO_PORTAL)
    rig.group.position.set(end.x, groundAt(end.x, end.z), end.z)
    rig.group.rotation.y = end.yaw
    rig.group.add(nameSprite(name))
    group.add(rig.group)
    return rig
  }
  return {
    group,
    sync(portals) {
      const open = new Set(portals.map((p) => p.id))
      for (const [id, standing] of [...byId]) {
        if (open.has(id)) continue
        standing.dispose()
        byId.delete(id)
      }
      for (const portal of portals) {
        if (byId.has(portal.id)) continue
        const ends = [
          place(portal.field, portal.name),
          place(portal.citgo, portal.name),
        ]
        byId.set(portal.id, {
          ends,
          dispose() {
            for (const end of ends) {
              group.remove(end.group)
              disposeEnd(end.group)
            }
          },
        })
      }
    },
    update(t) {
      for (const { ends } of byId.values()) {
        for (const end of ends) end.update(t)
      }
    },
  }
}
