// All DOM: countdown, nerves meter, scope phone, inventory, prompts, toasts,
// the intro/pause overlay, and the strike static. Markup is generated here so
// the Eleventy page and the dev harness stay a bare #bv-root.

import type { RaidSummary, RingItem } from './interfaces.ts'

// The inventory ring as setCarousel draws it.
export interface CarouselView {
  items: RingItem[]
  index: number
  shopOpen: boolean
}

export interface InventoryStatus {
  carry: string
  delivered: number
  truck: string
}

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
  phone: HTMLDivElement
  scopeCanvas: HTMLCanvasElement
  promptEl: HTMLParagraphElement
  toasts: HTMLDivElement
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
    this.countdown.setAttribute('aria-label', 'Truck leaves in')
    this.countdown.hidden = true
    ui.appendChild(this.countdown)

    // Nerves meter. Hidden while nerves are parked; setNerves still works
    // for when they return.
    this.nerves = el('div', 'bv-nerves')
    this.nerves.innerHTML = `
      <span class="bv-nerves-label">Nerves</span>
      <span class="bv-nerves-track"><i class="bv-nerves-fill"></i></span>`
    this.nerves.hidden = true
    ui.appendChild(this.nerves)
    this.nervesFill = required(
      this.nerves.querySelector<HTMLElement>('.bv-nerves-fill'),
      '.bv-nerves-fill'
    )

    // Active effect timers.
    this.timers = el('div', 'bv-timers')
    ui.appendChild(this.timers)

    // The scope: a phone held in a PS1-style flipper hand. scope.js draws the
    // hand, the phone and the screen into this one low-res canvas.
    this.phone = el('div', 'bv-phone')
    this.phone.setAttribute('aria-hidden', 'true')
    this.scopeCanvas = el('canvas', 'bv-scope')
    this.phone.appendChild(this.scopeCanvas)
    ui.appendChild(this.phone)

    // Interaction prompt + toasts.
    this.promptEl = el('p', 'bv-prompt')
    this.promptEl.hidden = true
    ui.appendChild(this.promptEl)
    this.toasts = el('div', 'bv-toasts')
    this.toasts.setAttribute('aria-live', 'polite')
    ui.appendChild(this.toasts)

    // Inventory: Silent Hill chrome around the 3D carousel, which the game
    // renderer draws on the canvas underneath (inventoryview.ts).
    this.inventory = el('section', 'bv-inv')
    this.inventory.setAttribute('role', 'dialog')
    this.inventory.setAttribute('aria-label', 'Inventory')
    this.inventory.hidden = true
    this.inventory.innerHTML = `
      <div class="bv-inv-bars" aria-hidden="true"><span>Status</span><span>Inventory</span><span>Command</span></div>
      <dl class="bv-inv-status">
        <dt>Cabbages</dt><dd data-bv="inv-carry">0 / 3</dd>
        <dt>Delivered</dt><dd data-bv="inv-delivered">0</dd>
        <dt>Truck</dt><dd data-bv="inv-truck">—</dd>
      </dl>
      <ul class="bv-inv-commands" aria-label="Commands">
        <li data-bv="cmd-use"><kbd>E</kbd> Use</li>
        <li data-bv="cmd-buy"><kbd>B</kbd> Buy</li>
      </ul>
      <div class="bv-inv-frame" data-bv="inv-frame" aria-hidden="true">
        <span class="bv-inv-arrow bv-inv-arrow--prev">&lt;&lt;</span>
        <span class="bv-inv-arrow bv-inv-arrow--next">&gt;&gt;</span>
      </div>
      <div class="bv-inv-info" aria-live="polite">
        <p class="bv-inv-line"><span>No.</span> <b data-bv="inv-no">—</b></p>
        <p class="bv-inv-line">
          <span>Name:</span> <b class="bv-inv-name" data-bv="inv-name">—</b>
          <span>Stock:</span> <b data-bv="inv-stock">0</b>
          <span data-bv="inv-tailgate-wrap"><span>Tailgate:</span> <b data-bv="inv-tailgate">0</b></span>
        </p>
        <p class="bv-inv-desc" data-bv="inv-desc"></p>
      </div>
      <p class="bv-inv-resume" data-bv="inv-resume" hidden>Click to Resume</p>
      <div class="bv-inv-bars bv-inv-bars--foot" aria-hidden="true"><span>&lt; &gt; Cycle</span><span>Tab Exit</span><span>1 Smoke · 2 Spark</span></div>`
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
    this.staticWrap.appendChild(el('p', 'bv-static-label', 'SIGNAL LOST'))
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
      <h2>BULL VALLEY SHADOW WARS</h2>
      <p class="bv-intro-note">Matthew Marx leaves in five minutes.<br>Ride the bed. Find cabbages. Extract.</p>
      <table class="bv-controls" aria-label="Controls">
        <tr><th>WASD</th><td>Move</td><th>Shift</th><td>Sprint</td></tr>
        <tr><th>Mouse</th><td>Look</td><th>C</th><td>Crouch</td></tr>
        <tr><th>Q</th><td>Scaduscope</td><th>Tab</th><td>Inventory</td></tr>
        <tr><th>E</th><td>Board / Take / Unload</td><th>T</th><td>Call the Truck</td></tr>
        <tr><th>1 / 2</th><td>Smoke / Spark</td><th>&lt; &gt;</th><td>Cycle Inventory</td></tr>
      </table>
      <div class="bv-intro-actions">
        <button type="button" class="bv-btn bv-btn--primary" data-bv="begin">Click to Play</button>
      </div>
      <p class="bv-intro-note bv-intro-fine">Requires a keyboard and mouse.</p>`
    ui.appendChild(this.intro)
    this.beginBtn = required(
      this.intro.querySelector<HTMLButtonElement>('[data-bv="begin"]'),
      'begin button'
    )

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

  toast(text: string): void {
    const node = el('p', 'bv-toast', text)
    this.toasts.appendChild(node)
    setTimeout(() => node.classList.add('bv-toast--out'), 3600)
    setTimeout(() => node.remove(), 4400)
  }

  // The selected ring item (carousel.ts entry) in text; items[index] may be
  // missing on an empty ring. shopOpen shows the Buy command and tailgate
  // stock.
  setCarousel({ items, index, shopOpen }: CarouselView): void {
    const item: RingItem | undefined = items[index]
    const f = this.fields
    f['inv-no'].textContent = item ? String(index + 1) : '—'
    f['inv-name'].textContent = item ? item.label : 'Nothing'
    f['inv-stock'].textContent = item ? String(item.stock) : '0'
    f['inv-desc'].textContent = item
      ? item.blurb
      : 'Empty pockets. Nothing between you and the valley.'
    f['inv-tailgate-wrap'].hidden = !shopOpen || !item || item.tailgate === null
    f['inv-tailgate'].textContent = item ? String(item.tailgate ?? 0) : '0'
    f['cmd-buy'].hidden = !shopOpen
    f['cmd-use'].classList.toggle('bv-inv-cmd--dim', !item?.canUse)
    f['cmd-buy'].classList.toggle('bv-inv-cmd--dim', !item?.canBuy)
    f['inv-frame'].classList.toggle('bv-inv-frame--single', items.length < 2)
  }

  setInventoryStatus({ carry, delivered, truck }: InventoryStatus): void {
    const f = this.fields
    if (f['inv-carry'].textContent !== carry) f['inv-carry'].textContent = carry
    f['inv-delivered'].textContent = String(delivered)
    if (f['inv-truck'].textContent !== truck) f['inv-truck'].textContent = truck
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
        ? 'Matthew Marx drove you out.'
        : extract === 'keep'
          ? "You made Mt. Coleman's Keep."
          : `You walked out at ${extractName || 'the station'}.`
    const carried =
      carrying > 0 ? `<br>${carrying} more left to rot in the truck bed.` : ''
    const taken = deaths > 0 ? `<br>Times the valley took you: ${deaths}.` : ''
    const summary = el('div', 'bv-intro')
    summary.setAttribute('role', 'dialog')
    summary.setAttribute('aria-modal', 'true')
    summary.innerHTML = `
      <h2>RAID COMPLETE</h2>
      <p class="bv-intro-note">${how}<br>Cabbages delivered: ${delivered}.${carried}${taken}<br>Time in the valley: ${minutes}:${seconds}.</p>
      <div class="bv-intro-actions">
        <button type="button" class="bv-btn bv-btn--primary" data-bv="again">Raid Again</button>
      </div>`
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

  showIntro(show: boolean, paused?: boolean): void {
    this.intro.hidden = !show
    if (show) {
      this.beginBtn.textContent = paused ? 'Click to Resume' : 'Click to Play'
    }
  }
}
