// The raider as the pack shows them: their own character and guitar finish
// standing on a small PS1 turntable beside the grid, wearing what the
// account wears over it (cosmetics.ts, the Flaming Halo). Like Moab's
// Your Character it draws with a renderer of its own, which leaves the game's PS1
// snap resolution alone; made the first time the pack opens and kept, it
// draws only while the pack is open. Bull Valley Dial-Up's lobby shows the
// raider on one too, where a drag turns them by hand (`drag`).

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
// Radians a dragged pixel turns the raider, and how long they hold where
// a drag left them before the turntable takes over again.
const DRAG_PER_PX = 0.02
const HOLD_MS = 1500
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

export function createAvatarView(
  canvas: HTMLCanvasElement,
  { drag = false }: { drag?: boolean } = {}
): AvatarView {
  let renderer: THREE.WebGLRenderer | null = null
  let stopRunning: (() => void) | null = null
  // The yaw a drag adds, and the pointer and moment it last moved.
  let turned = 0
  let held: { pointer: number; x: number } | null = null
  let heldAt = -Infinity
  if (drag) {
    canvas.addEventListener('pointerdown', (e) => {
      held = { pointer: e.pointerId, x: e.clientX }
      heldAt = performance.now()
      canvas.setPointerCapture(e.pointerId)
    })
    canvas.addEventListener('pointermove', (e) => {
      if (held?.pointer !== e.pointerId) return
      turned += (e.clientX - held.x) * DRAG_PER_PX
      held.x = e.clientX
      heldAt = performance.now()
    })
    const release = (e: PointerEvent) => {
      if (held?.pointer !== e.pointerId) return
      held = null
      heldAt = performance.now()
    }
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
  }

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
      // Held, or just let go: the drag alone turns them.
      if (!held && now - heldAt > HOLD_MS) {
        turntable.rotation.y +=
          Math.min(0.05, (now - last) / 1000) * SPIN_PER_SECOND
      }
      turntable.rotation.y += turned
      turned = 0
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
