import * as THREE from 'three'
import { lambert, mergeStatic } from './assetkit.ts'
import { mulberry32, range } from './rng.ts'

// The berry bush that gives one berry a day (sharedworld.ts rule 8), and
// the berries' skin, which the berries in a pickup share.

// --- Berry bush ----------------------------------------------------------

// The berries' skin: near black, with a little light in them so they read
// through the fog at the lot's edge.
export function berryMaterial(): THREE.MeshLambertMaterial {
  return lambert({
    color: '#22101f',
    emissive: new THREE.Color('#b0407a'),
    emissiveIntensity: 0.45,
  })
}

// The bush by the spawn Citgo that gives one berry a day (sharedworld.ts
// rule 8): a low mound of dark lumps on a stub of trunk, berries set on
// the lumps' skins. Origin at ground level under the middle; about 1.4 m
// across and 1 m high.
export function buildBerryBush(seed = 0xbe221): THREE.Group {
  const rng = mulberry32(seed)
  const group = new THREE.Group()
  group.name = 'berry-bush'
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.08, 0.3, 5),
    lambert({ color: '#33271a' })
  )
  trunk.position.y = 0.15
  group.add(trunk)
  // A shade over the tree canopies, so it reads as a bush and not a rock.
  const leaf = lambert({ color: '#2a4529' })
  const lumps: { at: THREE.Vector3; r: number }[] = []
  const count = 7
  for (let i = 0; i < count; i++) {
    const r = i === 0 ? 0.5 : range(rng, 0.3, 0.42)
    const a = (i / count) * Math.PI * 2 + range(rng, -0.3, 0.3)
    const d = i === 0 ? 0 : range(rng, 0.3, 0.42)
    const at = new THREE.Vector3(
      Math.cos(a) * d,
      r * 0.9 + range(rng, 0.05, 0.3),
      Math.sin(a) * d
    )
    const lump = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaf)
    lump.position.copy(at)
    lump.rotation.set(range(rng, 0, Math.PI), range(rng, 0, Math.PI), 0)
    group.add(lump)
    lumps.push({ at, r })
  }
  // The berries in one group, so the bush can show itself picked clean.
  const berries = new THREE.Group()
  berries.name = 'berries'
  group.add(berries)
  const berry = berryMaterial()
  const berryGeo = new THREE.SphereGeometry(0.045, 5, 4)
  for (let i = 0; i < 16; i++) {
    const lump = lumps[Math.floor(range(rng, 0, lumps.length)) % lumps.length]
    // On the skin, above the equator so none sit in the dirt.
    const yaw = range(rng, 0, Math.PI * 2)
    const pitch = range(rng, 0.1, 1.2)
    const mesh = new THREE.Mesh(berryGeo, berry)
    mesh.position.set(
      lump.at.x + Math.cos(yaw) * Math.cos(pitch) * lump.r,
      lump.at.y + Math.sin(pitch) * lump.r,
      lump.at.z + Math.sin(yaw) * Math.cos(pitch) * lump.r
    )
    berries.add(mesh)
  }
  // The lumps in one draw, and the berries in one under their own group,
  // so the bush still shows itself picked clean.
  mergeStatic(group)
  return group
}
