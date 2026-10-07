import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { Player } from '../../src/player.ts'

function standing(): Player {
  return new Player({
    camera: new THREE.PerspectiveCamera(),
    groundAt: () => 0,
    metres: { width: 1000, height: 1000 },
    spawn: { x: 0, z: 0, yaw: 1 },
  })
}

describe('Player weed drift', () => {
  it('sways the view a little and never turns the raider', () => {
    const player = standing()
    const driftAmp = CONFIG.items.perceptionDrift
    let widest = 0
    // A whole perception: two minutes at 60 frames a second.
    for (let i = 0; i < 120 * 60; i++) {
      player.update(1 / 60, { driftAmp })
      expect(player.yaw).toBe(1)
      widest = Math.max(widest, Math.abs(player.camera.rotation.y - 1))
    }
    expect(widest).toBeGreaterThan(0)
    expect(widest).toBeLessThan(0.1)
  })

  it('eases back to the raider heading once it wears off', () => {
    const player = standing()
    for (let i = 0; i < 600; i++) player.update(1 / 60, { driftAmp: 0.5 })
    for (let i = 0; i < 1200; i++) player.update(1 / 60)
    expect(player.camera.rotation.y).toBeCloseTo(1, 3)
    expect(player.camera.rotation.z).toBeCloseTo(0, 3)
  })
})
