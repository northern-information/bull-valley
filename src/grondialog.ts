// Talking to Gron (sharedraid.ts rule 10): a dialog over the valley that
// changes who you are. Two halves. Your Name takes a new username, checked
// as you type with the same rules as the first one (account.ts) and saved
// with PUT /auth/username. Your Character turns the roster on a small
// turntable, with the guitar finish for a character carrying one, and
// Become puts you in it. The caller applies what changed: the body, the
// saved picks, and the frames that tell the valley.
//
// The preview draws with its own small renderer at the game's PS1 snap: the
// snap resolution is shared by every material, and the game keeps drawing
// behind the dialog, so the preview leaves it alone.

import * as THREE from 'three'
import { isValidUsername, USERNAME_MAX } from './account.ts'
import { renameUsername, usernameAvailable } from './auth.ts'
import { SELECTABLE } from './characters.ts'
import { copy } from './copy.ts'
import { stepIndex } from './cycle.ts'
import { applyPose, buildFigure } from './figure.ts'
import { finishById, FINISHES } from './finishes.ts'
import { outfitById } from './outfits.ts'
import { samplePose } from './poses.ts'
import { createPS1Renderer } from './ps1.ts'
import type { FinishId } from './finishes.ts'
import type { OutfitId } from './outfits.ts'

export interface GronDialogOptions {
  username: string
  outfit: OutfitId
  finish: FinishId
  // The new username is saved; tell the valley.
  onRenamed: (username: string) => void
  // A new character (and finish); apply and tell the valley.
  onBecome: (outfit: OutfitId, finish: FinishId) => void
}

// What Gron says when you walk up; one at random.
const gronSays = () => [
  copy('gron.says_1'),
  copy('gron.says_2'),
  copy('gron.says_3'),
]

// How long typing pauses before the name is checked.
const CHECK_DELAY_MS = 300

// The turntable: turns a second, and the preview's pixel size.
const SPIN_PER_SECOND = 0.6
const PREVIEW_SIZE = 160

// Mounts the dialog over everything and resolves once it is closed.
export function openGronDialog({
  username,
  outfit,
  finish,
  onRenamed,
  onBecome,
}: GronDialogOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-gron'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-gron-title')
  const swatches = FINISHES.map(
    (one) =>
      `<button type="button" class="bv-swatch" role="radio" aria-checked="false"` +
      ` aria-label="${one.label}" data-finish="${one.id}"` +
      ` style="--swatch: ${one.color}"></button>`
  ).join('')
  root.innerHTML = `
    <div class="bv-account-ui bv-gron-ui">
      <h2 id="bv-gron-title">${copy('outfits.gron')}</h2>
      <p class="bv-account-lede bv-gron-says"></p>
      <form class="bv-gron-part" data-bv="gron-name" novalidate>
        <h3>${copy('gron.your_name')}</h3>
        <label class="bv-field">
          <span>${copy('username.field')}</span>
          <input type="text" data-bv="gron-username" maxlength="${USERNAME_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-describedby="bv-gron-name-status">
        </label>
        <p class="bv-account-status" id="bv-gron-name-status" data-bv="gron-name-status" aria-live="polite">${copy('signin.rules')}</p>
        <button type="submit" class="bv-btn" data-bv="gron-rename" disabled>${copy('gron.change_name')}</button>
      </form>
      <div class="bv-gron-part" data-bv="gron-character">
        <h3>${copy('gron.your_character')}</h3>
        <canvas class="bv-gron-preview" width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}" aria-hidden="true"></canvas>
        <p class="bv-select-name" data-bv="gron-character-name" aria-live="polite"></p>
        <div class="bv-select-finish" data-bv="gron-finish" hidden>
          <div class="bv-select-swatches" role="radiogroup" aria-label="${copy('select.finish')}">${swatches}</div>
        </div>
        <div class="bv-select-actions">
          <button type="button" class="bv-btn" data-bv="gron-prev">${copy('select.previous')}</button>
          <button type="button" class="bv-btn bv-btn--primary" data-bv="gron-become">${copy('gron.become')}</button>
          <button type="button" class="bv-btn" data-bv="gron-next">${copy('select.next')}</button>
        </div>
        <p class="bv-account-status" data-bv="gron-character-status" aria-live="polite"></p>
      </div>
      <button type="button" class="bv-btn" data-bv="gron-close">${copy('gron.close')}</button>
    </div>`
  document.body.appendChild(root)

  const find = <T extends Element>(selector: string): T => {
    const found = root.querySelector<T>(selector)
    if (!found) throw new Error(`Missing ${selector}`)
    return found
  }
  const says = find<HTMLParagraphElement>('.bv-gron-says')
  const nameForm = find<HTMLFormElement>('[data-bv="gron-name"]')
  const input = find<HTMLInputElement>('[data-bv="gron-username"]')
  const nameStatus = find<HTMLParagraphElement>('[data-bv="gron-name-status"]')
  const renameBtn = find<HTMLButtonElement>('[data-bv="gron-rename"]')
  const canvas = find<HTMLCanvasElement>('.bv-gron-preview')
  const characterName = find<HTMLParagraphElement>(
    '[data-bv="gron-character-name"]'
  )
  const finishRow = find<HTMLDivElement>('[data-bv="gron-finish"]')
  const swatchButtons = Array.from(
    finishRow.querySelectorAll<HTMLButtonElement>('[data-finish]')
  )
  const prevBtn = find<HTMLButtonElement>('[data-bv="gron-prev"]')
  const nextBtn = find<HTMLButtonElement>('[data-bv="gron-next"]')
  const becomeBtn = find<HTMLButtonElement>('[data-bv="gron-become"]')
  const characterStatus = find<HTMLParagraphElement>(
    '[data-bv="gron-character-status"]'
  )
  const closeBtn = find<HTMLButtonElement>('[data-bv="gron-close"]')

  const lines = gronSays()
  says.textContent = lines[Math.floor(Math.random() * lines.length)]

  const tone = (el: HTMLElement, text: string, t: 'ok' | 'bad' | null) => {
    el.textContent = text
    if (t) el.dataset.tone = t
    else delete el.dataset.tone
  }

  return new Promise<void>((resolve) => {
    // --- Your Name ---------------------------------------------------------

    let current = username
    let available: boolean | null = null
    let checking: ReturnType<typeof setTimeout> | null = null
    let renaming = false
    input.value = current

    const handle = () => input.value.trim()
    // Only the case of your own name changes: it is yours, so it is free.
    const isOwn = (name: string) => name.toLowerCase() === current.toLowerCase()

    const refreshName = () => {
      const name = handle()
      renameBtn.disabled =
        renaming || name === current || !isValidUsername(name) || !available
    }

    const check = () => {
      const name = handle()
      available = null
      if (checking !== null) clearTimeout(checking)
      checking = null
      if (name === current) {
        tone(nameStatus, copy('gron.name_now'), null)
      } else if (!isValidUsername(name)) {
        tone(nameStatus, copy('signin.rules'), name ? 'bad' : null)
      } else if (isOwn(name)) {
        available = true
        tone(nameStatus, copy('username.available'), 'ok')
      } else {
        tone(nameStatus, copy('username.checking'), null)
        checking = setTimeout(() => {
          checking = null
          void usernameAvailable(name).then((answer) => {
            if (handle() !== name) return
            if (!answer) {
              tone(nameStatus, copy('auth.unreachable'), 'bad')
            } else if (answer.reason === 'limited') {
              tone(nameStatus, copy('username.limited'), 'bad')
            } else {
              available = answer.available
              tone(
                nameStatus,
                copy(
                  answer.available ? 'username.available' : 'username.taken'
                ),
                answer.available ? 'ok' : 'bad'
              )
            }
            refreshName()
          })
        }, CHECK_DELAY_MS)
      }
      refreshName()
    }

    const rename = async (e: Event) => {
      e.preventDefault()
      const name = handle()
      if (renameBtn.disabled) return
      renaming = true
      refreshName()
      const result = await renameUsername(name)
      renaming = false
      if (result.ok) {
        current = name
        available = null
        tone(nameStatus, copy('gron.renamed', { name }), 'ok')
        onRenamed(name)
      } else if ('taken' in result) {
        available = false
        tone(nameStatus, copy('username.taken'), 'bad')
      } else {
        tone(nameStatus, result.error, 'bad')
      }
      refreshName()
    }

    // --- Your Character ----------------------------------------------------

    let worn = outfit
    let wornFinish = finish
    let index = Math.max(0, SELECTABLE.indexOf(outfit))
    let finishIndex = Math.max(
      0,
      FINISHES.findIndex((one) => one.id === finish)
    )

    const renderer = createPS1Renderer(canvas)
    renderer.setSize(PREVIEW_SIZE, PREVIEW_SIZE, false)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#000000')
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a3a3a', 2.2))
    const key = new THREE.DirectionalLight('#ffffff', 1.5)
    key.position.set(0.6, 1, 0.9)
    scene.add(key)
    // Close enough that a standing figure fills the square, head to boots.
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50)
    camera.position.set(0, 1.0, 3.7)
    camera.lookAt(0, 0.9, 0)
    const turntable = new THREE.Group()
    scene.add(turntable)
    let figure: THREE.Group | null = null

    const showCharacter = () => {
      const id = SELECTABLE[index]
      const look = outfitById(id)
      characterName.textContent = look.label
      finishRow.hidden = look.onBack !== 'guitar'
      const color = finishById(FINISHES[finishIndex].id).color
      if (figure) turntable.remove(figure)
      const built = buildFigure(id, { guitarFinish: color })
      applyPose(built, samplePose('stand'))
      figure = built.group
      turntable.add(figure)
      for (const button of swatchButtons) {
        button.setAttribute(
          'aria-checked',
          String(button.dataset.finish === FINISHES[finishIndex].id)
        )
      }
      const same =
        id === worn &&
        (finishRow.hidden || FINISHES[finishIndex].id === wornFinish)
      becomeBtn.disabled = same
      tone(characterStatus, same ? copy('gron.character_now') : '', null)
    }

    const step = (dir: number) => {
      index = stepIndex(index, SELECTABLE.length, dir)
      turntable.rotation.y = 0
      showCharacter()
    }

    const onSwatch = (e: Event) => {
      const button =
        e.target instanceof Element
          ? e.target.closest<HTMLButtonElement>('[data-finish]')
          : null
      const at = FINISHES.findIndex((one) => one.id === button?.dataset.finish)
      if (at < 0) return
      finishIndex = at
      showCharacter()
    }

    const become = () => {
      worn = SELECTABLE[index]
      wornFinish = FINISHES[finishIndex].id
      onBecome(worn, wornFinish)
      showCharacter()
      tone(
        characterStatus,
        copy('gron.became', { name: outfitById(worn).label }),
        'ok'
      )
    }

    let last = performance.now()
    renderer.setAnimationLoop(() => {
      const now = performance.now()
      turntable.rotation.y +=
        Math.min(0.05, (now - last) / 1000) * SPIN_PER_SECOND
      last = now
      renderer.render(scene, camera)
    })

    // --- The dialog --------------------------------------------------------

    // The game listens on the document too, and pointer lock is off while
    // Gron talks, so its keys do nothing; Escape closes the dialog.
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.preventDefault()
      close()
    }

    const onPrev = () => step(-1)
    const onNext = () => step(1)
    const onSubmit = (e: Event) => void rename(e)

    function close(): void {
      if (checking !== null) clearTimeout(checking)
      renderer.setAnimationLoop(null)
      renderer.dispose()
      renderer.forceContextLoss()
      document.removeEventListener('keydown', onKey)
      root.remove()
      resolve()
    }

    input.addEventListener('input', check)
    nameForm.addEventListener('submit', onSubmit)
    prevBtn.addEventListener('click', onPrev)
    nextBtn.addEventListener('click', onNext)
    becomeBtn.addEventListener('click', become)
    finishRow.addEventListener('click', onSwatch)
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    check()
    showCharacter()
    closeBtn.focus()
  })
}
