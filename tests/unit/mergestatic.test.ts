import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { castShadows, mergeStatic } from '../../src/assetkit.ts'

// Two boxes of one material, as a model builds them.
function pair(): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshLambertMaterial()
  for (const x of [0, 1]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
    mesh.position.x = x
    group.add(mesh)
  }
  return group
}

describe('mergeStatic', () => {
  it('keeps the shadows castShadows gave the parts it merges', () => {
    const group = pair()
    castShadows(group)
    mergeStatic(group)
    expect(group.children).toHaveLength(1)
    expect((group.children[0] as THREE.Mesh).castShadow).toBe(true)
  })

  it('merges a part that casts only with others that do', () => {
    const group = pair()
    ;(group.children[0] as THREE.Mesh).castShadow = true
    mergeStatic(group)
    expect(group.children).toHaveLength(2)
  })
})
