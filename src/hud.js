// All DOM: readout, nerves meter, scope canvas, inventory, prompts, toasts,
// the intro/pause overlay, and the strike static. Markup is generated here so
// the Eleventy page and the dev harness stay a bare #bv-root.

function el(tag, className, html) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (html !== undefined) node.innerHTML = html
  return node
}

export class Hud {
  constructor(root) {
    this.root = root
    root.classList.add('bv-shell')

    this.canvas = el('canvas', 'bv-canvas')
    this.canvas.setAttribute('aria-hidden', 'true')
    root.appendChild(this.canvas)

    const ui = el('div', 'bv-ui')
    root.appendChild(ui)

    // Readout, in the Scaduscope's voice.
    this.head = el('section', 'bv-head')
    this.head.setAttribute('aria-label', 'Survey readout')
    this.head.innerHTML = `
      <h1><span aria-hidden="true">🥬🌚 </span>Bull Valley Shadow Wars</h1>
      <dl>
        <dt>Position</dt><dd data-bv="pos">—</dd>
        <dt>Local</dt><dd data-bv="clock">—</dd>
        <dt>Road</dt><dd data-bv="road">Off road</dd>
        <dt>Cabbages</dt><dd data-bv="cabbages">0</dd>
      </dl>`
    ui.appendChild(this.head)

    // Nerves meter. Hidden while the shadowmen are parked; setNerves still
    // works for when they return.
    this.nerves = el('div', 'bv-nerves')
    this.nerves.innerHTML = `
      <span class="bv-nerves-label">Nerves</span>
      <span class="bv-nerves-track"><i class="bv-nerves-fill"></i></span>`
    this.nerves.hidden = true
    ui.appendChild(this.nerves)
    this.nervesFill = this.nerves.querySelector('.bv-nerves-fill')

    // Active effect timers.
    this.timers = el('div', 'bv-timers')
    ui.appendChild(this.timers)

    // The scope.
    this.scopeCanvas = el('canvas', 'bv-scope')
    this.scopeCanvas.setAttribute('aria-hidden', 'true')
    ui.appendChild(this.scopeCanvas)

    // Interaction prompt + toasts.
    this.promptEl = el('p', 'bv-prompt')
    this.promptEl.hidden = true
    ui.appendChild(this.promptEl)
    this.toasts = el('div', 'bv-toasts')
    this.toasts.setAttribute('aria-live', 'polite')
    ui.appendChild(this.toasts)

    // Inventory.
    this.inventory = el('section', 'bv-inventory')
    this.inventory.setAttribute('aria-label', 'Inventory')
    this.inventory.hidden = true
    this.inventory.innerHTML = `
      <h2>Inventory</h2>
      <ul>
        <li><span class="bv-item-key">1</span> Cigarettes <b data-bv="cigarettes">0</b><i>Steadies the nerves. The ember gives you away.</i></li>
        <li><span class="bv-item-key">2</span> Joints <b data-bv="joints">0</b><i>You will see them. You will feel less.</i></li>
      </ul>
      <div data-bv="shop" hidden>
        <h2>Marx's Tailgate</h2>
        <ul>
          <li><span class="bv-item-key">3</span> Buy Cigarettes <b data-bv="shop-cigarettes">0</b><i>Left on the tailgate. Take what you need.</i></li>
          <li><span class="bv-item-key">4</span> Buy Joints <b data-bv="shop-joints">0</b><i>Grown in the reserves. Probably.</i></li>
          <li><span class="bv-item-key">5</span> Buy Burlap Sack <b data-bv="shop-sack">1</b><i>Carries five cabbages instead of three.</i></li>
        </ul>
        <p class="bv-inventory-hint">No money in Bull Valley. Stock is per raid.</p>
      </div>
      <p class="bv-inventory-hint">Tab closes. Found at fuel stations and in the reserves.</p>`
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

    // Intro / pause overlay.
    this.intro = el('div', 'bv-intro')
    this.intro.setAttribute('role', 'dialog')
    this.intro.setAttribute('aria-modal', 'true')
    this.intro.innerHTML = `
      <h2 data-bv="intro-title">BULL VALLEY SHADOW WARS</h2>
      <p class="bv-intro-note">The terrain and the roads are real.<br>Matthew Marx leaves in five minutes, with or without you.<br>Ride the bed. Find cabbages. The stand pays in nothing but purpose.<br>Extract at another station, at the Keep, or whistle for the truck.</p>
      <table class="bv-controls" aria-label="Controls">
        <tr><th>WASD</th><td>Move</td><th>Shift</th><td>Sprint</td></tr>
        <tr><th>Mouse</th><td>Look</td><th>C</th><td>Crouch</td></tr>
        <tr><th>Q</th><td>Scaduscope</td><th>Tab</th><td>Inventory</td></tr>
        <tr><th>E</th><td>Board / Take / Unload</td><th>T</th><td>Call the Truck</td></tr>
        <tr><th>1 / 2</th><td>Smoke / Spark</td><th></th><td></td></tr>
      </table>
      <div class="bv-intro-actions">
        <button type="button" class="bv-btn bv-btn--primary" data-bv="begin">Begin the Raid</button>
        <button type="button" class="bv-btn" data-bv="sound" aria-pressed="true">Sound On</button>
      </div>
      <p class="bv-intro-note bv-intro-fine">Requires a keyboard and mouse.</p>`
    ui.appendChild(this.intro)
    this.beginBtn = this.intro.querySelector('[data-bv="begin"]')
    this.soundBtn = this.intro.querySelector('[data-bv="sound"]')
    this.introTitle = this.intro.querySelector('[data-bv="intro-title"]')

    this.fields = {}
    for (const dd of root.querySelectorAll('[data-bv]')) {
      this.fields[dd.dataset.bv] = dd
    }
  }

  setReadout({ pos, clock, road, cabbages }) {
    if (pos !== undefined) this.fields.pos.textContent = pos
    if (clock !== undefined) this.fields.clock.textContent = clock
    if (road !== undefined) this.fields.road.textContent = road || 'Off road'
    if (cabbages !== undefined) this.fields.cabbages.textContent = cabbages
  }

  setNerves(value, fuzzy) {
    this.nervesFill.style.width = `${value.toFixed(0)}%`
    this.nervesFill.classList.toggle('bv-nerves-fill--high', value > 70)
    this.nerves.classList.toggle('bv-nerves--fuzzy', !!fuzzy)
  }

  setTimers(lines) {
    this.timers.innerHTML = lines
      .map((line) => `<span class="bv-timer">${line}</span>`)
      .join('')
  }

  prompt(text) {
    this.promptEl.hidden = !text
    if (text) this.promptEl.textContent = text
  }

  toast(text) {
    const node = el('p', 'bv-toast', text)
    this.toasts.appendChild(node)
    setTimeout(() => node.classList.add('bv-toast--out'), 3600)
    setTimeout(() => node.remove(), 4400)
  }

  setInventory(inv) {
    this.fields.cigarettes.textContent = String(inv.cigarettes)
    this.fields.joints.textContent = String(inv.joints)
  }

  showInventory(show) {
    this.inventory.hidden = !show
    return !this.inventory.hidden
  }

  // The tailgate shop rides inside the inventory panel during loadout.
  showShop(show) {
    this.fields.shop.hidden = !show
  }

  setShop({ cigarettes, joints, sack }) {
    this.fields['shop-cigarettes'].textContent = String(cigarettes)
    this.fields['shop-joints'].textContent = String(joints)
    this.fields['shop-sack'].textContent = String(sack)
  }

  // End-of-raid overlay, styled like the intro dialog.
  showSummary({ delivered, carrying, durationSeconds, extract, extractName }) {
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
    const summary = el('div', 'bv-intro')
    summary.setAttribute('role', 'dialog')
    summary.setAttribute('aria-modal', 'true')
    summary.innerHTML = `
      <h2>RAID COMPLETE</h2>
      <p class="bv-intro-note">${how}<br>Cabbages delivered: ${delivered}.${carried}<br>Time in the valley: ${minutes}:${seconds}.</p>
      <div class="bv-intro-actions">
        <button type="button" class="bv-btn bv-btn--primary" data-bv="again">Raid Again</button>
      </div>`
    this.root.querySelector('.bv-ui').appendChild(summary)
    summary
      .querySelector('[data-bv="again"]')
      .addEventListener('click', () => window.location.reload())
  }

  setVignette(alpha) {
    this.vignetteEl.style.opacity = alpha.toFixed(3)
  }

  showStatic(show) {
    this.staticWrap.hidden = !show
  }

  drawStatic() {
    const ctx = this.staticCanvas.getContext('2d')
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

  showIntro(show, paused) {
    this.intro.hidden = !show
    if (show) {
      // Not "paused": the valley is persistent and the clock keeps running.
      this.introTitle.textContent = paused
        ? 'THE VALLEY DOES NOT WAIT'
        : 'BULL VALLEY SHADOW WARS'
      this.beginBtn.textContent = paused ? 'Resume the Raid' : 'Begin the Raid'
    }
  }
}
