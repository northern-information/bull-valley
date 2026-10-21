// The trip's platonic solids as seen (tripsolids.ts): one small fuchsia
// solid to each, its faces faint and its edges solid, unlit, untouched by
// the fog and casting nothing, floating round the eye. loop.ts updates
// them every frame from the tripping ward.

import * as THREE from 'three'
import { CONFIG } from './config.ts'
import { PSYCH_FUCHSIA } from './fuchsia.ts'
import { applyPS1 } from './ps1.ts'
import { solidAt } from './tripsolids.ts'
import type { SolidKind } from './tripsolids.ts'

// Each solid about a metre across.
function geometryOf(kind: SolidKind): THREE.BufferGeometry {
  switch (kind) {
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(0.5)
    case 'cube':
      return new THREE.BoxGeometry(0.58, 0.58, 0.58)
    case 'octahedron':
      return new THREE.OctahedronGeometry(0.5)
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(0.5)
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(0.5)
  }
}

interface Solid {
  root: THREE.Group
  face: THREE.MeshBasicMaterial
  edge: THREE.LineBasicMaterial
}

export class TripSolids {
  readonly group = new THREE.Group()
  private readonly solids: Solid[] = []

  constructor(scene: THREE.Scene) {
    this.group.name = 'trip-solids'
    for (let i = 0; i < CONFIG.psych.solids.max; i++) {
      const geometry = geometryOf(solidAt(i, 0, 0).kind)
      const face = applyPS1(
        new THREE.MeshBasicMaterial({
          color: PSYCH_FUCHSIA,
          transparent: true,
          depthWrite: false,
          fog: false,
        })
      )
      const edge = applyPS1(
        new THREE.LineBasicMaterial({
          color: PSYCH_FUCHSIA,
          transparent: true,
          depthWrite: false,
          fog: false,
        })
      )
      const root = new THREE.Group()
      root.add(new THREE.Mesh(geometry, face))
      root.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edge))
      root.visible = false
      this.group.add(root)
      this.solids.push({ root, face, edge })
    }
    scene.add(this.group)
  }

  // Round `eye` (world metres) on a trip of `level` at `time`.
  update(level: number, time: number, eye: THREE.Vector3) {
    this.group.position.copy(eye)
    const faces = CONFIG.psych.solids.opacity
    for (const [i, solid] of this.solids.entries()) {
      const view = solidAt(i, level, time)
      solid.root.visible = view.opacity > 0
      if (!solid.root.visible) continue
      solid.root.position.set(view.x, view.y, view.z)
      solid.root.rotation.set(view.rx, view.ry, view.rz)
      solid.root.scale.setScalar(view.size)
      solid.face.opacity = view.opacity
      // The edges show in full while the faces are at their fullest.
      solid.edge.opacity = Math.min(1, view.opacity / faces)
    }
  }
}
