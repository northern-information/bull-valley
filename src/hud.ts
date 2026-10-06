// All DOM: countdown, nerves meter, scope phone, inventory, prompts, item labels,
// the intro/pause overlay, and the strike static. Markup is generated here so
// index.html stays a bare #bv-root.

import { PACK, WORLD } from './bindings.ts'
import { CHAT_LINES, formatStamp, isFaded, pushLine } from './chat.ts'
import { copy } from './copy.ts'
import { KEEP } from './landmarks.ts'
import { CHAT_MAX } from './protocol.ts'
import type { Binding } from './bindings.ts'
import type { ChatLine } from './chat.ts'
import type { RaidSummary, RingItem } from './interfaces.ts'

// The floating name over an item, placed by its top in the view: x and y
// from 0 at the left and top to 1 at the right and bottom.
export interface ItemLabelView {
  text: string
  dim: boolean
  x: number
  y: number
}

// The inventory ring as setCarousel draws it.
export interface CarouselView {
  items: RingItem[]
  index: number
}

export interface InventoryStatus {
  carry: string
  delivered: number
  truck: string
  // Formatted, like "$40.00".
  cash: string
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

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (html !== undefined) node.innerHTML = html
  return node
}

// An element holding text as text: a key label like "< >" is not markup.
function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  content: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.textContent = content
  return node
}

// The controls table: two bindings a row, key then action; an odd last
// one gets the whole row.
function controlRows(bindings: readonly Binding[]): HTMLTableRowElement[] {
  const rows: HTMLTableRowElement[] = []
  for (let i = 0; i < bindings.length; i += 2) {
    const row = document.createElement('tr')
    const pair = bindings.slice(i, i + 2)
    for (const [j, { key, labelKey }] of pair.entries()) {
      const action = text('td', copy(labelKey))
      if (pair.length === 1 && j === 0) action.colSpan = 3
      row.append(text('th', key), action)
    }
    rows.push(row)
  }
  return rows
}

// The HUD builds its own markup, so a missing node or context is a bug here.
function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`Hud: missing ${what}`)
  return value
}

export class Hud {
  root: HTMLElement
  canvas: HTMLCanvasElement
  countdown: HTMLParagraphElement
  nerves: HTMLDivElement
  nervesFill: HTMLElement
  timers: HTMLDivElement
  timersHtml = ''
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
  inventory: HTMLElement
  vignetteEl: HTMLDivElement
  staticWrap: HTMLDivElement
  staticCanvas: HTMLCanvasElement
  reticle: HTMLDivElement
  intro: HTMLDivElement
  beginBtn: HTMLButtonElement
  // Every [data-bv] node under the root, keyed by its data-bv value.
  fields: Record<string, HTMLElement>

  constructor(root: HTMLElement) {
    this.root = root
    root.classList.add('bv-shell')

    this.canvas = el('canvas', 'bv-canvas')
    this.canvas.setAttribute('aria-hidden', 'true')
    root.appendChild(this.canvas)

    const ui = el('div', 'bv-ui')
    root.appendChild(ui)

    // Loadout countdown: bare numbers, top center.
    this.countdown = el('p', 'bv-countdown')
    this.countdown.setAttribute('role', 'timer')
    this.countdown.setAttribute('aria-label', copy('hud.countdown_label'))
    this.countdown.hidden = true
    ui.appendChild(this.countdown)

    // Nerves meter. Hidden while nerves are parked; setNerves still works
    // for when they return.
    this.nerves = el('div', 'bv-nerves')
    this.nerves.innerHTML = `
      <span class="bv-nerves-label">${copy('hud.nerves')}</span>
      <span class="bv-nerves-track"><i class="bv-nerves-fill"></i></span>`
    this.nerves.hidden = true
    ui.appendChild(this.nerves)
    this.nervesFill = required(
      this.nerves.querySelector<HTMLElement>('.bv-nerves-fill'),
      '.bv-nerves-fill'
    )

    // The lower-left column: the chat log over the effect timers, so the
    // log rides up as timers stack under it.
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

    // Active effect timers.
    this.timers = el('div', 'bv-timers')
    dock.appendChild(this.timers)

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

    // Inventory: Silent Hill chrome around the 3D carousel, which the game
    // renderer draws on the canvas underneath (inventoryview.ts).
    this.inventory = el('section', 'bv-inv')
    this.inventory.setAttribute('role', 'dialog')
    this.inventory.setAttribute('aria-label', copy('inventory.label'))
    this.inventory.hidden = true
    this.inventory.innerHTML = `
      <div class="bv-inv-bars" aria-hidden="true"><span>${copy('inventory.status')}</span><span>${copy('inventory.label')}</span><span>${copy('inventory.command')}</span></div>
      <dl class="bv-inv-status">
        <dt>${copy('inventory.cabbages')}</dt><dd data-bv="inv-carry">0 / 3</dd>
        <dt>${copy('inventory.delivered')}</dt><dd data-bv="inv-delivered">0</dd>
        <dt>${copy('inventory.truck')}</dt><dd data-bv="inv-truck">—</dd>
        <dt>${copy('inventory.cash')}</dt><dd data-bv="inv-cash">—</dd>
      </dl>
      <ul class="bv-inv-commands" aria-label="${copy('inventory.commands_label')}">
        <li data-bv="cmd-use"></li>
      </ul>
      <div class="bv-inv-frame" data-bv="inv-frame" aria-hidden="true">
        <span class="bv-inv-arrow bv-inv-arrow--prev">◀◀</span>
        <span class="bv-inv-arrow bv-inv-arrow--next">▶▶</span>
      </div>
      <div class="bv-inv-info" aria-live="polite">
        <p class="bv-inv-line"><span>${copy('inventory.number')}</span> <b data-bv="inv-no">—</b></p>
        <p class="bv-inv-line">
          <span>${copy('inventory.name')}</span> <b class="bv-inv-name" data-bv="inv-name">—</b>
          <span>${copy('inventory.stock')}</span> <b data-bv="inv-stock">0</b>
        </p>
        <p class="bv-inv-desc" data-bv="inv-desc"></p>
      </div>
      <p class="bv-inv-resume" data-bv="inv-resume" hidden>${copy('hud.resume')}</p>
      <div class="bv-inv-bars bv-inv-bars--foot" data-bv="inv-keys" aria-hidden="true"></div>`
    // The pack's keys: E Use is the command column, dimmed when the item
    // cannot be used; the rest line the footer.
    const { use, ...footer } = PACK
    required(
      this.inventory.querySelector<HTMLElement>('[data-bv="cmd-use"]'),
      'use command'
    ).replaceChildren(text('kbd', use.key), ` ${copy(use.labelKey)}`)
    required(
      this.inventory.querySelector<HTMLElement>('[data-bv="inv-keys"]'),
      'pack keys'
    ).replaceChildren(
      ...Object.values(footer).map(({ key, labelKey }) =>
        text('span', `${key} ${copy(labelKey)}`)
      )
    )
    ui.appendChild(this.inventory)

    // Vignette + strike static.
    this.vignetteEl = el('div', 'bv-vignette')
    ui.appendChild(this.vignetteEl)
    this.staticWrap = el('div', 'bv-static')
    this.staticWrap.hidden = true
    this.staticCanvas = el('canvas')
    this.staticCanvas.width = 160
    this.staticCanvas.height = 90
    this.staticWrap.appendChild(this.staticCanvas)
    const staticLabel = el('p', 'bv-static-label')
    staticLabel.textContent = copy('hud.signal_lost')
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
      <p class="bv-intro-note bv-intro-fine">${copy('intro.fine')}</p>`
    required(
      this.intro.querySelector<HTMLTableElement>('[data-bv="controls"]'),
      'controls table'
    ).replaceChildren(...controlRows(Object.values(WORLD)))
    required(
      this.intro.querySelector<HTMLElement>('[data-bv="intro-note"]'),
      'intro note'
    ).textContent = copy('intro.note')
    ui.appendChild(this.intro)
    this.beginBtn = required(
      this.intro.querySelector<HTMLButtonElement>('[data-bv="begin"]'),
      'begin button'
    )
    this.beginBtn.replaceChildren(
      ...Object.entries(BEGIN_LABELS).map(([state, label]) => {
        const span = text('span', label)
        span.dataset.state = state
        return span
      })
    )
    this.setBegin('play')

    this.fields = {}
    for (const dd of root.querySelectorAll<HTMLElement>('[data-bv]')) {
      const key = dd.dataset.bv
      if (key !== undefined) this.fields[key] = dd
    }
  }

  // A null text hides the countdown.
  setCountdown(text: string | null): void {
    this.countdown.hidden = !text
    if (text && this.countdown.textContent !== text) {
      this.countdown.textContent = text
    }
  }

  setNerves(value: number, fuzzy?: boolean): void {
    this.nervesFill.style.width = `${value.toFixed(0)}%`
    this.nervesFill.classList.toggle('bv-nerves-fill--high', value > 70)
    this.nerves.classList.toggle('bv-nerves--fuzzy', !!fuzzy)
  }

  // The loop calls this every frame; the DOM changes only when a line does.
  setTimers(lines: string[]): void {
    const html = lines
      .map((line) => `<span class="bv-timer">${line}</span>`)
      .join('')
    if (html !== this.timersHtml) {
      this.timersHtml = html
      this.timers.innerHTML = html
    }
  }

  prompt(text: string | null): void {
    this.promptEl.hidden = !text
    if (text && this.promptEl.textContent !== text) {
      this.promptEl.textContent = text
    }
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

  // The selected ring item (carousel.ts entry) in text; items[index] may be
  // missing on an empty ring.
  setCarousel({ items, index }: CarouselView): void {
    const item: RingItem | undefined = items[index]
    const f = this.fields
    f['inv-no'].textContent = item ? String(index + 1) : '—'
    f['inv-name'].textContent = item ? item.label : copy('inventory.empty_name')
    f['inv-stock'].textContent = item ? String(item.stock) : '0'
    f['inv-desc'].textContent = item
      ? item.blurb
      : copy('inventory.empty_blurb')
    f['cmd-use'].classList.toggle('bv-inv-cmd--dim', !item?.canUse)
    f['inv-frame'].classList.toggle('bv-inv-frame--single', items.length < 2)
  }

  setInventoryStatus({ carry, delivered, truck, cash }: InventoryStatus): void {
    const f = this.fields
    if (f['inv-carry'].textContent !== carry) f['inv-carry'].textContent = carry
    f['inv-delivered'].textContent = String(delivered)
    if (f['inv-truck'].textContent !== truck) f['inv-truck'].textContent = truck
    if (f['inv-cash'].textContent !== cash) f['inv-cash'].textContent = cash
  }

  showInventory(show: boolean): boolean {
    this.inventory.hidden = !show
    this.root.classList.toggle('bv-shell--inventory', show)
    return show
  }

  // Pointer lock drives the center dot, and the inventory's resume line
  // while it is open without lock.
  setLocked(locked: boolean): void {
    this.root.classList.toggle('bv-shell--locked', locked)
    // A locked cursor hovers nothing, and pointerleave never comes.
    if (locked) this.chatHovered = false
    this.fields['inv-resume'].hidden = locked
  }

  // End-of-raid overlay, styled like the intro dialog.
  showSummary({
    delivered,
    carrying,
    durationSeconds,
    extract,
    extractName,
    deaths,
  }: RaidSummary): void {
    const minutes = Math.floor((durationSeconds || 0) / 60)
    const seconds = String(Math.floor((durationSeconds || 0) % 60)).padStart(
      2,
      '0'
    )
    const how =
      extract === 'truck'
        ? copy('summary.by_truck')
        : extract === 'keep'
          ? copy('summary.at_keep', { keep: KEEP })
          : extractName
            ? copy('summary.at_station', { station: extractName })
            : copy('summary.at_a_station')
    // One line each; the note keeps the line breaks (white-space: pre-line).
    const lines = [how, copy('summary.delivered', { count: delivered })]
    if (carrying > 0) lines.push(copy('summary.left', { count: carrying }))
    if (deaths > 0) lines.push(copy('summary.deaths', { count: deaths }))
    lines.push(copy('summary.time', { time: `${minutes}:${seconds}` }))
    const summary = el('div', 'bv-intro')
    summary.setAttribute('role', 'dialog')
    summary.setAttribute('aria-modal', 'true')
    summary.innerHTML = `
      <h2>${copy('summary.title')}</h2>
      <p class="bv-intro-note" data-bv="summary-note"></p>
      <div class="bv-intro-actions">
        <button type="button" class="bv-btn bv-btn--primary" data-bv="again">${copy('summary.again')}</button>
      </div>`
    required(
      summary.querySelector<HTMLElement>('[data-bv="summary-note"]'),
      'summary note'
    ).textContent = lines.join('\n')
    required(this.root.querySelector('.bv-ui'), '.bv-ui').appendChild(summary)
    required(
      summary.querySelector('[data-bv="again"]'),
      'again button'
    ).addEventListener('click', () => window.location.reload())
  }

  setVignette(alpha: number): void {
    this.vignetteEl.style.opacity = alpha.toFixed(3)
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
    for (const span of this.beginBtn.querySelectorAll<HTMLElement>(
      '[data-state]'
    )) {
      const current = span.dataset.state === state
      span.classList.toggle('bv-btn-label--off', !current)
      span.setAttribute('aria-hidden', String(!current))
    }
    this.beginBtn.disabled = state === 'loading' || state === 'failed'
  }

  get introShown(): boolean {
    return !this.intro.hidden
  }

  showIntro(show: boolean, paused?: boolean): void {
    this.intro.hidden = !show
    this.root.classList.toggle('bv-shell--intro', show)
    if (show) this.setBegin(paused ? 'resume' : 'play')
  }
}
