import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { lambert } from './assetkit.ts'
import { byTile } from './poles.ts'
import { mulberry32, pick, range } from './rng.ts'
import type { HeightAt } from './interfaces.ts'
import type { WeedSpot } from './weedspots.ts'

// Weeds as seen: one tuft, and tufts by the thousand instanced over the
// valley (weedspots.ts places them) or the drive-in's gravel.

// The weeds are bucketed into tiles this many metres across, one mesh a
// tile, so frustum culling skips the tiles behind you, as the poles do.
const WEED_TILE = 800

// A tuft of weeds: a few blades fanned out from one root, in a dry green,
// some gone to straw. One geometry for every tuft; stands on its root.
export function buildWeedTuft(seed = 1): THREE.Mesh {
  const rng = mulberry32(seed)
  const blades: THREE.BufferGeometry[] = []
  const greens = ['#4f5a2e', '#5d6634', '#6f6a3a', '#7d7046']
  const colour = new THREE.Color()
  const count = 10
  for (let i = 0; i < count; i++) {
    const tall = range(rng, 0.25, 0.6)
    const blade = new THREE.PlaneGeometry(0.07, tall)
    blade.translate(0, tall / 2, 0)
    blade.rotateX(range(rng, -0.7, 0.7))
    blade.rotateY((i / count) * Math.PI + range(rng, -0.2, 0.2))
    colour.set(pick(rng, greens))
    const colours: number[] = []
    for (let v = 0; v < blade.attributes.position.count; v++) {
      colours.push(colour.r, colour.g, colour.b)
    }
    blade.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
    blades.push(blade)
  }
  const material = lambert({ vertexColors: true, side: THREE.DoubleSide })
  const tuft = new THREE.Mesh(mergeGeometries(blades), material)
  tuft.name = 'weed-tuft'
  return tuft
}

// Tufts at `spots`, each on the ground under it, walked through: one
// instanced mesh a WEED_TILE tile, all sharing the one tuft.
export function buildWeeds(
  spots: readonly WeedSpot[],
  groundAt: HeightAt,
  seed = 1
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'weeds'
  const tuft = buildWeedTuft(seed)
  const dummy = new THREE.Object3D()
  for (const tile of byTile(spots, (s) => s, WEED_TILE)) {
    const mesh = new THREE.InstancedMesh(
      tuft.geometry,
      tuft.material,
      tile.length
    )
    tile.forEach((spot, i) => {
      dummy.position.set(spot.x, groundAt(spot.x, spot.z), spot.z)
      dummy.rotation.set(0, spot.yaw, 0)
      dummy.scale.set(1, spot.scale, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    group.add(mesh)
  }
  return group
}
