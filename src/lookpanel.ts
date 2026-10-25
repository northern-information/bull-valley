// Your Character, on Moab Coldë's tab beside his trade (moabdialog.ts,
// tradewindow.ts): the roster on a small turntable, with the guitar finish
// for a character carrying one, and Become puts you in it. The roster is
// the free one and every character the account has traded him for, read
// again at each step, so a character bought in the same window is there.
// The caller applies what changed: the body, the saved picks, and the
// frames that tell the valley.
//
// The preview draws with its own small renderer at the game's PS1 snap: the
// snap resolution is shared by every material, and the game keeps drawing
// behind the window, so the preview leaves it alone.

import * as THREE from 'three'
import { rosterFor } from './characters.ts'
import { copy } from './copy.ts'
import { stepIndex } from './cycle.ts'
import { finder, setStatus } from './dom.ts'
import { applyPose, attachCosmetics, buildFigure } from './figure.ts'
import { finishById, FINISHES } from './finishes.ts'
import { outfitById } from './outfits.ts'
import { samplePose } from './poses.ts'
import { createPS1Renderer } from './ps1.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { Worn } from './figure.ts'
import type { FinishId } from './finishes.ts'
import type { OutfitId } from './outfits.ts'

export interface LookPanelOptions {
  outfit: OutfitId
  finish: FinishId
  // Read at each step: what the account wears over any character
  // (cosmetics.ts), shown on the turntable too, and what unlocks more of
  // the roster.
  cosmetics: () => readonly CosmeticId[]
  // A new character (and finish); apply and tell the valley.
  onBecome: (outfit: OutfitId, finish: FinishId) => void
}

// The turntable: turns a second, and the preview's pixel size.
const SPIN_PER_SECOND = 0.6
const PREVIEW_SIZE = 160

// Fills `box` with the panel and returns what takes it down again.
export function mountLookPanel(
  box: HTMLElement,
  { outfit, finish, cosmetics, onBecome }: LookPanelOptions
): () => void {
  const swatches = FINISHES.map(
    (one) =>
      `<button type="button" class="bv-swatch" role="radio" aria-checked="false"` +
      ` aria-label="${one.label}" data-finish="${one.id}"` +
      ` style="--swatch: ${one.color}"></button>`
  ).join('')
  box.classList.add('bv-look')
  box.innerHTML = `
    <canvas class="bv-look-preview" width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}" aria-hidden="true"></canvas>
    <p class="bv-select-name" data-bv="look-character-name" aria-live="polite"></p>
    <div class="bv-select-finish" data-bv="look-finish" hidden>
      <div class="bv-select-swatches" role="radiogroup" aria-label="${copy('select.finish')}">${swatches}</div>
    </div>
    <div class="bv-select-actions">
      <button type="button" class="bv-btn" data-bv="look-prev">${copy('select.previous')}</button>
      <button type="button" class="bv-btn bv-btn--primary" data-bv="look-become">${copy('moab.become')}</button>
      <button type="button" class="bv-btn" data-bv="look-next">${copy('select.next')}</button>
    </div>
    <p class="bv-account-status" data-bv="look-status" aria-live="polite"></p>`

  const find = finder(box)
  const canvas = find<HTMLCanvasElement>('.bv-look-preview')
  const characterName = find<HTMLParagraphElement>(
    '[data-bv="look-character-name"]'
  )
  const finishRow = find<HTMLDivElement>('[data-bv="look-finish"]')
  const swatchButtons = Array.from(
    finishRow.querySelectorAll<HTMLButtonElement>('[data-finish]')
  )
  const prevBtn = find<HTMLButtonElement>('[data-bv="look-prev"]')
  const nextBtn = find<HTMLButtonElement>('[data-bv="look-next"]')
  const becomeBtn = find<HTMLButtonElement>('[data-bv="look-become"]')
  const status = find<HTMLParagraphElement>('[data-bv="look-status"]')

  let worn = outfit
  let wornFinish = finish
  let shown = outfit
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
  let wearing: Worn | null = null

  const showCharacter = () => {
    const look = outfitById(shown)
    characterName.textContent = look.label
    finishRow.hidden = look.onBack !== 'guitar'
    const color = finishById(FINISHES[finishIndex].id).color
    if (figure) turntable.remove(figure)
    wearing?.dispose()
    const built = buildFigure(shown, { guitarFinish: color })
    applyPose(built, samplePose('stand'))
    wearing = attachCosmetics(built, cosmetics())
    figure = built.group
    turntable.add(figure)
    for (const button of swatchButtons) {
      button.setAttribute(
        'aria-checked',
        String(button.dataset.finish === FINISHES[finishIndex].id)
      )
    }
    const same =
      shown === worn &&
      (finishRow.hidden || FINISHES[finishIndex].id === wornFinish)
    becomeBtn.disabled = same
    setStatus(status, same ? copy('moab.character_now') : '', null)
  }

  const step = (dir: number) => {
    const roster = rosterFor(cosmetics())
    shown =
      roster[stepIndex(Math.max(0, roster.indexOf(shown)), roster.length, dir)]
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
    worn = shown
    wornFinish = FINISHES[finishIndex].id
    onBecome(worn, wornFinish)
    showCharacter()
    setStatus(
      status,
      copy('moab.became', { name: outfitById(worn).label }),
      'ok'
    )
  }

  let last = performance.now()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    turntable.rotation.y +=
      Math.min(0.05, (now - last) / 1000) * SPIN_PER_SECOND
    last = now
    wearing?.update(now / 1000)
    renderer.render(scene, camera)
  })

  const onPrev = () => step(-1)
  const onNext = () => step(1)
  prevBtn.addEventListener('click', onPrev)
  nextBtn.addEventListener('click', onNext)
  becomeBtn.addEventListener('click', become)
  finishRow.addEventListener('click', onSwatch)

  showCharacter()

  return () => {
    renderer.setAnimationLoop(null)
    wearing?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
