// The Elden Ring bar over every enemy (healthbar.ts): the shadowmen, the
// spiders and spiderlings (shadowbodies.ts), the Caretaker
// (caretakerrig.ts), and the tunnel shades and their Warden (tunnelrig.ts).
// Each is a sprite of its own over the body, never a child of it, so it
// holds still while the body shakes and flickers. A body's bar is built the
// first time it is hurt within range (shadowsync.ts barShown), shown while
// it stays so, and freed once the body is gone. How hurt each one is comes
// from the valley's own word on it (shadowsync.ts shadeHealth); the
// topiaries wear theirs on their backs (topiaryrig.ts), on the same terms.

import * as THREE from 'three'
import { CONFIG } from './config.ts'
import {
  buildHealthBar,
  disposeHealthBar,
  setHealthBar,
  stepHealthBar,
} from './healthbar.ts'
import { barShown, barWidth } from './shadowsync.ts'
import type { HealthBar } from './healthbar.ts'
import type { XZ } from './interfaces.ts'

// One enemy this frame: where its feet are, how tall it stands, and how
// much of it is left (0 to 1).
export interface EnemyBarFrame {
  x: number
  y: number
  z: number
  tall: number
  share: number
}

// How tall a body stands over its own origin, as built.
export function bodyHeight(object: THREE.Object3D): number {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  return box.isEmpty() ? 1 : box.max.y - object.position.y
}

export class EnemyBars {
  private readonly parent: THREE.Object3D
  private readonly bars = new Map<number | string, HealthBar>()
  private touched = new Set<number | string>()

  constructor(parent: THREE.Object3D) {
    this.parent = parent
  }

  // Enemy `id` this frame, seen from `eye`, `dt` seconds on.
  show(id: number | string, at: EnemyBarFrame, eye: XZ, dt: number): void {
    this.touched.add(id)
    const distance = Math.hypot(at.x - eye.x, at.z - eye.z)
    let bar = this.bars.get(id)
    if (!barShown(at.share, distance)) {
      if (bar) bar.sprite.visible = false
      return
    }
    if (!bar) {
      bar = buildHealthBar(barWidth(at.tall))
      setHealthBar(bar, at.share)
      this.parent.add(bar.sprite)
      this.bars.set(id, bar)
    }
    bar.sprite.visible = true
    bar.sprite.position.set(at.x, at.y + at.tall + CONFIG.healthBars.over, at.z)
    if (at.share !== bar.target) setHealthBar(bar, at.share)
    stepHealthBar(bar, dt)
  }

  // The frame done: the bar of every enemy not shown this frame is freed.
  sweep(): void {
    for (const [id, bar] of this.bars) {
      if (this.touched.has(id)) continue
      this.parent.remove(bar.sprite)
      disposeHealthBar(bar)
      this.bars.delete(id)
    }
    this.touched = new Set()
  }
}
