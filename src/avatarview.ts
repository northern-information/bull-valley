// The raider as the pack shows them: their own character and guitar finish
// standing on a small PS1 turntable beside the grid, wearing what the
// account wears over it (cosmetics.ts, the Flaming Halo). Like Gron's
// preview it draws with a renderer of its own, which leaves the game's PS1
// snap resolution alone; made the first time the pack opens and kept, it
// draws only while the pack is open.

import * as THREE from 'three'
import { applyPose, attachCosmetics, buildFigure } from './figure.ts'
import { finishById } from './finishes.ts'
import { samplePose } from './poses.ts'
import { createPS1Renderer } from './ps1.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { FinishId } from './finishes.ts'
import type { OutfitId } from './outfits.ts'

// The turntable: turns a second. The canvas's pixel size, tall for a
// standing figure; styles.css sets its CSS size to match.
const SPIN_PER_SECOND = 0.6
export const AVATAR_PX = { width: 120, height: 200 }

export interface AvatarLook {
  outfit: OutfitId
  finish: FinishId
  cosmetics: readonly CosmeticId[]
}

export interface AvatarView {
  // Draws the raider until stop(); a second show() redresses them.
  show(look: AvatarLook): void
  stop(): void
}

export function createAvatarView(canvas: HTMLCanvasElement): AvatarView {
  let renderer: THREE.WebGLRenderer | null = null
  let stopRunning: (() => void) | null = null

  function show(look: AvatarLook): void {
    stop()
    if (!renderer) {
      renderer = createPS1Renderer(canvas)
      renderer.setSize(AVATAR_PX.width, AVATAR_PX.height, false)
    }
    const drawing = renderer
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#050505')
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a3a3a', 2.2))
    const key = new THREE.DirectionalLight('#ffffff', 1.5)
    key.position.set(0.6, 1, 0.9)
    scene.add(key)
    // A standing figure head to boots, with room over it for the halo.
    const camera = new THREE.PerspectiveCamera(
      30,
      AVATAR_PX.width / AVATAR_PX.height,
      0.05,
      50
    )
    camera.position.set(0, 1.05, 4.3)
    camera.lookAt(0, 1.0, 0)
    const turntable = new THREE.Group()
    scene.add(turntable)
    // The figure's materials and geometry are shared with every figure in
    // the game, so only what it wears is freed.
    const figure = buildFigure(look.outfit, {
      guitarFinish: finishById(look.finish).color,
    })
    applyPose(figure, samplePose('stand'))
    const worn = attachCosmetics(figure, look.cosmetics)
    turntable.add(figure.group)

    let last = performance.now()
    drawing.setAnimationLoop(() => {
      const now = performance.now()
      turntable.rotation.y +=
        Math.min(0.05, (now - last) / 1000) * SPIN_PER_SECOND
      last = now
      worn.update(now / 1000)
      drawing.render(scene, camera)
    })
    stopRunning = () => {
      drawing.setAnimationLoop(null)
      worn.dispose()
      turntable.remove(figure.group)
    }
  }

  function stop(): void {
    stopRunning?.()
    stopRunning = null
  }

  return { show, stop }
}
