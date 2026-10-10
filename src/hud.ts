// All DOM: countdown, the season (seasonhud.ts), scope phone, geometrie's triangle, the pack grid and
// its item card, the hotbar, prompts, item labels, the intro/pause overlay, and the
// strike static. Markup is generated here so
// index.html stays a bare #bv-root.

import { PACK, PACK_IN_MENU, PACK_MOUSE, WORLD } from './bindings.ts'
import { BookHud } from './bookhud.ts'
import { CHAT_LINES, formatStamp, isFaded, pushLine } from './chat.ts'
import { copy } from './copy.ts'
import { el, find, text } from './dom.ts'
import { MAX_HEALTH } from './health.ts'
import { HOTBAR_SLOTS } from './hotbar.ts'
import { LevelHud } from './levelhud.ts'
import { bagTabs, LOCKER_TAB, PACK_TABS } from './packgrid.ts'
import { CHAT_MAX } from './protocol.ts'
import { SeasonHud } from './seasonhud.ts'
import { musicSlider } from './settingsui.ts'
import { TaskHud } from './taskhud.ts'
import type { Binding, MouseBinding } from './bindings.ts'
import type { ChatLine } from './chat.ts'
import type { Cooldown } from './hotbar.ts'
import type { GeometrieAxis, PackItem } from './interfaces.ts'
import type { BagAction, BagTab } from './packgrid.ts'
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

// One hotbar slot as setHotbar draws it: slot 0 is key 1. icon is the
// item's still (itemthumbs.ts).
export interface HotbarSlotView {
  slot: number
  item: PackItem
  icon: string
  cooldown: Cooldown | null
}

// The line along the foot of the pack grid.
export interface BagStatus {
  // Formatted, like "$40.00".
  cash: string
}

// The gap between a grid cell and the item card beside it, and the card's
// least distance from the edge of the screen, in CSS pixels.
const CARD_GAP = 8
// The card's turntable, in CSS pixels; styles.css sizes it to match.
const CARD_VIEW_PX = 144
// Cells a row in the pack grid (styles.css .bv-bag-grid); the last row is
// filled out with empty slots.
const BAG_COLUMNS = 8

// How far the cursor moves, in px, before a press on an item is a drag.
const DRAG_START = 6

// Where a pointer event is, as a drag remembers its start.
function at(e: PointerEvent): { x: number; y: number } {
  return { x: e.clientX, y: e.clientY }
}

// Each pack tab's label, and the line its grid shows when empty.
const BAG_TABS: Record<BagTab, { label: string; empty: string }> = {
  consumables: {
    label: copy('inventory.tab_consumables'),
    empty: copy('inventory.empty_consumables'),
  },
  loot: {
    label: copy('inventory.tab_loot'),
    empty: copy('inventory.empty_loot'),
  },
  materials: {
    label: copy('inventory.tab_materials'),
    empty: copy('inventory.empty_materials'),
  },
  locker: {
    label: copy('inventory.tab_locker'),
    empty: copy('inventory.empty_locker'),
  },
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

// How many of an item the pack holds, and what is left in the open pack or
// bottle when it holds several.
function quantity({ stock, left }: PackItem): string {
  return left === null
    ? copy('inventory.quantity', { count: stock })
    : copy('inventory.quantity_left', { count: stock, left })
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
  chat: HTMLDivElement
  chatLog: HTMLDivElement
  chatInput: HTMLInputElement
  chatLines: ChatLine[] = []
  chatLastAt: number | null = null
  chatHovered = false
  phone: HTMLDivElement
  scopeCanvas: HTMLCanvasElement
  promptEl: HTMLParagraphElement
  itemLabelEl: HTMLParagraphElement
  bag: HTMLElement
  bagTabs: Map<BagTab, HTMLButtonElement>
  bagGrid: HTMLDivElement
  bagEmpty: HTMLParagraphElement
  bagCash: HTMLElement
  // The tab the grid shows.
  bagTab: BagTab = PACK_TABS[0]
  // Opened at the locker: the Locker tab shows, and F moves an item into
  // the locker or out of it.
  atLocker = false
  // Told when a tab is clicked, to fill the grid with it.
  onBagTab: ((tab: BagTab) => void) | null = null
  bagItems: PackItem[] = []
  bagKey = ''
  // The item under the cursor (or focus) in the grid, whose card shows.
  bagHovered: PackItem | null = null
  // Told whenever the hovered item changes, to spin it on the card.
  onBagHover: ((item: PackItem | null) => void) | null = null
  // The item clicked in the grid: its card stays, and the keys act on it,
  // whenever the cursor is over no other item.
  bagSelected: string | null = null
  // Told what the mouse did in the pack or on the hotbar (actions.ts).
  onBagAction: ((action: BagAction) => void) | null = null
  // The right-click menu over an item, and the item it is for.
  bagMenu: HTMLDivElement
  bagMenuKind: string | null = null
  // A drag under way, from the grid (from null) or off a hotbar slot; the
  // ghost follows the cursor once it has moved far enough to be a drag.
  private bagDrag: {
    kind: string
    from: number | null
    icon: string
    x: number
    y: number
    ghost: HTMLImageElement | null
  } | null = null
  card: HTMLDivElement
  cardCanvas: HTMLCanvasElement
  cardName: HTMLElement
  cardBlurb: HTMLElement
  cardQuantity: HTMLElement
  // E and the double-click, dimmed for an item that is not used.
  cardUse: HTMLElement[]
  // The pack's own keys on the card, and the locker's: the label beside F
  // says which way it moves.
  cardPackKeys: HTMLElement[]
  cardStowKeys: HTMLElement[]
  cardStowLabels: HTMLElement[]
  hotbar: HTMLOListElement
  hotbarKey = ''
  hotbarSlots: { li: HTMLLIElement; cd: HTMLElement; view: string }[] = []
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

    // Chat: the valley's lines, and a field that shows while typing.
    this.chat = el('div', 'bv-chat bv-chat--faded')
    this.chatLog = el('div', 'bv-chat-log')
    this.chatLog.setAttribute('role', 'log')
    this.chatLog.setAttribute('aria-label', copy('hud.chat_log_label'))
    // Paused, with the cursor free, hovering holds the log up and the
    // wheel scrolls it.
    this.chatLog.addEventListener('pointerenter', () => {
      this.chatHovered = true
    })
    this.chatLog.addEventListener('pointerleave', () => {
      this.chatHovered = false
    })
    this.chatInput = el('input', 'bv-chat-input')
    this.chatInput.type = 'text'
    this.chatInput.maxLength = CHAT_MAX
    this.chatInput.autocomplete = 'off'
    this.chatInput.spellcheck = false
    this.chatInput.setAttribute('aria-label', copy('hud.chat_input_label'))
    this.chatInput.hidden = true
    this.chat.append(this.chatLog, this.chatInput)
    dock.appendChild(this.chat)

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

    // The pack: a grid of items over the valley, with the pointer free. The
    // card beside the hovered cell spins the item on a canvas of its own
    // (itemthumbs.ts draws it).
    this.bag = el('section', 'bv-bag')
    this.bag.setAttribute('role', 'dialog')
    this.bag.setAttribute('aria-label', copy('inventory.label'))
    this.bag.hidden = true
    // The right-click menu: every way to move an item, by name. It goes in
    // after the card, over it.
    this.bagMenu = el('div', 'bv-bag-menu')
    this.bagMenu.setAttribute('role', 'menu')
    this.bagMenu.hidden = true
    // The tabs over the grid, which is their one panel.
    const tabs = el('div', 'bv-bag-tabs')
    tabs.setAttribute('role', 'tablist')
    tabs.setAttribute('aria-label', copy('inventory.label'))
    this.bagTabs = new Map(
      bagTabs(true).map((tab) => {
        const button = text('button', BAG_TABS[tab].label, 'bv-bag-tab')
        button.type = 'button'
        button.id = `bv-bag-tab-${tab}`
        button.setAttribute('role', 'tab')
        button.setAttribute('aria-controls', 'bv-bag-panel')
        button.addEventListener('click', () => this.onBagTab?.(tab))
        button.hidden = tab === LOCKER_TAB
        tabs.appendChild(button)
        return [tab, button]
      })
    )
    this.bagGrid = el('div', 'bv-bag-grid')
    this.bagGrid.id = 'bv-bag-panel'
    this.bagGrid.setAttribute('role', 'tabpanel')
    this.bagEmpty = el('p', 'bv-bag-empty')
    const status = el('dl', 'bv-bag-status')
    const stat = (label: string) => {
      const dd = document.createElement('dd')
      const pair = el('div')
      pair.append(text('dt', label), dd)
      status.appendChild(pair)
      return dd
    }
    this.bagCash = stat(copy('inventory.cash'))
    this.bagCash.dataset.bv = 'inv-cash'
    // Along the foot: the status, and the keys that switch tabs and close
    // the pack.
    const foot = el('div', 'bv-bag-foot')
    const footKeys = el('p', 'bv-bag-keys')
    footKeys.append(
      text('kbd', PACK.prevTab.key),
      ' ',
      text('kbd', PACK.nextTab.key),
      ` ${copy(PACK.nextTab.labelKey)} `,
      text('kbd', PACK.clearSlot.key),
      ` ${copy(PACK.clearSlot.labelKey)} `,
      text('kbd', PACK.close.key),
      ` ${copy(PACK.close.labelKey)}`
    )
    foot.append(status, footKeys)
    // The empty line lies over the grid's empty row, so switching to an
    // empty tab never changes the pack's height.
    const panel = el('div', 'bv-bag-panel')
    panel.append(this.bagGrid, this.bagEmpty)
    this.bag.append(tabs, panel, foot)
    this.selectBagTab(this.bagTab)
    // Moving across the gaps between cells keeps the card; leaving the
    // grid drops it.
    const hoverFrom = (target: EventTarget | null) => {
      const cell =
        target instanceof Element
          ? target.closest<HTMLElement>('.bv-bag-cell')
          : null
      if (cell) this.hoverCell(cell)
    }
    this.bagGrid.addEventListener('pointerover', (e) => hoverFrom(e.target))
    this.bagGrid.addEventListener('focusin', (e) => hoverFrom(e.target))
    this.bagGrid.addEventListener('pointerleave', () => {
      if (!this.bagGrid.contains(document.activeElement)) this.hoverCell(null)
    })
    this.bagGrid.addEventListener('focusout', (e) => {
      if (!this.bagGrid.contains(e.relatedTarget as Node | null)) {
        this.hoverCell(null)
      }
    })
    ui.appendChild(this.bag)

    // The card lives in the pack, so it reads as part of the dialog; it is
    // placed against the pack's own box.
    this.card = el('div', 'bv-bag-card')
    this.card.hidden = true
    this.cardCanvas = el('canvas', 'bv-bag-card-view')
    // Drawn at the screen's own density; the stylesheet sets its CSS size.
    this.cardCanvas.width = this.cardCanvas.height = Math.round(
      CARD_VIEW_PX * window.devicePixelRatio
    )
    this.cardCanvas.setAttribute('aria-hidden', 'true')
    this.cardName = el('h3', 'bv-bag-card-name')
    this.cardBlurb = el('p', 'bv-bag-card-blurb')
    this.cardQuantity = el('p', 'bv-bag-card-quantity')
    const keys = el('ul', 'bv-bag-card-keys')
    const keyItem = ({ key, labelKey }: Binding) => {
      const li = document.createElement('li')
      const label = text('span', copy(labelKey))
      li.append(text('kbd', key), ' ', label)
      keys.appendChild(li)
      return { li, label }
    }
    // The mouse's buttons, named as the keys are.
    const mouseItem = ({ buttonKey, labelKey }: MouseBinding) =>
      keyItem({ codes: [], key: copy(buttonKey), labelKey })
    const use = keyItem(PACK.use).li
    const assign = keyItem(PACK.assign).li
    const drop = [keyItem(PACK.drop).li, keyItem(PACK.dropAll).li]
    const useMouse = mouseItem(PACK_MOUSE.use).li
    this.cardUse = [use, useMouse]
    this.cardPackKeys = [
      use,
      assign,
      ...drop,
      useMouse,
      mouseItem(PACK_MOUSE.assign).li,
    ]
    const stow = [
      keyItem(PACK.stow),
      keyItem(PACK.stowAll),
      mouseItem(PACK_MOUSE.moveAll),
    ]
    this.cardStowKeys = stow.map(({ li }) => li)
    this.cardStowLabels = stow.map(({ label }) => label)
    mouseItem(PACK_MOUSE.menu)
    this.card.append(
      this.cardCanvas,
      this.cardName,
      this.cardBlurb,
      this.cardQuantity,
      keys
    )
    this.bag.appendChild(this.card)

    this.bag.appendChild(this.bagMenu)

    // The hotbar: the assigned slots, in number order, along the bottom.
    this.hotbar = el('ol', 'bv-hotbar')
    this.hotbar.setAttribute('aria-label', copy('inventory.hotbar_label'))
    this.hotbar.hidden = true
    ui.appendChild(this.hotbar)
    this.wireBagMouse()

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

  // A line the game says to the player alone, in the chat log.
  tell(text: string): void {
    this.chatLine({ kind: 'system', text, at: Date.now() }, performance.now())
  }

  // One line into the chat log, stamped and colored by who said it. Text
  // from the valley is untrusted, so it goes in as text, never markup. A
  // reader scrolled back through the log stays where they are.
  chatLine(line: ChatLine, now: number): void {
    this.chatLines = pushLine(this.chatLines, line)
    this.chatLastAt = now
    const log = this.chatLog
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 2
    const stamp = el('span', 'bv-chat-stamp')
    stamp.textContent = formatStamp(line.at)
    const p = el('p', `bv-chat-line bv-chat-line--${line.kind}`)
    p.append(stamp, line.name ? `${line.name}: ${line.text}` : line.text)
    log.appendChild(p)
    while (log.childElementCount > CHAT_LINES) log.firstElementChild?.remove()
    if (atBottom) log.scrollTop = log.scrollHeight
  }

  private get chatLineHeight(): number {
    return parseFloat(getComputedStyle(this.chatLog).lineHeight) || 20
  }

  // The wheel while typing, in pixels whatever unit the browser counts in.
  wheelChat(e: WheelEvent): void {
    const unit =
      e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? this.chatLineHeight
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? this.chatLog.clientHeight
          : 1
    this.chatLog.scrollTop += e.deltaY * unit
  }

  // Scroll the log a page up (-1) or down (1), keeping one line in view.
  pageChat(dir: 1 | -1): void {
    const line = this.chatLineHeight
    this.chatLog.scrollTop +=
      dir * Math.max(line, this.chatLog.clientHeight - line)
  }

  get chatOpen(): boolean {
    return !this.chatInput.hidden
  }

  openChat(): void {
    this.chatInput.value = ''
    this.chatInput.hidden = false
    this.chatInput.focus()
  }

  // Closes the field and returns what was typed; the log goes back to the
  // newest line.
  closeChat(): string {
    const typed = this.chatInput.value
    this.chatInput.value = ''
    this.chatInput.hidden = true
    this.chatInput.blur()
    this.chatLog.scrollTop = this.chatLog.scrollHeight
    return typed
  }

  // The loop calls this every frame: the log fades once it goes quiet,
  // unless it is held by typing or the cursor.
  tickChat(now: number): void {
    const held = this.chatOpen || this.chatHovered
    const faded = isFaded(this.chatLastAt, now, held)
    this.chat.classList.toggle('bv-chat--faded', faded)
    this.chat.classList.toggle('bv-chat--held', held)
  }

  // At the locker or not: the Locker tab shows, and the card's keys say
  // what F does.
  setLocker(open: boolean): void {
    this.atLocker = open
    const locker = this.bagTabs.get(LOCKER_TAB)
    if (locker) locker.hidden = !open
  }

  // Marks `tab` as the one the grid shows; setBag fills it.
  selectBagTab(tab: BagTab): void {
    this.bagTab = tab
    this.bagSelected = null
    this.closeBagMenu()
    for (const [one, button] of this.bagTabs) {
      const selected = one === tab
      button.setAttribute('aria-selected', String(selected))
      button.tabIndex = selected ? 0 : -1
    }
    this.bagGrid.setAttribute('aria-labelledby', `bv-bag-tab-${tab}`)
    this.bagEmpty.textContent = BAG_TABS[tab].empty
  }

  // The shown tab's items (packgrid.ts entries) as grid cells. The cells
  // are rebuilt only when the tab, a kind or a count changes; the card
  // follows.
  setBag(items: PackItem[], iconOf: (kind: string) => string): void {
    const key = [
      this.bagTab,
      ...items.map((item) => `${item.kind}:${item.stock}:${item.left}`),
    ].join(',')
    if (key === this.bagKey) return
    this.bagKey = key
    this.bagItems = items
    const has = (kind: string | null) => items.some((one) => one.kind === kind)
    if (!has(this.bagSelected)) this.bagSelected = null
    if (!has(this.bagMenuKind)) this.closeBagMenu()
    const hovered = this.bagHovered?.kind
    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.kind
        : undefined
    this.bagGrid.replaceChildren(
      ...items.map((item) => {
        const cell = el('button', 'bv-bag-cell')
        cell.type = 'button'
        cell.dataset.kind = item.kind
        cell.classList.toggle(
          'bv-bag-cell--selected',
          item.kind === this.bagSelected
        )
        cell.setAttribute('aria-label', `${item.label}, ${quantity(item)}`)
        const img = el('img')
        img.src = iconOf(item.kind)
        img.alt = ''
        img.draggable = false
        cell.appendChild(img)
        if (item.stock > 1) {
          cell.appendChild(text('span', String(item.stock), 'bv-bag-count'))
        }
        return cell
      }),
      ...Array.from(
        {
          length:
            Math.max(
              BAG_COLUMNS,
              Math.ceil(items.length / BAG_COLUMNS) * BAG_COLUMNS
            ) - items.length,
        },
        () => {
          const slot = el('span', 'bv-bag-cell bv-bag-cell--empty')
          slot.setAttribute('aria-hidden', 'true')
          return slot
        }
      )
    )
    this.bagEmpty.hidden = items.length > 0
    if (focused) this.cellOf(focused)?.focus()
    const again = hovered ? this.cellOf(hovered) : null
    this.hoverCell(again)
  }

  private cellOf(kind: string): HTMLElement | null {
    return (
      [...this.bagGrid.querySelectorAll<HTMLElement>('.bv-bag-cell')].find(
        (cell) => cell.dataset.kind === kind
      ) ?? null
    )
  }

  // The card beside a cell, or none. It sits to the right of the cell, or
  // to the left where the right would run off the screen.
  private hoverCell(hovered: HTMLElement | null): void {
    // Off every item, the selected one keeps its card.
    const cell =
      hovered ?? (this.bagSelected ? this.cellOf(this.bagSelected) : null)
    const item = cell
      ? (this.bagItems.find((one) => one.kind === cell.dataset.kind) ?? null)
      : null
    const changed = item?.kind !== this.bagHovered?.kind
    this.bagHovered = item
    this.card.hidden = !item
    if (cell && item) {
      this.cardName.textContent = item.label
      this.cardBlurb.textContent = item.blurb
      this.cardQuantity.textContent = quantity(item)
      for (const li of this.cardUse) {
        li.classList.toggle('bv-bag-card-key--dim', !item.canUse)
      }
      // In the locker only F moves it; at the locker F moves the pack's
      // items in too.
      const inLocker = this.bagTab === LOCKER_TAB
      for (const li of this.cardPackKeys) li.hidden = inLocker
      for (const li of this.cardStowKeys) li.hidden = !this.atLocker
      const [one, all, allMouse] = this.cardStowLabels
      one.textContent = copy(inLocker ? 'keys.unstow' : PACK.stow.labelKey)
      all.textContent = copy(
        inLocker ? 'keys.unstow_all' : PACK.stowAll.labelKey
      )
      allMouse.textContent = all.textContent
      const at = cell.getBoundingClientRect()
      const box = this.bag.getBoundingClientRect()
      const width = this.card.offsetWidth
      const height = this.card.offsetHeight
      const right = at.right + CARD_GAP
      const left =
        right + width <= window.innerWidth - CARD_GAP
          ? right
          : Math.max(CARD_GAP, at.left - CARD_GAP - width)
      const top = Math.max(
        CARD_GAP,
        Math.min(at.top, window.innerHeight - height - CARD_GAP)
      )
      this.card.style.left = `${left - box.left}px`
      this.card.style.top = `${top - box.top}px`
    }
    if (changed) this.onBagHover?.(item)
  }

  // The mouse in the open pack: a click selects an item (again, or past
  // every item, lets it go), Shift-click at the locker moves the stack, a
  // double-click uses it, a right-click opens its menu, and a drag puts it
  // on a hotbar slot. On the bar, a slot dragged off or right-clicked
  // empties.
  private wireBagMouse(): void {
    const itemCell = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>('.bv-bag-cell:not(.bv-bag-cell--empty)')
        : null
    const slotOf = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>('.bv-hot-slot')
        : null
    this.bag.addEventListener('click', (e) => {
      const cell = itemCell(e.target)
      const kind = cell?.dataset.kind
      if (!cell || !kind) {
        if (!this.bagMenu.contains(e.target as Node)) this.selectBagItem(null)
        return
      }
      if (e.shiftKey) {
        if (this.atLocker) this.onBagAction?.({ type: 'move', kind, all: true })
        return
      }
      // The second click of a double-click is the double-click's.
      if (e.detail > 1) return
      this.selectBagItem(this.bagSelected === kind ? null : kind, cell)
    })
    this.bagGrid.addEventListener('dblclick', (e) => {
      const kind = itemCell(e.target)?.dataset.kind
      const item = this.bagItems.find((one) => one.kind === kind)
      if (!item?.canUse || e.shiftKey || this.bagTab === LOCKER_TAB) return
      this.onBagAction?.({ type: 'use', kind: item.kind })
    })
    this.bag.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      const cell = itemCell(e.target)
      const item = this.bagItems.find((one) => one.kind === cell?.dataset.kind)
      if (!cell || !item) return
      this.selectBagItem(item.kind, cell)
      this.openBagMenu(item, e.clientX, e.clientY)
    })
    // A press anywhere past the menu closes it.
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.bagMenu.contains(e.target as Node)) this.closeBagMenu()
      },
      true
    )
    this.bagGrid.addEventListener('pointerdown', (e) => {
      const cell = itemCell(e.target)
      const kind = cell?.dataset.kind
      if (e.button !== 0 || e.shiftKey || !kind) return
      if (this.bagTab === LOCKER_TAB) return
      const icon = cell.querySelector('img')?.src ?? ''
      this.bagDrag = { kind, from: null, icon, ...at(e), ghost: null }
    })
    this.hotbar.addEventListener('pointerdown', (e) => {
      const li = slotOf(e.target)
      const kind = li?.dataset.kind
      if (e.button !== 0 || this.bag.hidden || !li || !kind) return
      const icon = li.querySelector('img')?.src ?? ''
      const from = Number(li.dataset.slot)
      this.bagDrag = { kind, from, icon, ...at(e), ghost: null }
    })
    this.hotbar.addEventListener('contextmenu', (e) => {
      if (this.bag.hidden) return
      e.preventDefault()
      const li = slotOf(e.target)
      if (li?.dataset.kind) {
        this.onBagAction?.({ type: 'clear', slot: Number(li.dataset.slot) })
      }
    })
    document.addEventListener('pointermove', (e) => {
      const drag = this.bagDrag
      if (!drag) return
      if (!drag.ghost) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_START) {
          return
        }
        drag.ghost = el('img', 'bv-drag-ghost')
        drag.ghost.src = drag.icon
        drag.ghost.alt = ''
        this.root.appendChild(drag.ghost)
      }
      drag.ghost.style.left = `${e.clientX}px`
      drag.ghost.style.top = `${e.clientY}px`
      const target = this.slotAt(e.clientX, e.clientY)
      for (const li of this.hotbar.children) {
        li.classList.toggle(
          'bv-hot-slot--target',
          li instanceof HTMLElement && Number(li.dataset.slot) === target
        )
      }
    })
    document.addEventListener('pointerup', (e) => {
      const drag = this.bagDrag
      if (!drag?.ghost) {
        this.bagDrag = null
        return
      }
      const target = this.slotAt(e.clientX, e.clientY)
      this.endBagDrag()
      // The click a drag ends in selects nothing and closes nothing.
      const swallow = (click: Event) => click.stopPropagation()
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, true))
      if (target !== null) {
        if (target !== drag.from) {
          this.onBagAction?.({ type: 'place', slot: target, kind: drag.kind })
        }
      } else if (drag.from !== null) {
        this.onBagAction?.({ type: 'clear', slot: drag.from })
      }
    })
  }

  // The hotbar slot under a point on the screen, or null.
  private slotAt(x: number, y: number): number | null {
    const hit = document.elementFromPoint(x, y)
    const li = hit?.closest<HTMLElement>('.bv-hot-slot')
    return li && this.hotbar.contains(li) ? Number(li.dataset.slot) : null
  }

  private endBagDrag(): void {
    this.bagDrag?.ghost?.remove()
    this.bagDrag = null
    for (const li of this.hotbar.children) {
      li.classList.remove('bv-hot-slot--target')
    }
  }

  // Selects kind in the grid, or none; its card shows (or the one under
  // the cursor, `hovered`).
  private selectBagItem(kind: string | null, hovered?: HTMLElement): void {
    this.bagSelected = kind
    for (const cell of this.bagGrid.querySelectorAll<HTMLElement>(
      '.bv-bag-cell'
    )) {
      cell.classList.toggle(
        'bv-bag-cell--selected',
        kind !== null && cell.dataset.kind === kind
      )
    }
    this.hoverCell(hovered ?? null)
  }

  // The right-click menu for item, at the cursor: use, put on a slot, drop
  // one or the stack, and at the locker move one or the stack the other
  // way. In the locker only the moves.
  private openBagMenu(item: PackItem, x: number, y: number): void {
    const { kind } = item
    const inLocker = this.bagTab === LOCKER_TAB
    const button = (label: string, action: BagAction, className: string) => {
      const one = text('button', label, className)
      one.type = 'button'
      one.setAttribute('role', 'menuitem')
      one.addEventListener('click', () => {
        this.closeBagMenu()
        this.onBagAction?.(action)
      })
      return one
    }
    const entry = (labelKey: string, action: BagAction) =>
      button(copy(labelKey), action, 'bv-bag-menu-item')
    const entries: HTMLElement[] = []
    if (!inLocker) {
      if (item.canUse)
        entries.push(entry(PACK.use.labelKey, { type: 'use', kind }))
      const slots = el('div', 'bv-bag-menu-slots')
      slots.append(text('span', copy(PACK.assign.labelKey)))
      for (let slot = 0; slot < HOTBAR_SLOTS; slot++) {
        slots.append(
          button(
            String(slot + 1),
            { type: 'place', slot, kind },
            'bv-bag-menu-slot'
          )
        )
      }
      entries.push(
        slots,
        entry(PACK.drop.labelKey, { type: 'drop', kind, all: false }),
        entry(PACK.dropAll.labelKey, { type: 'drop', kind, all: true })
      )
    }
    if (this.atLocker) {
      entries.push(
        entry(inLocker ? 'keys.unstow' : PACK.stow.labelKey, {
          type: 'move',
          kind,
          all: false,
        }),
        entry(inLocker ? 'keys.unstow_all' : PACK.stowAll.labelKey, {
          type: 'move',
          kind,
          all: true,
        })
      )
    }
    if (entries.length < 1) return
    this.bagMenu.replaceChildren(...entries)
    this.bagMenu.hidden = false
    this.bagMenuKind = kind
    const box = this.bag.getBoundingClientRect()
    const left = Math.min(
      x,
      window.innerWidth - this.bagMenu.offsetWidth - CARD_GAP
    )
    const top = Math.min(
      y,
      window.innerHeight - this.bagMenu.offsetHeight - CARD_GAP
    )
    this.bagMenu.style.left = `${left - box.left}px`
    this.bagMenu.style.top = `${top - box.top}px`
  }

  closeBagMenu(): void {
    this.bagMenu.hidden = true
    this.bagMenuKind = null
  }

  setBagStatus({ cash }: BagStatus): void {
    if (this.bagCash.textContent !== cash) this.bagCash.textContent = cash
  }

  showBag(show: boolean): boolean {
    this.bag.hidden = !show
    this.root.classList.toggle('bv-shell--inventory', show)
    if (!show) {
      this.bagSelected = null
      this.closeBagMenu()
      this.endBagDrag()
      this.hoverCell(null)
    }
    return show
  }

  // The Book of Shadows opens over the valley as the pack does, and the
  // aiming HUD steps aside for it the same way.
  showBook(show: boolean): boolean {
    this.root.classList.toggle('bv-shell--inventory', show)
    return this.book.show(show)
  }

  // The loop calls this every frame. The slots are rebuilt only when what
  // they hold changes; the cooldown sweeps are touched only when they move.
  // With the pack open every slot shows, the empty ones too, so an item
  // can be dragged onto any of them.
  setHotbar(slots: HotbarSlotView[]): void {
    const open = !this.bag.hidden
    const key = [
      open ? 'open' : 'shut',
      ...slots.map(
        ({ slot, item }) => `${slot}:${item.kind}:${item.stock}:${item.left}`
      ),
    ].join(',')
    if (key !== this.hotbarKey) {
      this.hotbarKey = key
      const views = new Map(slots.map((view) => [view.slot, view]))
      const shown = open
        ? Array.from({ length: HOTBAR_SLOTS }, (_, slot) => slot)
        : slots.map(({ slot }) => slot)
      const lis: HTMLLIElement[] = []
      this.hotbarSlots = []
      for (const slot of shown) {
        const view = views.get(slot)
        if (!view) {
          const li = el('li', 'bv-hot-slot bv-hot-slot--empty')
          li.dataset.slot = String(slot)
          li.setAttribute(
            'aria-label',
            `${slot + 1}: ${copy('inventory.hotbar_empty')}`
          )
          li.append(text('span', String(slot + 1), 'bv-hot-key'))
          lis.push(li)
          continue
        }
        const { item, icon } = view
        const li = el('li', 'bv-hot-slot')
        li.dataset.slot = String(slot)
        li.dataset.kind = item.kind
        li.classList.toggle('bv-hot-slot--out', item.stock < 1)
        li.setAttribute(
          'aria-label',
          `${slot + 1}: ${item.label}, ${quantity(item)}`
        )
        const img = el('img')
        img.src = icon
        img.alt = ''
        img.draggable = false
        const cd = el('span', 'bv-hot-cd')
        cd.setAttribute('aria-hidden', 'true')
        li.append(
          img,
          cd,
          text('span', String(slot + 1), 'bv-hot-key'),
          text('span', String(item.stock), 'bv-hot-count')
        )
        this.hotbarSlots.push({ li, cd, view: '' })
        lis.push(li)
      }
      this.hotbar.replaceChildren(...lis)
      this.hotbar.hidden = lis.length < 1
      this.root.classList.toggle('bv-shell--hotbar', lis.length > 0)
    }
    slots.forEach(({ cooldown }, i) => {
      const shown = this.hotbarSlots[i]
      const view = cooldown
        ? `${cooldown.phase}:${cooldown.fraction.toFixed(3)}:${cooldown.seconds}`
        : ''
      if (view === shown.view) return
      shown.view = view
      shown.li.dataset.cooldown = cooldown?.phase ?? ''
      shown.li.style.setProperty('--cd', cooldown ? view.split(':')[1] : '0')
      shown.cd.textContent = cooldown ? String(cooldown.seconds) : ''
    })
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
    if (locked) this.chatHovered = false
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
