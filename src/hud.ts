// All DOM: the compass (compasshud.ts), countdown, the season (seasonhud.ts), the chat log (chathud.ts),
// the phone, geometrie and the wards (vitalshud.ts), the pack grid, its item card and the
// hotbar (packhud.ts), prompts, item labels, the intro/menu overlay, and
// the strike static. Markup is generated here so index.html stays a bare
// #bv-root.

import { PACK_IN_MENU, WORLD } from './bindings.ts'
import { BookHud } from './bookhud.ts'
import { BossHud } from './bosshud.ts'
import { BuffHud } from './buffhud.ts'
import { burst } from './catchburst.ts'
import { ChatHud } from './chathud.ts'
import { CitgoMap } from './citgomap.ts'
import { CompassHud } from './compasshud.ts'
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
import type { Fanfare } from './catchfanfare.ts'
import type { ChatLine } from './chat.ts'
import type { PackItem, WardAxis } from './interfaces.ts'
import type { BagTab } from './packgrid.ts'
import type { BagStatus, HotbarSlotView } from './packhud.ts'
import type { PartyMember } from './peers.ts'
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
  connecting: copy('hud.begin_connecting'),
  reconnecting: copy('hud.begin_reconnecting'),
  lost: copy('hud.begin_lost'),
  play: copy('hud.begin_play'),
  failed: copy('hud.begin_failed'),
} as const

type BeginState = keyof typeof BEGIN_LABELS

// The line to the valley, as the intro overlay shows it: reaching it the
// first time, back again after a drop, given up on, or open. Nothing plays
// unless it is open.
export type Connection = 'connecting' | 'reconnecting' | 'lost' | 'online'

// The overlay's faces: the intro before the first Begin; once begun, the
// menu (the valley plays on under it, never paused), and the Controls and
// Settings it opens.
export type OverlayFace = 'intro' | 'menu' | 'controls' | 'settings'

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
  torch: HTMLDivElement
  torchCanvas: HTMLCanvasElement
  promptEl: HTMLParagraphElement
  itemLabelEl: HTMLParagraphElement
  // The pack over the valley, and the hotbar along the bottom.
  pack: PackHud
  // Geometrie and the wards, in the upper left.
  vitals: VitalsHud
  // The Warden's bar along the bottom, in the deep chamber (bosshud.ts).
  boss: BossHud
  // The buffs over the hotbar, winding down.
  buffs: BuffHud
  hurtWash: HTMLDivElement
  staticWrap: HTMLDivElement
  staticCanvas: HTMLCanvasElement
  reticle: HTMLDivElement
  intro: HTMLDivElement
  // Which face the overlay shows (OverlayFace).
  private face: OverlayFace = 'intro'
  // Whether the titles have settled who is raiding: the Settings face's
  // Raiding As line waits on it.
  private raiderSet = false
  beginBtn: HTMLButtonElement
  // Back to the main menu, beside Resume once the raider has begun.
  exitBtn: HTMLButtonElement
  // Failed is final: the menu overlay never offers Resume over it.
  beginFailed = false
  // The line to the valley; Begin waits on it.
  connection: Connection = 'connecting'
  private begun = false
  nameBtn: HTMLButtonElement
  accountBtn: HTMLButtonElement
  signOutBtn: HTMLButtonElement
  raiderEl: HTMLElement
  // The season's tracker, its card on the overlay, and its banners.
  season: SeasonHud
  // The Book of Shadows, over the valley while it is open.
  book: BookHud
  // The map (M), once the world is built (mountMap).
  map: CitgoMap | null = null
  // The compass across the top, while the pointer is locked.
  compass: CompassHud
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

    // The compass, top center, the countdown under it.
    this.compass = new CompassHud(ui)

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

    // The boss's bar, bottom center over the hotbar.
    this.boss = new BossHud(ui)

    // The phone in a PS1-style flipper hand, dialing a Citgo portal.
    // phone.ts draws the hand, the phone and the screen into this one
    // low-res canvas.
    this.phone = el('div', 'bv-phone')
    this.phone.setAttribute('aria-hidden', 'true')
    this.phoneCanvas = el('canvas', 'bv-phone-screen')
    this.phone.appendChild(this.phoneCanvas)
    ui.appendChild(this.phone)

    // The torch in the same hand (torchhand.ts), drawn the same way.
    this.torch = el('div', 'bv-torch')
    this.torch.setAttribute('aria-hidden', 'true')
    this.torchCanvas = el('canvas', 'bv-torch-hand')
    this.torch.appendChild(this.torchCanvas)
    ui.appendChild(this.torch)

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

    // Intro / menu overlay, in the keepers' dialogs' frame (npcdialog.ts),
    // one face at a time (OverlayFace): the intro's season and controls,
    // with Settings, before the first Begin; once begun, a short list
    // (Controls, Settings, Exit to Menu), each opening its own face with Back. Begin
    // is in the footer on every face. Each part names the faces it shows
    // on (data-faces).
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
          where: '',
          status: '',
          speech: false,
        })}
        <section class="bv-npc-section" data-bv="intro-season" data-faces="intro">
          ${sectionHead(SEASON_COPY.kicker, 'intro-live')}
        </section>
        <nav class="bv-overlay-list" aria-label="${copy('overlay.label')}" data-faces="intro menu">
          <button type="button" class="bv-btn bv-npc-btn" data-bv="overlay-controls" data-faces="menu">${copy('overlay.controls')}</button>
          <button type="button" class="bv-btn bv-npc-btn" data-bv="overlay-settings">${copy('overlay.settings')}</button>
          <button type="button" class="bv-btn bv-npc-btn" data-bv="exit-menu" hidden>${copy('intro.exit_menu')}</button>
        </nav>
        <section class="bv-npc-section bv-npc-side" data-bv="intro-controls" data-faces="intro controls">
          ${sectionHead(copy('intro.controls_label'), 'intro-keys')}
          <table class="bv-controls" aria-label="${copy('intro.controls_label')}" data-bv="controls"></table>
        </section>
        <section class="bv-npc-section" data-bv="intro-as" data-faces="settings">
          ${sectionHead(copy('intro.raider'), 'intro-raider')}
          <div class="bv-npc-grid">
            <p class="bv-intro-as bv-npc-c3">
              <span class="bv-npc-label">${copy('intro.raiding_as')}</span>
              <b data-bv="intro-username"></b>
            </p>
            <button type="button" class="bv-btn bv-npc-btn bv-npc-c3" data-bv="intro-name">${copy('name.title')}</button>
            <button type="button" class="bv-btn bv-npc-btn bv-npc-c3" data-bv="intro-account">${copy('intro.account')}</button>
            <button type="button" class="bv-btn bv-npc-btn bv-npc-c3" data-bv="intro-sign-out">${copy('intro.sign_out')}</button>
            <div class="bv-npc-pair bv-intro-settings bv-npc-c12" data-bv="intro-settings"></div>
          </div>
        </section>
        <footer class="bv-npc-foot">
          <p class="bv-npc-label" data-faces="intro">${copy('intro.fine')}</p>
          <div class="bv-intro-actions">
            <button type="button" class="bv-btn bv-npc-btn" data-bv="overlay-back" data-faces="controls settings">${copy('overlay.back')}</button>
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
    ui.appendChild(this.intro)
    this.beginBtn = find(this.intro, '[data-bv="begin"]')
    this.exitBtn = find(this.intro, '[data-bv="exit-menu"]')
    this.beginBtn.replaceChildren(
      ...Object.entries(BEGIN_LABELS).map(([state, label]) => {
        const span = text('span', label)
        span.dataset.state = state
        return span
      })
    )
    this.showConnection()
    this.raiderEl = find(this.intro, '[data-bv="intro-username"]')
    this.nameBtn = find(this.intro, '[data-bv="intro-name"]')
    this.accountBtn = find(this.intro, '[data-bv="intro-account"]')
    this.signOutBtn = find(this.intro, '[data-bv="intro-sign-out"]')
    const open = (face: OverlayFace) => () => this.showFace(face)
    find(this.intro, '[data-bv="overlay-controls"]').addEventListener(
      'click',
      open('controls')
    )
    find(this.intro, '[data-bv="overlay-settings"]').addEventListener(
      'click',
      open('settings')
    )
    find(this.intro, '[data-bv="overlay-back"]').addEventListener('click', () =>
      this.showFace(this.begun ? 'menu' : 'intro')
    )
    this.showFace('intro')
  }

  // The overlay's face: the parts that name it show, the rest hide. The
  // poem under the title is the intro's alone.
  private showFace(face: OverlayFace): void {
    this.face = face
    for (const part of this.intro.querySelectorAll<HTMLElement>(
      '[data-faces]'
    )) {
      const on = (part.dataset.faces ?? '').split(' ').includes(face)
      part.hidden = !on || (part.dataset.bv === 'intro-as' && !this.raiderSet)
    }
    find<HTMLElement>(this.intro, '[data-bv="npc-lede"]').hidden =
      face !== 'intro'
    this.intro.dataset.face = face
  }

  // The face the overlay shows, for the specs and the keys.
  get overlayFace(): OverlayFace {
    return this.face
  }

  // Who the menu's Settings says is raiding, with Your Name, Account and
  // Sign Out beside it; hidden until the titles settle a username.
  setRaider(username: string): void {
    this.raiderEl.textContent = username
    this.raiderSet = true
    this.showFace(this.face)
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

  // A fish landed made a big deal of (catchfanfare.ts): its banner swept
  // across the view, and fireflies bursting over it (catchburst.ts).
  celebrateCatch(fanfare: Fanfare): void {
    this.season.announce(fanfare)
    burst(this.ui, fanfare)
  }

  // A line the game says to the player alone, in the chat log; an alert
  // stands out in red.
  tell(text: string, kind: 'system' | 'alert' = 'system'): void {
    this.chat.tell(text, kind)
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

  // The map opens over the valley as the book does; for a charter, a
  // click on it picks where Marx drives.
  showMap(show: boolean, charter = false): boolean {
    this.root.classList.toggle('bv-shell--inventory', show)
    return this.map?.show(show, charter) ?? false
  }

  setHotbar(slots: HotbarSlotView[], selected: number): void {
    this.pack.setHotbar(slots, selected)
  }

  // The loop calls these every frame; the vitals touch the page only when
  // something on them moves.
  setWards(levels: Record<WardAxis, number>): void {
    this.vitals.setWards(levels)
  }

  turnWards(time: number): void {
    this.vitals.turn(time)
  }

  // Every other raider's geometrie under ours (partyhud.ts).
  setParty(members: readonly PartyMember[]): void {
    this.vitals.party.set(members)
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

  // The Warden's bar along the bottom with `share` of it left, or null to
  // put it away; the chat log rides up over it while it shows.
  setBoss(share: number | null): void {
    this.boss.set(share)
    this.root.classList.toggle('bv-shell--boss', share !== null)
  }

  // The geometrie bar at `points` of `max`.
  setHealth(points: number, max: number): void {
    this.vitals.setHealth(points, max)
  }

  // A touch's number under the bar, and what `ward` took off it.
  popDamage(damage: number, warded: number, ward: WardAxis | null): void {
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

  // Shows one of the Begin button's labels; it is clickable only to play,
  // from the intro or the menu alike. The others stay in the button, hidden, holding its width.
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
    this.beginBtn.disabled =
      state === 'loading' ||
      state === 'failed' ||
      state === 'connecting' ||
      state === 'reconnecting'
  }

  get introShown(): boolean {
    return !this.intro.hidden
  }

  // The overlay, on the intro before the first Begin, and on the menu (or
  // `face`, as H opens Controls) once begun (the valley never
  // stops under it).
  showIntro(show: boolean, begun?: boolean, face?: OverlayFace): void {
    this.intro.hidden = !show
    this.root.classList.toggle('bv-shell--intro', show)
    this.begun = begun === true
    if (show) {
      this.showFace(face ?? (this.begun ? 'menu' : 'intro'))
      this.showConnection()
    }
  }

  // The line to the valley changed: Begin says so.
  setConnection(connection: Connection): void {
    this.connection = connection
    this.showConnection()
  }

  // Begin names the line's state. Exit to Menu shows once begun, but not
  // when the line is lost, since Begin then goes back to the menu itself.
  private showConnection(): void {
    const { connection } = this
    this.setBegin(connection === 'online' ? 'play' : connection)
    this.exitBtn.hidden = !this.begun || connection === 'lost'
  }
}
