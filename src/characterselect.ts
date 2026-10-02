// The character select: a black overlay with one figure on a PS1
// turntable, its name, and Previous / Next / Choose. It is mounted at boot
// beneath the title cards, so the logo's reveal uncovers it, and run()
// arms it once it is showing. The game's renderer does not exist until the
// terrain resolves, so the turntable draws with its own small renderer,
// disposed once a character is chosen. The roster and the saved pick come
// from characters.ts; the bodies from figure.ts.

import * as THREE from 'three'
import { stepIndex } from './carousel.ts'
import { loadCharacter, saveCharacter, SELECTABLE } from './characters.ts'
import { applyPose, buildFigure } from './figure.ts'
import { outfitById } from './outfits.ts'
import { samplePose } from './poses.ts'
import { createPS1Renderer, setSnapResolution } from './ps1.ts'
import type { CharacterStorage } from './characters.ts'
import type { OutfitId } from './outfits.ts'

export interface CharacterSelectConfig {
  spinPerSecond: number
  revealFadeMs: number
  // CONFIG.render.downscale, so the turntable has the game's grain.
  downscale: number
}

export interface CharacterSelectOptions {
  storage: CharacterStorage
  config: CharacterSelectConfig
}

export interface CharacterSelect {
  // Arms the screen and resolves with the chosen outfit once the overlay
  // has faded out and removed itself.
  run(): Promise<OutfitId>
}

// Mounts the overlay as the last child of <body>, black and inert until
// run(). Mount it before the title cards so they stack above it.
export function mountCharacterSelect({
  storage,
  config,
}: CharacterSelectOptions): CharacterSelect {
  const root = document.createElement('div')
  root.className = 'bv-select'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-select-title')
  root.innerHTML = `
    <canvas class="bv-select-canvas" aria-hidden="true"></canvas>
    <div class="bv-select-ui" hidden>
      <h2 id="bv-select-title">Choose Your Character</h2>
      <p class="bv-select-name" aria-live="polite"></p>
      <div class="bv-select-actions">
        <button type="button" class="bv-btn" data-bv="select-prev">Previous</button>
        <button type="button" class="bv-btn bv-btn--primary" data-bv="select-choose">Choose</button>
        <button type="button" class="bv-btn" data-bv="select-next">Next</button>
      </div>
      <p class="bv-select-hint">&lt; &gt; Cycle · Enter Choose</p>
    </div>`
  document.body.appendChild(root)

  const find = <T extends Element>(selector: string): T => {
    const found = root.querySelector<T>(selector)
    if (!found) throw new Error(`Missing ${selector}`)
    return found
  }
  const canvas = find<HTMLCanvasElement>('.bv-select-canvas')
  const ui = find<HTMLDivElement>('.bv-select-ui')
  const nameEl = find<HTMLParagraphElement>('.bv-select-name')
  const prevBtn = find<HTMLButtonElement>('[data-bv="select-prev"]')
  const nextBtn = find<HTMLButtonElement>('[data-bv="select-next"]')
  const chooseBtn = find<HTMLButtonElement>('[data-bv="select-choose"]')

  function run(): Promise<OutfitId> {
    return new Promise<OutfitId>((resolve) => {
      const renderer = createPS1Renderer(canvas)
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#000000')
      scene.add(new THREE.HemisphereLight('#ffffff', '#3a3a3a', 2.2))
      const key = new THREE.DirectionalLight('#ffffff', 1.5)
      key.position.set(0.6, 1, 0.9)
      scene.add(key)

      // Boots to the tip of Church's guitar in frame, clear of the title
      // above and the name and buttons below.
      const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50)
      camera.position.set(0, 1.1, 6.6)
      camera.lookAt(0, 0.75, 0)

      // One standing figure per character. The materials and geometry are
      // shared with every other figure in the game, so they are never
      // disposed here.
      const turntable = new THREE.Group()
      scene.add(turntable)
      const figures = SELECTABLE.map((id) => {
        const figure = buildFigure(id)
        applyPose(figure, samplePose('stand'))
        figure.group.visible = false
        turntable.add(figure.group)
        return figure.group
      })

      let index = Math.max(0, SELECTABLE.indexOf(loadCharacter(storage)))
      let chosen = false
      let fadeStart: number | null = null

      const show = () => {
        figures.forEach((group, i) => {
          group.visible = i === index
        })
        // Each new character turns to face you first.
        turntable.rotation.y = 0
        nameEl.textContent = outfitById(SELECTABLE[index]).label
      }

      const step = (dir: number) => {
        if (chosen) return
        index = stepIndex(index, SELECTABLE.length, dir)
        show()
      }

      const choose = () => {
        if (chosen) return
        chosen = true
        saveCharacter(storage, SELECTABLE[index])
        fadeStart = performance.now()
      }

      const resize = () => {
        const w = window.innerWidth
        const h = window.innerHeight
        const iw = Math.max(2, Math.floor(w / config.downscale))
        const ih = Math.max(2, Math.floor(h / config.downscale))
        renderer.setSize(iw, ih, false)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        setSnapResolution(iw, ih)
      }

      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault()
          step(-1)
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault()
          step(1)
        } else if (e.code === 'Enter' || e.code === 'Space') {
          // A focused button handles its own activation.
          if (e.target instanceof HTMLButtonElement) return
          e.preventDefault()
          choose()
        }
      }

      const cleanup = () => {
        renderer.setAnimationLoop(null)
        document.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', resize)
        scene.remove(turntable)
        renderer.dispose()
        renderer.forceContextLoss()
        root.remove()
        resolve(SELECTABLE[index])
      }

      prevBtn.addEventListener('click', () => step(-1))
      nextBtn.addEventListener('click', () => step(1))
      chooseBtn.addEventListener('click', choose)
      document.addEventListener('keydown', onKey)
      window.addEventListener('resize', resize)
      resize()
      show()
      ui.hidden = false

      let last = performance.now()
      renderer.setAnimationLoop(() => {
        const now = performance.now()
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        turntable.rotation.y += dt * config.spinPerSecond
        renderer.render(scene, camera)
        if (fadeStart !== null) {
          const t = (now - fadeStart) / config.revealFadeMs
          root.style.opacity = String(Math.max(0, 1 - t))
          if (t >= 1) cleanup()
        }
      })
    })
  }

  return { run }
}
