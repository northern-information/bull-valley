// The tackle box on the firefly pond's landing (sharedworld.ts rule 35): a
// dialog over the valley, opened with E at the box, in the frame Erwin's
// and the stand's share (npcdialog.ts); Dial-Up fishes the pond in a sheet
// of its own (dialfish.ts). It
// shows the angler (the skill, today's catch against the day's limit, the
// rod fished with and the bait in the pack), the buttons that take a rod and dig the
// bank, a cast for each bait, and the line: the wait, the hook's call and
// the feeling, then the fight as Final Fantasy XI draws it, an arrow to
// answer left or right (a gold one drains far more), the fish's stamina
// and the clock, and Reel In once the fish is spent. The fight is played
// here from what the valley dealt (fishplay.ts); the caller sends
// the frames, and the dialog reads the game's state again every tick, so
// the valley's answers show as they land.

import { actionOf, FISHING } from './bindings.ts'
import { copy } from './copy.ts'
import { finder } from './dom.ts'
import { BAITS, rodIn, skillText, spent, warned } from './fishing.ts'
import { baitName, feelingLine, hookLine } from './fishlines.ts'
import { FishPlay } from './fishplay.ts'
import { itemLabel } from './itemcopy.ts'
import { npcFooter, npcHeader, sectionHead } from './npcdialog.ts'
import type { AnglerWire, Bait, LineOut } from './fishing.ts'
import type { Inventory } from './interfaces.ts'

interface FishDialogOptions {
  // Read again every tick: the angler (null until the valley has sent
  // it), the pack, the line in the water (null with none), whether a frame
  // is still unanswered, and the last word on one.
  angler: () => AnglerWire | null
  pack: () => Inventory
  line: () => LineOut | null
  pending: () => boolean
  said: () => string | null
  // The valley's clock, ms, for the dig's cooldown.
  serverNow: () => number
  onTackle: () => void
  onDig: () => void
  onCast: (bait: Bait) => void
  // A fish reeled in (`landed`: spent) or given up.
  onReel: (landed: boolean) => void
  // The line came up empty: done with on this side, with what to say.
  onLineDone: (said: string) => void
}

// How often the fight steps and the readout is redrawn.
const TICK_MS = 50

// Mounts the dialog over everything and resolves once it is closed.
export function openFishDialog(options: FishDialogOptions): Promise<void> {
  const root = document.createElement('div')
  root.className = 'bv-account bv-npc bv-fish'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'bv-fish-title')
  const casts = BAITS.map(
    (bait) => `
      <div class="bv-npc-act bv-npc-c6">
        <button type="button" class="bv-btn bv-npc-btn bv-btn--primary" data-cast="${bait}"></button>
        <span class="bv-npc-why" data-cast-why="${bait}"></span>
      </div>`
  ).join('')
  root.innerHTML = `
    <div class="bv-npc-ui">
      ${npcHeader({
        titleId: 'bv-fish-title',
        title: copy('fishing.title'),
        eyebrow: copy('fishing.eyebrow'),
        where: copy('fishing.where'),
        status: '',
        speech: false,
      })}
      <section class="bv-npc-section" data-bv="fish-tackle">
        ${sectionHead(copy('fishing.angler'), 'fish-angler')}
        <div class="bv-npc-grid">
          <div class="bv-npc-stat bv-npc-c3">
            <span class="bv-npc-label">${copy('fishing.skill')}</span>
            <span class="bv-npc-numeral" data-bv="fish-skill"></span>
          </div>
          <div class="bv-npc-stat bv-npc-c3">
            <span class="bv-npc-label">${copy('fishing.today')}</span>
            <span class="bv-npc-numeral" data-bv="fish-today"></span>
          </div>
          ${BAITS.map(
            (bait) => `
          <div class="bv-npc-stat bv-npc-c3">
            <span class="bv-npc-label">${baitName(bait)}</span>
            <span class="bv-npc-numeral" data-bait="${bait}"></span>
          </div>`
          ).join('')}
          <div class="bv-npc-act bv-npc-c6">
            <button type="button" class="bv-btn bv-npc-btn" data-bv="fish-rod"></button>
          </div>
          <div class="bv-npc-act bv-npc-c6">
            <button type="button" class="bv-btn bv-npc-btn" data-bv="fish-dig"></button>
          </div>
        </div>
      </section>
      <section class="bv-npc-section" data-bv="fish-casts">
        ${sectionHead(copy('fishing.cast'), 'fish-cast')}
        <div class="bv-npc-grid bv-npc-grid--top">${casts}</div>
      </section>
      <section class="bv-npc-section bv-fish-line" data-bv="fish-line">
        ${sectionHead(copy('fishing.line'), 'fish-line-meta')}
        <p class="bv-npc-lede bv-fish-call" data-bv="fish-call" aria-live="polite"></p>
        <p class="bv-npc-hint" data-bv="fish-feel"></p>
        <div class="bv-npc-grid bv-fish-fight" data-bv="fish-fight">
          <button type="button" class="bv-btn bv-npc-btn bv-fish-dir bv-npc-c3" data-dir="left">◀ ${FISHING.left.key}</button>
          <div class="bv-fish-arrow bv-npc-c6" data-bv="fish-arrow"></div>
          <button type="button" class="bv-btn bv-npc-btn bv-fish-dir bv-npc-c3" data-dir="right">${FISHING.right.key} ▶</button>
          <div class="bv-npc-meter-box bv-npc-c12">
            <div class="bv-npc-legend">
              <span class="bv-npc-label">${copy('fishing.stamina')}</span>
              <span class="bv-npc-label" data-bv="fish-stamina"></span>
            </div>
            <div class="bv-npc-meter"><div data-bv="fish-stamina-fill"></div></div>
          </div>
          <div class="bv-npc-meter-box bv-npc-c12">
            <div class="bv-npc-legend">
              <span class="bv-npc-label">${copy('fishing.clock')}</span>
              <span class="bv-npc-label" data-bv="fish-clock"></span>
            </div>
            <div class="bv-npc-meter"><div data-bv="fish-clock-fill"></div></div>
          </div>
          <div class="bv-npc-act bv-npc-c6">
            <button type="button" class="bv-btn bv-npc-btn" data-bv="fish-give-up">${copy('fishing.give_up')}</button>
          </div>
          <div class="bv-npc-act bv-npc-c6">
            <button type="button" class="bv-btn bv-npc-btn bv-btn--primary bv-fish-reel" data-bv="fish-reel"><span class="bv-npc-key">${FISHING.reel.key}</span>${copy('fishing.reel')}</button>
          </div>
        </div>
      </section>
      ${npcFooter('fish-said', 'fish-close', copy('fishing.close'))}
    </div>`
  document.body.appendChild(root)

  const find = finder(root)
  find<HTMLParagraphElement>('[data-bv="npc-lede"]').textContent =
    copy('fishing.says')
  const skill = find<HTMLElement>('[data-bv="fish-skill"]')
  const today = find<HTMLElement>('[data-bv="fish-today"]')
  const baitCounts = BAITS.map((bait) => ({
    bait,
    cell: find<HTMLElement>(`[data-bait="${bait}"]`),
  }))
  const tackleSection = find<HTMLElement>('[data-bv="fish-tackle"]')
  const castSection = find<HTMLElement>('[data-bv="fish-casts"]')
  const rodBtn = find<HTMLButtonElement>('[data-bv="fish-rod"]')
  const digBtn = find<HTMLButtonElement>('[data-bv="fish-dig"]')
  const castBtns = BAITS.map((bait) => ({
    bait,
    btn: find<HTMLButtonElement>(`[data-cast="${bait}"]`),
    why: find<HTMLElement>(`[data-cast-why="${bait}"]`),
  }))
  const lineSection = find<HTMLElement>('[data-bv="fish-line"]')
  const lineMeta = find<HTMLElement>('[data-bv="fish-line-meta"]')
  const call = find<HTMLParagraphElement>('[data-bv="fish-call"]')
  const feel = find<HTMLParagraphElement>('[data-bv="fish-feel"]')
  const fightBox = find<HTMLElement>('[data-bv="fish-fight"]')
  const arrowBox = find<HTMLElement>('[data-bv="fish-arrow"]')
  const dirBtns = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-dir]')
  )
  const staminaText = find<HTMLElement>('[data-bv="fish-stamina"]')
  const staminaFill = find<HTMLElement>('[data-bv="fish-stamina-fill"]')
  const clockText = find<HTMLElement>('[data-bv="fish-clock"]')
  const clockFill = find<HTMLElement>('[data-bv="fish-clock-fill"]')
  const giveUpBtn = find<HTMLButtonElement>('[data-bv="fish-give-up"]')
  const reelBtn = find<HTMLButtonElement>('[data-bv="fish-reel"]')
  const said = find<HTMLParagraphElement>('[data-bv="fish-said"]')
  const closeBtn = find<HTMLButtonElement>('[data-bv="fish-close"]')

  // The fight as played here (fishplay.ts), for the line it was dealt.
  const play = new FishPlay({
    reel: (landed) => options.onReel(landed),
    empty: (said) => options.onLineDone(said),
  })
  let seen: LineOut | null = null

  const step = (now: number) => {
    const line = options.line()
    if (line && line !== seen) {
      // Space and Enter answer the fight, never a focused button.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    }
    seen = line
    play.step(line, now)
  }

  const refresh = () => {
    const now = performance.now()
    step(now)
    const angler = options.angler()
    const pack = options.pack()
    const line = options.line()
    const busy = options.pending() || !angler
    said.textContent = options.said() ?? (angler ? '' : copy('fishing.reading'))
    const rod = rodIn(pack)
    const tired = angler !== null && angler.caught >= angler.perDay
    skill.textContent = angler ? skillText(angler.skill) : '—'
    today.textContent = angler
      ? copy('fishing.today_value', {
          caught: angler.caught,
          limit: angler.perDay,
        })
      : '—'
    for (const { bait, cell } of baitCounts) {
      cell.textContent = String(pack[bait] ?? 0)
    }
    rodBtn.textContent = rod
      ? copy('fishing.has_rod', { rod: itemLabel(rod) })
      : copy('fishing.take_rod')
    rodBtn.disabled = busy || rod !== null
    const digIn = angler
      ? Math.ceil((angler.digAt - options.serverNow()) / 1000)
      : 0
    digBtn.textContent =
      digIn > 0
        ? copy('fishing.dig_wait', { seconds: digIn })
        : copy('fishing.dig')
    digBtn.disabled = busy || digIn > 0
    for (const { bait, btn, why } of castBtns) {
      btn.textContent = copy('fishing.cast_with', { bait: baitName(bait) })
      const reason = !rod
        ? copy('fishing.why_rod')
        : (pack[bait] ?? 0) < 1
          ? copy('fishing.why_bait', { bait: baitName(bait) })
          : tired
            ? copy('fishing.why_tired')
            : ''
      why.textContent = reason
      btn.disabled = busy || line !== null || reason !== ''
    }

    // With a line in the water the line is all there is.
    lineSection.hidden = line === null
    tackleSection.hidden = line !== null
    castSection.hidden = line !== null
    if (!line) {
      lineMeta.textContent = ''
      return
    }
    const hook = line.hook
    const phase = play.phase(now)
    const state = play.state
    const waiting = phase === 'waiting'
    lineMeta.textContent = waiting ? copy('fishing.waiting_meta') : ''
    if (waiting || !hook || !state) {
      call.textContent = copy('fishing.waiting')
      feel.textContent = ''
      fightBox.hidden = true
      return
    }
    const { fight } = hook
    const done = phase === 'done'
    call.textContent = hookLine(hook.call)
    const feelings = [
      ...(hook.feeling ? [feelingLine(hook.feeling)] : []),
      ...(hook.epic ? [copy('fishing.epic')] : []),
      ...(warned(fight, state) ? [copy('fishing.warn')] : []),
    ]
    feel.textContent = feelings.join(' ')
    fightBox.hidden = false
    const ready = spent(state)
    const arrow = play.arrow
    arrowBox.textContent = ready
      ? copy('fishing.spent')
      : arrow
        ? arrow.dir === 'left'
          ? '◀'
          : '▶'
        : ''
    arrowBox.classList.toggle('bv-fish-arrow--gold', arrow?.gold === true)
    arrowBox.classList.toggle('bv-fish-arrow--spent', ready)
    const pct = Math.round((state.stamina / fight.stamina) * 100)
    staminaText.textContent = `${pct}%`
    staminaFill.style.width = `${pct}%`
    const left = Math.max(0, fight.limitMs - state.ms)
    clockText.textContent = copy('fishing.clock_value', {
      seconds: Math.ceil(left / 1000),
    })
    clockFill.style.width = `${Math.round((left / fight.limitMs) * 100)}%`
    for (const btn of dirBtns) btn.disabled = done || ready
    giveUpBtn.disabled = done
    reelBtn.disabled = done || !ready
  }

  return new Promise<void>((resolve) => {
    // The game listens on the document too, and pointer lock is off while
    // the dialog is open, so its keys do nothing; Escape closes it (giving
    // up a fish on the line).
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (!options.line()?.hook) return
      const action = actionOf(FISHING, e.code)
      if (!action) return
      e.preventDefault()
      if (action === 'reel') play.reelIn()
      else play.press(action)
      refresh()
    }
    const timer = setInterval(refresh, TICK_MS)

    function close(): void {
      play.giveUp()
      clearInterval(timer)
      document.removeEventListener('keydown', onKey)
      root.remove()
      resolve()
    }

    rodBtn.addEventListener('click', () => {
      if (!options.pending()) options.onTackle()
      refresh()
    })
    digBtn.addEventListener('click', () => {
      if (!options.pending()) options.onDig()
      refresh()
    })
    for (const { bait, btn } of castBtns) {
      btn.addEventListener('click', () => {
        if (!options.pending() && !options.line()) options.onCast(bait)
        refresh()
      })
    }
    for (const btn of dirBtns) {
      btn.addEventListener('click', () => {
        play.press(btn.dataset.dir === 'left' ? 'left' : 'right')
        refresh()
      })
    }
    giveUpBtn.addEventListener('click', () => {
      play.giveUp()
      refresh()
    })
    reelBtn.addEventListener('click', () => {
      play.reelIn()
      refresh()
    })
    closeBtn.addEventListener('click', close)
    document.addEventListener('keydown', onKey)

    refresh()
    closeBtn.focus({ preventScroll: true })
  })
}
