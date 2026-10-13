// The character select: a black overlay with one figure on a PS1
// turntable, its name, the username you raid as (with Sign Out), and
// Previous / Next / Choose. A
// character with a guitar on their back also gets the finish row: the
// finish name, one swatch per finish, and Randomize. It is mounted at boot
// beneath the account step and the main menu, so it shows once Die is
// pressed, and run() arms it once it is showing. The game's renderer does not exist until the
// terrain resolves, so the turntable draws with its own small renderer,
// disposed once a character is chosen. The roster comes from
// characters.ts, the finishes from finishes.ts, the bodies from figure.ts;
// the pick it opens on is the account's, and titles.ts saves the new one. The username is the account's, settled by the account
// step (signin.ts) before this runs.

import * as THREE from 'three'
import { SELECTABLE } from './characters.ts'
import { copy } from './copy.ts'
import { stepIndex } from './cycle.ts'
import { finder } from './dom.ts'
import { applyPose, buildFigure } from './figure.ts'
import { FINISHES, isFinish, randomFinish } from './finishes.ts'
import { outfitById } from './outfits.ts'
import { samplePose } from './poses.ts'
import { createPS1Renderer, setSnapResolution } from './ps1.ts'
import type { CharacterPick } from './characters.ts'

export interface CharacterSelectConfig {
  spinPerSecond: number
  revealFadeMs: number
  // CONFIG.render.downscale, so the turntable has the game's grain.
  downscale: number
}

export interface CharacterSelectOptions {
  config: CharacterSelectConfig
  // Account was pressed: the panel (accountpanel.ts) opens over the select.
  onAccount: () => void
  // Sign Out was pressed.
  onSignOut: () => void
}

export interface CharacterSelect {
  // Arms the screen for `username`, opening on the account's `pick`, and
  // resolves with the chosen outfit and finish once
  // the overlay has faded out and removed itself.
  run(username: string, pick: CharacterPick): Promise<CharacterPick>
}

// Mounts the overlay as the last child of <body>, black and inert until
// run(). Mount it before the title cards so they stack above it.
export function mountCharacterSelect({
  config,
  onAccount,
  onSignOut,
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
      <h2 id="bv-select-title">${copy('select.title')}</h2>
      <p class="bv-select-name" aria-live="polite"></p>
      <div class="bv-select-finish" hidden>
        <p class="bv-select-finish-name" aria-live="polite"></p>
        <div class="bv-select-finish-row">
          <div class="bv-select-swatches" role="radiogroup" aria-label="${copy('select.finish')}">${swatches}</div>
          <button type="button" class="bv-btn" data-bv="select-randomize">${copy('select.randomize')}</button>
        </div>
      </div>
      <p class="bv-select-as">
        ${copy('select.raiding_as')} <b data-bv="select-username"></b>
        <button type="button" class="bv-link" data-bv="select-account">${copy('select.account')}</button>
        <button type="button" class="bv-link" data-bv="select-sign-out">${copy('select.sign_out')}</button>
      </p>
      <div class="bv-select-actions">
        <button type="button" class="bv-btn" data-bv="select-prev">${copy('select.previous')}</button>
        <button type="button" class="bv-btn bv-btn--primary" data-bv="select-choose">${copy('select.choose')}</button>
        <button type="button" class="bv-btn" data-bv="select-next">${copy('select.next')}</button>
      </div>
      <p class="bv-select-hint"></p>
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
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
  const usernameEl = find<HTMLElement>('[data-bv="select-username"]')
  const signOutBtn = find<HTMLButtonElement>('[data-bv="select-sign-out"]')
  const accountBtn = find<HTMLButtonElement>('[data-bv="select-account"]')
  const prevBtn = find<HTMLButtonElement>('[data-bv="select-prev"]')
  const nextBtn = find<HTMLButtonElement>('[data-bv="select-next"]')
  const chooseBtn = find<HTMLButtonElement>('[data-bv="select-choose"]')

  function run(username: string, pick: CharacterPick): Promise<CharacterPick> {
    usernameEl.textContent = username
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

      let index = Math.max(0, SELECTABLE.indexOf(pick.outfit))
      let finishIndex = Math.max(
        0,
        FINISHES.findIndex((finish) => finish.id === pick.finish)
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
          ? copy('select.hint')
          : copy('select.hint_finish')
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
        chosen = true
        chooseBtn.disabled = true
        signOutBtn.disabled = true
        accountBtn.disabled = true
        fadeStart = performance.now()
      }

      const signOut = () => {
        if (chosen) return
        chosen = true
        signOutBtn.disabled = true
        chooseBtn.disabled = true
        accountBtn.disabled = true
        onSignOut()
      }

      const account = () => {
        if (chosen) return
        onAccount()
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
        resolve({
          outfit: SELECTABLE[index],
          finish: FINISHES[finishIndex].id,
        })
      }

      prevBtn.addEventListener('click', () => step(-1))
      nextBtn.addEventListener('click', () => step(1))
      chooseBtn.addEventListener('click', choose)
      randomizeBtn.addEventListener('click', randomize)
      swatchRow.addEventListener('click', onSwatch)
      signOutBtn.addEventListener('click', signOut)
      accountBtn.addEventListener('click', account)
      document.addEventListener('keydown', onKey)
      window.addEventListener('resize', resize)
      resize()
      showFinish()
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
