// The character select: a black overlay with one figure on a PS1
// turntable, its name, a field for yours, and Previous / Next / Choose. A
// character with a guitar on their back also gets the finish row: the
// finish name, one swatch per finish, and Randomize. It is mounted at boot
// beneath the title cards, so the logo's reveal uncovers it, and run() arms
// it once it is showing. The game's renderer does not exist until the
// terrain resolves, so the turntable draws with its own small renderer,
// disposed once a character is chosen. The roster and the saved pick and
// name come from characters.ts; the finishes and theirs from finishes.ts;
// the bodies from figure.ts; the name rules from protocol.ts, since the
// valley server applies them too.

import * as THREE from 'three'
import { stepIndex } from './carousel.ts'
import {
  loadCharacter,
  loadName,
  saveCharacter,
  saveName,
  SELECTABLE,
} from './characters.ts'
import { applyPose, buildFigure } from './figure.ts'
import {
  FINISHES,
  isFinish,
  loadFinish,
  randomFinish,
  saveFinish,
} from './finishes.ts'
import { outfitById } from './outfits.ts'
import { samplePose } from './poses.ts'
import { isValidName, NAME_MAX, normalizeName } from './protocol.ts'
import { createPS1Renderer, setSnapResolution } from './ps1.ts'
import type { CharacterPick, CharacterStorage } from './characters.ts'

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
  // Arms the screen and resolves with the chosen outfit and name once the
  // overlay has faded out and removed itself.
  run(): Promise<CharacterPick>
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
  const swatches = FINISHES.map(
    (finish) =>
      `<button type="button" class="bv-swatch" role="radio" aria-checked="false"` +
      ` aria-label="${finish.label}" data-finish="${finish.id}"` +
      ` style="--swatch: ${finish.color}"></button>`
  ).join('')
  root.innerHTML = `
    <canvas class="bv-select-canvas" aria-hidden="true"></canvas>
    <div class="bv-select-ui" hidden>
      <h2 id="bv-select-title">Choose Your Character</h2>
      <p class="bv-select-name" aria-live="polite"></p>
      <div class="bv-select-finish" hidden>
        <p class="bv-select-finish-name" aria-live="polite"></p>
        <div class="bv-select-finish-row">
          <div class="bv-select-swatches" role="radiogroup" aria-label="Guitar Finish">${swatches}</div>
          <button type="button" class="bv-btn" data-bv="select-randomize">Randomize</button>
        </div>
      </div>
      <label class="bv-select-field">
        <span>Your Name</span>
        <input type="text" data-bv="select-player-name" maxlength="${NAME_MAX}" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="go">
      </label>
      <div class="bv-select-actions">
        <button type="button" class="bv-btn" data-bv="select-prev">Previous</button>
        <button type="button" class="bv-btn bv-btn--primary" data-bv="select-choose" disabled>Choose</button>
        <button type="button" class="bv-btn" data-bv="select-next">Next</button>
      </div>
      <p class="bv-select-hint"></p>
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
  const hintEl = find<HTMLParagraphElement>('.bv-select-hint')
  const finishRow = find<HTMLDivElement>('.bv-select-finish')
  const finishNameEl = find<HTMLParagraphElement>('.bv-select-finish-name')
  const swatchRow = find<HTMLDivElement>('.bv-select-swatches')
  const swatchButtons = Array.from(
    swatchRow.querySelectorAll<HTMLButtonElement>('[data-finish]')
  )
  const randomizeBtn = find<HTMLButtonElement>('[data-bv="select-randomize"]')
  const nameInput = find<HTMLInputElement>('[data-bv="select-player-name"]')
  const prevBtn = find<HTMLButtonElement>('[data-bv="select-prev"]')
  const nextBtn = find<HTMLButtonElement>('[data-bv="select-next"]')
  const chooseBtn = find<HTMLButtonElement>('[data-bv="select-choose"]')

  function run(): Promise<CharacterPick> {
    return new Promise<CharacterPick>((resolve) => {
      const renderer = createPS1Renderer(canvas)
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#000000')
      scene.add(new THREE.HemisphereLight('#ffffff', '#3a3a3a', 2.2))
      const key = new THREE.DirectionalLight('#ffffff', 1.5)
      key.position.set(0.6, 1, 0.9)
      scene.add(key)

      // Boots to the tip of Church's guitar in frame, clear of the title
      // above and the names, the finish row and the buttons below.
      const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50)
      camera.position.set(0, 1.1, 6.6)
      camera.lookAt(0, 0.4, 0)

      let index = Math.max(0, SELECTABLE.indexOf(loadCharacter(storage)))
      let finishIndex = Math.max(
        0,
        FINISHES.findIndex((finish) => finish.id === loadFinish(storage))
      )
      let chosen = false
      let fadeStart: number | null = null

      // One standing figure per character, every guitar in the saved
      // finish. The materials and geometry are shared with every other
      // figure in the game, so they are never disposed here.
      const turntable = new THREE.Group()
      scene.add(turntable)
      const figures = SELECTABLE.map((id) => {
        const figure = buildFigure(id, {
          guitarFinish: FINISHES[finishIndex].color,
        })
        applyPose(figure, samplePose('stand'))
        figure.group.visible = false
        turntable.add(figure.group)
        return figure
      })

      // The name as it would go over the wire. Choose waits for a valid one.
      nameInput.value = loadName(storage)
      const playerName = () => normalizeName(nameInput.value)
      const checkName = () => {
        chooseBtn.disabled = chosen || !isValidName(playerName())
      }

      const showFinish = () => {
        const finish = FINISHES[finishIndex]
        finishNameEl.textContent = finish.label
        for (const button of swatchButtons) {
          button.setAttribute(
            'aria-checked',
            String(button.dataset.finish === finish.id)
          )
        }
        for (const figure of figures) figure.guitar?.setFinish(finish.color)
      }

      const show = () => {
        figures.forEach((figure, i) => {
          figure.group.visible = i === index
        })
        // Each new character turns to face you first.
        turntable.rotation.y = 0
        const outfit = outfitById(SELECTABLE[index])
        nameEl.textContent = outfit.label
        // The finish row and its keys belong to a character with a guitar.
        finishRow.hidden = outfit.onBack !== 'guitar'
        hintEl.textContent = finishRow.hidden
          ? '< > Cycle · Enter Choose'
          : '< > Cycle · Up / Down Finish · R Randomize · Enter Choose'
      }

      const step = (dir: number) => {
        if (chosen) return
        index = stepIndex(index, SELECTABLE.length, dir)
        show()
      }

      const setFinish = (at: number) => {
        if (chosen || finishRow.hidden) return
        finishIndex = at
        showFinish()
      }

      const stepFinish = (dir: number) => {
        setFinish(stepIndex(finishIndex, FINISHES.length, dir))
      }

      const randomize = () => {
        const id = randomFinish(FINISHES[finishIndex].id, Math.random())
        setFinish(FINISHES.findIndex((finish) => finish.id === id))
      }

      const choose = () => {
        if (chosen) return
        const name = playerName()
        if (!isValidName(name)) {
          nameInput.focus()
          return
        }
        chosen = true
        chooseBtn.disabled = true
        nameInput.disabled = true
        saveCharacter(storage, SELECTABLE[index])
        saveFinish(storage, FINISHES[finishIndex].id)
        saveName(storage, name)
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
        // In the field the keys type; Enter there chooses when the name
        // is good, and Escape hands the turntable and finish keys back.
        if (e.target === nameInput) {
          if (e.code === 'Enter') {
            e.preventDefault()
            choose()
          } else if (e.code === 'Escape') {
            nameInput.blur()
          }
          return
        }
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault()
          step(-1)
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault()
          step(1)
        } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault()
          stepFinish(-1)
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          e.preventDefault()
          stepFinish(1)
        } else if (e.code === 'KeyR') {
          e.preventDefault()
          randomize()
        } else if (e.code === 'Enter' || e.code === 'Space') {
          // A focused button handles its own activation.
          if (e.target instanceof HTMLButtonElement) return
          e.preventDefault()
          choose()
        }
      }

      const onSwatch = (e: Event) => {
        const button =
          e.target instanceof Element
            ? e.target.closest<HTMLButtonElement>('[data-finish]')
            : null
        const id = button?.dataset.finish
        if (!isFinish(id)) return
        setFinish(FINISHES.findIndex((finish) => finish.id === id))
      }

      const cleanup = () => {
        renderer.setAnimationLoop(null)
        document.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', resize)
        scene.remove(turntable)
        renderer.dispose()
        renderer.forceContextLoss()
        root.remove()
        resolve({ outfit: SELECTABLE[index], name: playerName() })
      }

      prevBtn.addEventListener('click', () => step(-1))
      nextBtn.addEventListener('click', () => step(1))
      chooseBtn.addEventListener('click', choose)
      randomizeBtn.addEventListener('click', randomize)
      swatchRow.addEventListener('click', onSwatch)
      nameInput.addEventListener('input', checkName)
      document.addEventListener('keydown', onKey)
      window.addEventListener('resize', resize)
      resize()
      showFinish()
      show()
      checkName()
      ui.hidden = false
      // A first visit starts in the field; a return visit has its name and
      // can go straight to the turntable keys.
      if (!nameInput.value) nameInput.focus()

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
