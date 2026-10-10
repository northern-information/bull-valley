// All DOM: countdown, the season (seasonhud.ts), the chat log (chathud.ts),
// scope phone, geometrie's triangle, the pack grid, its item card and the
// hotbar (packhud.ts), prompts, item labels, the intro/pause overlay, and
// the strike static. Markup is generated here so index.html stays a bare
// #bv-root.

import { PACK_IN_MENU, WORLD } from './bindings.ts'
import { BookHud } from './bookhud.ts'
import { ChatHud } from './chathud.ts'
import { copy } from './copy.ts'
import { el, find, text } from './dom.ts'
import { MAX_HEALTH } from './health.ts'
import { LevelHud } from './levelhud.ts'
import { PackHud } from './packhud.ts'
import { SeasonHud } from './seasonhud.ts'
import { musicSlider } from './settingsui.ts'
import { TaskHud } from './taskhud.ts'
import type { ChatLine } from './chat.ts'
import type { GeometrieAxis, PackItem } from './interfaces.ts'
import type { BagTab } from './packgrid.ts'
import type { BagStatus, HotbarSlotView } from './packhud.ts'
import type { SettingsStore } from './settingsui.ts'

// Geometrie's triangle (geometrie.ts): one corner per level, each lit by
// its own glow over the dim red face, in the triangle's own units.
const GEOMETRIE_CORNERS: Record<GeometrieAxis, { x: number; y: number }> = {
  high: { x: 50, y: 6 },
  stimulated: { x: 94, y: 84 },
  drunk: { x: 6, y: 84 },
}
const GEOMETRIE_POINTS = Object.values(GEOMETRIE_CORNERS)
  .map(({ x, y }) => `${x},${y}`)
  .join(' ')

function geometrieMarkup(): string {
  const glows = Object.entries(GEOMETRIE_CORNERS)
  return `
    <svg viewBox="0 0 100 90" aria-hidden="true">
      <defs>
        ${glows
          .map(
            ([axis, { x, y }]) => `
          <radialGradient id="bv-geo-${axis}" gradientUnits="userSpaceOnUse" cx="${x}" cy="${y}" r="52">
            <stop offset="0" class="bv-geo-hot" />
            <stop offset="0.25" class="bv-geo-lit" />
            <stop offset="1" class="bv-geo-lit" stop-opacity="0" />
          </radialGradient>`
          )
          .join('')}
      </defs>
      <polygon class="bv-geo-face" points="${GEOMETRIE_POINTS}" />
      ${glows
        .map(
          ([axis]) =>
            `<polygon class="bv-geo-glow" data-axis="${axis}" points="${GEOMETRIE_POINTS}" fill="url(#bv-geo-${axis})" />`
        )
        .join('')}
      <polygon class="bv-geo-edge" points="${GEOMETRIE_POINTS}" />
    </svg>`
}

// The floating name over an item, placed by its top in the view: x and y
// from 0 at the left and top to 1 at the right and bottom.
export interface ItemLabelView {
  text: string
  dim: boolean
  x: number
  y: number
}

// The Begin button's states and their labels. The button holds every label
// at once, stacked in one cell with only the current one visible, so it is
// always as wide as the longest and never resizes when its state changes.
const BEGIN_LABELS = {
  loading: copy('hud.begin_loading'),
  play: copy('hud.begin_play'),
  resume: copy('hud.begin_resume'),
  failed: copy('hud.begin_failed'),
} as const

export type BeginState = keyof typeof BEGIN_LABELS

// The controls table: two bindings a row, key then action; an odd last
// one gets the whole row.
function controlRows(
  controls: readonly { key: string; label: string }[]
): HTMLTableRowElement[] {
  const rows: HTMLTableRowElement[] = []
  for (let i = 0; i < controls.length; i += 2) {
    const row = document.createElement('tr')
    const pair = controls.slice(i, i + 2)
    for (const [j, { key, label }] of pair.entries()) {
      const action = text('td', label)
      if (pair.length === 1 && j === 0) action.colSpan = 3
      row.append(text('th', key), action)
    }
    rows.push(row)
  }
  return rows
}

// The HUD builds its own markup, so a missing context is a bug here.
function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`Hud: missing ${what}`)
  return value
}

export class Hud {
  root: HTMLElement
  canvas: HTMLCanvasElement
  countdown: HTMLParagraphElement
  // The chat log in the lower left.
  chat: ChatHud
  phone: HTMLDivElement
  scopeCanvas: HTMLCanvasElement
  promptEl: HTMLParagraphElement
  itemLabelEl: HTMLParagraphElement
  // The pack over the valley, and the hotbar along the bottom.
  pack: PackHud
  geometrie: HTMLDivElement
  geometrieGlows: Map<GeometrieAxis, SVGPolygonElement>
  geometrieView = ''
  health: HTMLDivElement
  healthPips: HTMLSpanElement[]
  healthView = -1
  hurtWash: HTMLDivElement
  staticWrap: HTMLDivElement
  staticCanvas: HTMLCanvasElement
  reticle: HTMLDivElement
  intro: HTMLDivElement
  beginBtn: HTMLButtonElement
  // Failed is final: the pause overlay never offers Resume over it.
  beginFailed = false
  accountBtn: HTMLButtonElement
  signOutBtn: HTMLButtonElement
  raiderEl: HTMLElement
  // The season's tracker, its card on the overlay, and its banners.
  season: SeasonHud
  // The Book of Shadows, over the valley while it is open.
  book: BookHud
  // The daily task's row in the season's tracker.
  task: TaskHud
  // The raider's level, under it.
  level: LevelHud

  constructor(root: HTMLElement) {
    this.root = root
    root.classList.add('bv-shell')

    this.canvas = el('canvas', 'bv-canvas')
    this.canvas.setAttribute('aria-hidden', 'true')
    root.appendChild(this.canvas)

    const ui = el('div', 'bv-ui')
    root.appendChild(ui)

    // The season: the tracker in the upper right and the banners.
    this.season = new SeasonHud(ui)
    this.book = new BookHud(ui)
    this.task = new TaskHud(this.season.tracker)
    this.level = new LevelHud(this.season.tracker)

    // Loadout countdown: bare numbers, top center.
    this.countdown = el('p', 'bv-countdown')
    this.countdown.setAttribute('role', 'timer')
    this.countdown.setAttribute('aria-label', copy('hud.countdown_label'))
    this.countdown.hidden = true
    ui.appendChild(this.countdown)

    // The lower-left column: the chat log.
    const dock = el('div', 'bv-dock')
    ui.appendChild(dock)
    this.chat = new ChatHud(dock)

    // Geometrie: a red triangle in the lower right, each corner lit by its
    // level. Before the phone, which covers it when raised.
    this.geometrie = el('div', 'bv-geometrie')
    this.geometrie.setAttribute('role', 'img')
    this.geometrie.innerHTML = geometrieMarkup()
    this.geometrieGlows = new Map(
      [
        ...this.geometrie.querySelectorAll<SVGPolygonElement>('[data-axis]'),
      ].map((glow) => [glow.dataset.axis as GeometrieAxis, glow])
    )
    this.setGeometrie({ high: 0, stimulated: 0, drunk: 0 })
    ui.appendChild(this.geometrie)

    // Health (health.ts): chunky red blocks under the triangle, one a
    // point, dark when lost.
    this.health = el('div', 'bv-health')
    this.health.setAttribute('role', 'img')
    this.healthPips = Array.from({ length: MAX_HEALTH }, () =>
      el('span', 'bv-health-pip')
    )
    this.health.append(...this.healthPips)
    this.setHealth(MAX_HEALTH)
    ui.appendChild(this.health)

    // The scope: a phone held in a PS1-style flipper hand. scope.ts draws the
    // hand, the phone and the screen into this one low-res canvas.
    this.phone = el('div', 'bv-phone')
    this.phone.setAttribute('aria-hidden', 'true')
    this.scopeCanvas = el('canvas', 'bv-scope')
    this.phone.appendChild(this.scopeCanvas)
    ui.appendChild(this.phone)

    // Interaction prompt, and the name over the item E would act on.
    this.promptEl = el('p', 'bv-prompt')
    this.promptEl.hidden = true
    ui.appendChild(this.promptEl)
    this.itemLabelEl = el('p', 'bv-item-label')
    this.itemLabelEl.hidden = true
    ui.appendChild(this.itemLabelEl)

    // The pack and the hotbar.
    this.pack = new PackHud(root, ui)

    // A shadow's touch: the view washed red, fading (hurt).
    this.hurtWash = el('div', 'bv-hurt')
    this.hurtWash.setAttribute('aria-hidden', 'true')
    ui.appendChild(this.hurtWash)

    // The static when geometrie shatters.
    this.staticWrap = el('div', 'bv-static')
    this.staticWrap.hidden = true
    this.staticCanvas = el('canvas')
    this.staticCanvas.width = 160
    this.staticCanvas.height = 90
    this.staticWrap.appendChild(this.staticCanvas)
    const staticLabel = el('p', 'bv-static-label')
    staticLabel.textContent = copy('hud.geometrie_shattered')
    this.staticWrap.appendChild(staticLabel)
    ui.appendChild(this.staticWrap)

    // Center dot: the aim point while the cursor is locked and hidden.
    this.reticle = el('div', 'bv-reticle')
    this.reticle.setAttribute('aria-hidden', 'true')
    ui.appendChild(this.reticle)

    // Intro / pause overlay.
    this.intro = el('div', 'bv-intro')
    this.intro.setAttribute('role', 'dialog')
    this.intro.setAttribute('aria-modal', 'true')
    this.intro.innerHTML = `
      <h2>${copy('intro.title')}</h2>
      <p class="bv-intro-note" data-bv="intro-note"></p>
      <table class="bv-controls" aria-label="${copy('intro.controls_label')}" data-bv="controls"></table>
      <div class="bv-intro-actions">
        <button type="button" class="bv-btn bv-btn--primary bv-btn--stack" data-bv="begin"></button>
      </div>
      <p class="bv-intro-as" data-bv="intro-as" hidden>
        ${copy('intro.raiding_as')} <b data-bv="intro-username"></b>
        <button type="button" class="bv-link" data-bv="intro-account">${copy('intro.account')}</button>
        <button type="button" class="bv-link" data-bv="intro-sign-out">${copy('intro.sign_out')}</button>
        <span class="bv-intro-settings" data-bv="intro-settings"></span>
      </p>
      <p class="bv-intro-note bv-intro-fine">${copy('intro.fine')}</p>`
    find<HTMLTableElement>(this.intro, '[data-bv="controls"]').replaceChildren(
      ...controlRows([
        ...Object.values(WORLD).map(({ key, labelKey }) => ({
          key,
          label: copy(labelKey),
        })),
        // The pack's own keys say where they work.
        ...PACK_IN_MENU.map(({ key, labelKey }) => ({
          key,
          label: copy('keys.in_pack', { action: copy(labelKey) }),
        })),
      ])
    )
    const note = find<HTMLElement>(this.intro, '[data-bv="intro-note"]')
    note.textContent = copy('intro.note')
    // What the season asks and pays, under the note.
    note.after(this.season.card)
    ui.appendChild(this.intro)
    this.beginBtn = find(this.intro, '[data-bv="begin"]')
    this.beginBtn.replaceChildren(
      ...Object.entries(BEGIN_LABELS).map(([state, label]) => {
        const span = text('span', label)
        span.dataset.state = state
        return span
      })
    )
    this.setBegin('play')
    this.raiderEl = find(this.intro, '[data-bv="intro-username"]')
    this.accountBtn = find(this.intro, '[data-bv="intro-account"]')
    this.signOutBtn = find(this.intro, '[data-bv="intro-sign-out"]')
  }

  // Who the pause overlay says is raiding, with Account and Sign Out beside
  // it; hidden until the titles settle a username.
  setRaider(username: string): void {
    this.raiderEl.textContent = username
    find<HTMLElement>(this.intro, '[data-bv="intro-as"]').hidden = false
  }

  // The music slider on the Raiding As line, sharing the main menu's
  // store; it shows with that line once the titles settle the account.
  setSettings(store: SettingsStore): void {
    find<HTMLElement>(this.intro, '[data-bv="intro-settings"]').replaceChildren(
      musicSlider(store)
    )
  }

  // A null text hides the countdown.
  setCountdown(text: string | null): void {
    this.countdown.hidden = !text
    if (text && this.countdown.textContent !== text) {
      this.countdown.textContent = text
    }
  }

  prompt(text: string | null): void {
    this.promptEl.hidden = !text
    if (text && this.promptEl.textContent !== text) {
      this.promptEl.textContent = text
    }
  }

  // The center dot, full while E would do something and half there otherwise.
  setReticleActive(active: boolean): void {
    this.reticle.classList.toggle('bv-reticle--active', active)
  }

  // The name over an item, or null for none. The loop calls this every
  // frame; the text changes only when it does.
  itemLabel(view: ItemLabelView | null): void {
    const label = this.itemLabelEl
    label.hidden = !view
    if (!view) return
    if (label.textContent !== view.text) label.textContent = view.text
    label.classList.toggle('bv-item-label--dim', view.dim)
    label.style.left = `${view.x * 100}%`
    label.style.top = `${view.y * 100}%`
  }

  // --- The chat log (chathud.ts) ------------------------------------------

  // A line the game says to the player alone, in the chat log.
  tell(text: string): void {
    this.chat.tell(text)
  }

  chatLine(line: ChatLine, now: number): void {
    this.chat.line(line, now)
  }

  get chatLines(): ChatLine[] {
    return this.chat.lines
  }

  wheelChat(e: WheelEvent): void {
    this.chat.wheel(e)
  }

  pageChat(dir: 1 | -1): void {
    this.chat.page(dir)
  }

  get chatOpen(): boolean {
    return this.chat.open
  }

  openChat(): void {
    this.chat.openField()
  }

  closeChat(): string {
    return this.chat.closeField()
  }

  tickChat(now: number): void {
    this.chat.tick(now)
  }

  // --- The pack and the hotbar (packhud.ts) --------------------------------

  // The tab the grid shows.
  get bagTab(): BagTab {
    return this.pack.tab
  }

  // The item under the cursor (or focus) in the grid, whose card shows.
  get bagHovered(): PackItem | null {
    return this.pack.hovered
  }

  setLocker(open: boolean): void {
    this.pack.setLocker(open)
  }

  selectBagTab(tab: BagTab): void {
    this.pack.selectTab(tab)
  }

  setBag(items: PackItem[], iconOf: (kind: string) => string): void {
    this.pack.set(items, iconOf)
  }

  closeBagMenu(): void {
    this.pack.closeMenu()
  }

  setBagStatus(status: BagStatus): void {
    this.pack.setStatus(status)
  }

  showBag(show: boolean): boolean {
    return this.pack.show(show)
  }

  // The Book of Shadows opens over the valley as the pack does, and the
  // aiming HUD steps aside for it the same way.
  showBook(show: boolean): boolean {
    this.root.classList.toggle('bv-shell--inventory', show)
    return this.book.show(show)
  }

  setHotbar(slots: HotbarSlotView[]): void {
    this.pack.setHotbar(slots)
  }

  // The loop calls this every frame; the triangle is touched only when a
  // level moves by a percent.
  setGeometrie(levels: Record<GeometrieAxis, number>): void {
    const percent = (axis: GeometrieAxis) => Math.round(levels[axis] * 100)
    const view = `${percent('high')}:${percent('stimulated')}:${percent('drunk')}`
    if (view === this.geometrieView) return
    this.geometrieView = view
    for (const [axis, glow] of this.geometrieGlows) {
      glow.style.opacity = String(percent(axis) / 100)
    }
    this.geometrie.setAttribute(
      'aria-label',
      copy('hud.geometrie_label', {
        high: String(percent('high')),
        stimulated: String(percent('stimulated')),
        drunk: String(percent('drunk')),
      })
    )
  }

  // Pointer lock drives the center dot.
  setLocked(locked: boolean): void {
    this.root.classList.toggle('bv-shell--locked', locked)
    // A locked cursor hovers nothing, and pointerleave never comes.
    if (locked) this.chat.hovered = false
  }

  // The health blocks lit to `points`.
  setHealth(points: number): void {
    if (points === this.healthView) return
    this.healthView = points
    for (const [i, pip] of this.healthPips.entries()) {
      pip.classList.toggle('bv-health-pip--lost', i >= points)
    }
    this.health.dataset.health = String(points)
    this.health.setAttribute(
      'aria-label',
      copy('hud.health_label', { health: points, max: MAX_HEALTH })
    )
  }

  // A touch: the red wash over the view, from the top, again.
  hurt(): void {
    this.hurtWash.classList.remove('bv-hurt--on')
    // Read layout so the animation starts over.
    void this.hurtWash.offsetWidth
    this.hurtWash.classList.add('bv-hurt--on')
  }

  showStatic(show: boolean): void {
    this.staticWrap.hidden = !show
  }

  drawStatic(): void {
    const ctx = required(
      this.staticCanvas.getContext('2d'),
      'static 2D context'
    )
    const img = ctx.createImageData(160, 90)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }

  // Shows one of the Begin button's labels; it is clickable only to play or
  // resume. The others stay in the button, hidden, holding its width.
  setBegin(state: BeginState): void {
    if (this.beginFailed) return
    if (state === 'failed') this.beginFailed = true
    for (const span of this.beginBtn.querySelectorAll<HTMLElement>(
      '[data-state]'
    )) {
      const current = span.dataset.state === state
      span.classList.toggle('bv-btn-label--off', !current)
      span.setAttribute('aria-hidden', String(!current))
    }
    this.beginBtn.disabled = state === 'loading' || state === 'failed'
  }

  showIntro(show: boolean, paused?: boolean): void {
    this.intro.hidden = !show
    this.root.classList.toggle('bv-shell--intro', show)
    if (show) this.setBegin(paused ? 'resume' : 'play')
  }
}
