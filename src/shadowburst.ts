// Shadowmen bursting in the flashlight's beam: a small pool of the bursts
// from assets.ts buildShadowBurst, each played once where the shadowman
// stood (shadowmen.ts reports where). More at once than the pool holds
// takes over the oldest.

import * as THREE from 'three'
import { buildShadowBurst, SHADOW_BURST } from './assets.ts'
import type { ShadowBurst } from './assets.ts'

const POOL = 4

interface Playing {
  burst: ShadowBurst
  age: number
}

export class ShadowBursts {
  readonly group: THREE.Group
  private pool: Playing[] = []
  private seed = 0x5c011

  constructor(scene: THREE.Object3D) {
    this.group = new THREE.Group()
    this.group.name = 'shadow-bursts'
    scene.add(this.group)
    for (let i = 0; i < POOL; i++) {
      const burst = buildShadowBurst()
      this.group.add(burst.group)
      this.pool.push({ burst, age: SHADOW_BURST.seconds })
    }
  }

  // One goes off at (x, y, z): the shadowman's chest, or a spider's body,
  // `scale` times as big.
  spawn(x: number, y: number, z: number, scale = 1): void {
    const oldest = this.pool.reduce((a, b) => (b.age > a.age ? b : a))
    oldest.age = 0
    oldest.burst.start(this.seed++)
    oldest.burst.group.position.set(x, y, z)
    oldest.burst.group.scale.setScalar(scale)
    oldest.burst.draw(0)
  }

  update(dt: number): void {
    for (const playing of this.pool) {
      if (playing.age >= SHADOW_BURST.seconds) continue
      playing.age += dt
      playing.burst.draw(playing.age)
    }
  }
}
