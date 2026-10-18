// All DOM: countdown, the season (seasonhud.ts), the chat log (chathud.ts),
// the phone, geometrie and the wards (vitalshud.ts), the pack grid, its item card and the
// hotbar (packhud.ts), prompts, item labels, the intro/pause overlay, and
// the strike static. Markup is generated here so index.html stays a bare
// #bv-root.

import { PACK_IN_MENU, WORLD } from './bindings.ts'
import { BookHud } from './bookhud.ts'
import { BuffHud } from './buffhud.ts'
import { ChatHud } from './chathud.ts'
import { CitgoMap } from './citgomap.ts'
import { copy } from './copy.ts'
import { el, find, text } from './dom.ts'
import { LevelHud } from './levelhud.ts'
import { npcHeader, sectionHead } from './npcdialog.ts'
import { PackHud } from './packhud.ts'
import { SEASON_COPY, SeasonHud } from './seasonhud.ts'
import { volumeSliders } from './settingsui.ts'
import { TaskHud } from './taskhud.ts'
import { VitalsHud } from './vitalshud.ts'
import type { AvatarLook } from './avatarview.ts'
import type { Buff } from './buffbar.ts'
import type { ChatLine } from './chat.ts'
import type { GeometrieAxis, PackItem } from './interfaces.ts'
import type { BagTab } from './packgrid.ts'
import type { BagStatus, HotbarSlotView } from './packhud.ts'
import type { SettingsStore } from './settingsui.ts'

// The floating name over an item, placed by its top in the view: x and y
// from 0 at the left and top to 1 at the right and bottom.
interface ItemLabelView {
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

type BeginState = keyof typeof BEGIN_LABELS

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
      const head = document.createElement('th')
      head.append(text('span', key, 'bv-npc-key'))
      row.append(head, action)
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
  phoneCanvas: HTMLCanvasElement
  promptEl: HTMLParagraphElement
  itemLabelEl: HTMLParagraphElement
  // The pack over the valley, and the hotbar along the bottom.
  pack: PackHud
  // Geometrie and the wards, in the upper left.
  vitals: VitalsHud
  // The buffs over the hotbar, winding down.
  buffs: BuffHud
  hurtWash: HTMLDivElement
  staticWrap: HTMLDivElement
  staticCanvas: HTMLCanvasElement
  reticle: HTMLDivElement
  intro: HTMLDivElement
  // The overlay's status: paused, or ready to begin.
  introState: HTMLElement
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
  // The map (M), once the world is built (mountMap).
  map: CitgoMap | null = null
  private ui: HTMLElement
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
    this.ui = ui

    // The season: the tracker in the upper right and the banners.
    this.season = new SeasonHud(ui)
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

    // Geometrie and the wards: the tetrahedron and the bar, upper left.
    this.vitals = new VitalsHud(ui)

    // The phone in a PS1-style flipper hand, dialing a Citgo portal.
    // phone.ts draws the hand, the phone and the screen into this one
    // low-res canvas.
    this.phone = el('div', 'bv-phone')
    this.phone.setAttribute('aria-hidden', 'true')
    this.phoneCanvas = el('canvas', 'bv-phone-screen')
    this.phone.appendChild(this.phoneCanvas)
    ui.appendChild(this.phone)

    // Interaction prompt, and the name over the item E would act on.
    this.promptEl = el('p', 'bv-prompt')
    this.promptEl.hidden = true
    ui.appendChild(this.promptEl)
    this.itemLabelEl = el('p', 'bv-item-label')
    this.itemLabelEl.hidden = true
    ui.appendChild(this.itemLabelEl)

    // The pack and the hotbar, then the Book of Shadows: each a panel over
    // the rest of the HUD (the log, the phone, the prompt), in DOM order.
    this.pack = new PackHud(root, ui)
    this.buffs = new BuffHud(this.pack.bar)
    this.book = new BookHud(ui)
    // A banner and the book's toast sweep over the open pack or book too.
    ui.append(this.season.banner, this.book.toast)

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

    // Intro / pause overlay, in the keepers' dialogs' frame (npcdialog.ts):
    // the header, 01 the season, 02 the controls, 03 who is raiding with
    // their settings, and Begin in the footer.
    this.intro = el('div', 'bv-intro')
    this.intro.setAttribute('role', 'dialog')
    this.intro.setAttribute('aria-modal', 'true')
    this.intro.setAttribute('aria-labelledby', 'bv-intro-title')
    this.intro.innerHTML = `
      <div class="bv-npc-ui bv-npc-ui--wide">
        ${npcHeader({
          titleId: 'bv-intro-title',
          title: copy('intro.title'),
          eyebrow: copy('intro.eyebrow'),
          where: copy('intro.where'),
          status:
            '<span class="bv-npc-eyebrow bv-npc-tag" data-bv="intro-state"></span>',
          speech: false,
        })}
        <section class="bv-npc-section" data-bv="intro-season">
          ${sectionHead(1, SEASON_COPY.kicker, 'intro-live')}
        </section>
        <section class="bv-npc-section bv-npc-side" data-bv="intro-controls">
          ${sectionHead(2, copy('intro.controls_label'), 'intro-keys')}
          <table class="bv-controls" aria-label="${copy('intro.controls_label')}" data-bv="controls"></table>
        </section>
        <section class="bv-npc-section" data-bv="intro-as" hidden>
          ${sectionHead(3, copy('intro.raider'), 'intro-raider')}
          <div class="bv-npc-grid">
            <p class="bv-intro-as bv-npc-c6">
              <span class="bv-npc-label">${copy('intro.raiding_as')}</span>
              <b data-bv="intro-username"></b>
            </p>
            <button type="button" class="bv-btn bv-npc-btn bv-npc-c3" data-bv="intro-account">${copy('intro.account')}</button>
            <button type="button" class="bv-btn bv-npc-btn bv-npc-c3" data-bv="intro-sign-out">${copy('intro.sign_out')}</button>
            <div class="bv-npc-pair bv-intro-settings bv-npc-c12" data-bv="intro-settings"></div>
          </div>
        </section>
        <footer class="bv-npc-foot">
          <p class="bv-npc-label">${copy('intro.fine')}</p>
          <div class="bv-intro-actions">
            <button type="button" class="bv-btn bv-btn--primary bv-btn--stack bv-npc-btn" data-bv="begin"></button>
          </div>
        </footer>
      </div>`
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
    find<HTMLElement>(this.intro, '[data-bv="npc-lede"]').textContent =
      copy('intro.note')
    find<HTMLElement>(this.intro, '[data-bv="intro-live"]').textContent =
      SEASON_COPY.live
    // What the season asks and pays, under its head.
    find<HTMLElement>(this.intro, '[data-bv="intro-season"]').append(
      this.season.card
    )
    this.introState = find(this.intro, '[data-bv="intro-state"]')
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

  // The volume sliders on the Raiding As line, sharing the main menu's
  // store; it shows with that line once the titles settle the account.
  setSettings(store: SettingsStore): void {
    find<HTMLElement>(this.intro, '[data-bv="intro-settings"]').replaceChildren(
      ...volumeSliders(store)
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

  showBag(show: boolean, look?: AvatarLook): boolean {
    return this.pack.show(show, look)
  }

  // The Book of Shadows opens over the valley as the pack does, and the
  // aiming HUD steps aside for it the same way.
  showBook(show: boolean): boolean {
    this.root.classList.toggle('bv-shell--inventory', show)
    return this.book.show(show)
  }

  // The map, built once the world is: its roads and its Citgos.
  mountMap(options: ConstructorParameters<typeof CitgoMap>[1]): CitgoMap {
    this.map = new CitgoMap(this.ui, options)
    return this.map
  }

  // The map opens over the valley as the book does.
  showMap(show: boolean): boolean {
    this.root.classList.toggle('bv-shell--inventory', show)
    return this.map?.show(show) ?? false
  }

  setHotbar(slots: HotbarSlotView[]): void {
    this.pack.setHotbar(slots)
  }

  // The loop calls these every frame; the vitals touch the page only when
  // something on them moves.
  setGeometrie(levels: Record<GeometrieAxis, number>): void {
    this.vitals.setWards(levels)
  }

  turnWards(time: number): void {
    this.vitals.turn(time)
  }

  setLevel(level: number): void {
    this.vitals.setLevel(level)
  }

  // Pointer lock drives the center dot.
  setLocked(locked: boolean): void {
    this.root.classList.toggle('bv-shell--locked', locked)
    // A locked cursor hovers nothing, and pointerleave never comes.
    if (locked) this.chat.hovered = false
  }

  // The buffs going, over the hotbar (buffbar.ts activeBuffs).
  setBuffs(buffs: readonly Buff[]): void {
    this.buffs.set(buffs)
    this.root.classList.toggle('bv-shell--buffs', buffs.length > 0)
  }

  // The geometrie bar at `points` of `max`.
  setHealth(points: number, max: number): void {
    this.vitals.setHealth(points, max)
  }

  // A touch's number under the bar, and what `ward` took off it.
  popDamage(damage: number, warded: number, ward: GeometrieAxis): void {
    this.vitals.hit(damage, warded, ward, performance.now())
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
    this.introState.textContent = copy(paused ? 'intro.paused' : 'intro.ready')
  }
}
