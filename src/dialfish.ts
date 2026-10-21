// Fishing on Bull Valley Dial-Up (sharedworld.ts rules 29 and 35): the
// firefly pond in the lobby's sheet, from wherever the raider is, simpler
// than the tackle box's dialog and made for a thumb. Over it the pond as
// the phone draws it (pondview.ts, through dial3d.ts): the raider in their
// own character on the shore with their best rod, the bobber out on the
// water. Under it one line of the angler (the skill, today's catch, the
// bait, the rod), what the hook said, and one row of big buttons for what
// can be done now: take a rod and dig, cast with a bait, give up a line
// waiting on its bite, tap the arrow's side while a fish fights (its
// stamina and the line's clock in two bars), or reel the spent fish in.
// The fight is the 3D valley's own (fishplay.ts), stepped here on its own
// clock while the sheet is open.

import { copy } from './copy.ts'
import { el, text } from './dom.ts'
import { BAITS, rodIn, skillText, warned } from './fishing.ts'
import { baitName, feelingLine, hookLine } from './fishlines.ts'
import { FishPlay } from './fishplay.ts'
import { itemLabel } from './itemcopy.ts'
import type { DialState } from './dialstate.ts'
import type { Bait } from './fishing.ts'
import type { PondLine } from './pondview.ts'

export interface FishActions {
  tackle(): void
  dig(): void
  cast(bait: Bait): void
  reel(landed: boolean): void
  // The line came up empty, with what to say.
  empty(said: string): void
}

// How often the fight steps and the sheet is redrawn while it is open.
const TICK_MS = 50

export class DialFish {
  readonly root = el('div', 'bv-dial-fish')
  readonly canvas = document.createElement('canvas')
  private call = el('p', 'bv-dial-pond-call')
  private arrow = el('div', 'bv-dial-pond-arrow')
  private angler = el('p', 'bv-dial-note bv-dial-fish-angler')
  private feel = el('p', 'bv-dial-note bv-dial-fish-feel')
  private bars = el('div', 'bv-dial-fish-bars')
  private stamina = el('div', 'bv-dial-meter bv-dial-fish-bar')
  private clock = el('div', 'bv-dial-meter bv-dial-fish-bar')
  private act = el('div', 'bv-dial-fish-act')
  private play: FishPlay
  private s: DialState | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  // The buttons drawn last, by what they were, so a tick that changes
  // nothing leaves a button under a finger where it is.
  private drawn = ''
  private actions: FishActions
  private serverNow: () => number
  // Told what the line is doing every tick, for the pond view.
  onLine: (line: PondLine) => void = () => {}

  constructor(actions: FishActions, serverNow: () => number) {
    this.actions = actions
    this.serverNow = serverNow
    this.play = new FishPlay({
      reel: (landed) => actions.reel(landed),
      empty: (said) => actions.empty(said),
    })
    this.canvas.className = 'bv-dial-pond-canvas'
    this.canvas.setAttribute('role', 'img')
    this.canvas.setAttribute('aria-label', copy('dialup.fish.scene'))
    const scene = el('div', 'bv-dial-pond')
    scene.append(this.canvas, this.arrow, this.call)
    this.bars.append(
      text('span', copy('fishing.stamina'), 'bv-dial-stat-label'),
      this.stamina,
      text('span', copy('fishing.clock'), 'bv-dial-stat-label'),
      this.clock
    )
    this.root.append(scene, this.angler, this.feel, this.bars, this.act)
  }

  // The sheet is open: the fight steps on its own clock.
  open(): void {
    this.timer ??= setInterval(() => this.tick(), TICK_MS)
  }

  update(s: DialState): void {
    this.s = s
    this.tick()
  }

  // Lets a fish on the line go and stops the clock: the sheet is closing.
  close(): void {
    this.play.giveUp()
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.drawn = ''
  }

  private tick(): void {
    const s = this.s
    if (!s) return
    const now = performance.now()
    this.play.step(s.line, now)
    const phase = this.play.phase(now)
    const fight = this.play.state
    const hook = s.line?.hook ?? null
    const rod = rodIn(s.pack)
    const a = s.angler

    this.angler.textContent = a
      ? copy('dialup.fish.angler', {
          skill: skillText(a.skill),
          caught: a.caught,
          limit: a.perDay,
          worms: s.pack.nightcrawlers ?? 0,
          berries: s.pack.berries ?? 0,
          slurms: s.pack.slurm ?? 0,
          rod: rod ? itemLabel(rod) : copy('dialup.fish.no_rod'),
        })
      : copy('fishing.reading')

    const arrow = this.play.arrow
    this.onLine(
      phase === 'none' || phase === 'done'
        ? { out: false }
        : phase === 'waiting'
          ? { out: true, bite: false }
          : { out: true, bite: true, pull: arrow?.dir ?? null }
    )
    this.arrow.textContent =
      phase === 'spent'
        ? copy('fishing.spent')
        : arrow
          ? arrow.dir === 'left'
            ? '◀'
            : '▶'
          : ''
    this.arrow.classList.toggle('bv-dial-pond-arrow--gold', !!arrow?.gold)

    this.call.textContent =
      phase === 'waiting'
        ? copy('fishing.waiting')
        : hook && (phase === 'fight' || phase === 'spent')
          ? hookLine(hook.call)
          : ''
    const feelings =
      hook && fight && (phase === 'fight' || phase === 'spent')
        ? [
            ...(hook.feeling ? [feelingLine(hook.feeling)] : []),
            ...(hook.epic ? [copy('fishing.epic')] : []),
            ...(warned(hook.fight, fight) ? [copy('fishing.warn')] : []),
          ]
        : []
    this.feel.textContent = feelings.join(' ')
    this.feel.hidden = feelings.length === 0
    this.bars.hidden = !(hook && fight) || phase === 'waiting'
    if (hook && fight) {
      const left = Math.max(0, hook.fight.limitMs - fight.ms)
      this.stamina.style.setProperty(
        '--fill',
        String(fight.stamina / hook.fight.stamina)
      )
      this.clock.style.setProperty('--fill', String(left / hook.fight.limitMs))
    }

    this.drawActions(s, phase === 'done' ? 'none' : phase, rod)
  }

  // The one row of what can be done now, drawn again only when it changes.
  private drawActions(
    s: DialState,
    phase: 'none' | 'waiting' | 'fight' | 'spent',
    rod: string | null
  ): void {
    const a = s.angler
    const busy = s.pending.fish || !a
    const digIn = a ? Math.ceil((a.digAt - this.serverNow()) / 1000) : 0
    const tired = a !== null && a.caught >= a.perDay
    const button = (
      label: string,
      on: () => void,
      { hot = false, off = false, key = '' } = {}
    ) => {
      const b = text(
        'button',
        label,
        hot ? 'bv-dial-btn bv-dial-btn--hot' : 'bv-dial-btn'
      )
      b.type = 'button'
      b.disabled = off
      if (key) b.dataset.fish = key
      b.addEventListener('click', () => {
        on()
        this.tick()
      })
      return b
    }
    let buttons: HTMLButtonElement[]
    if (phase === 'waiting') {
      buttons = [
        button(copy('fishing.give_up'), () => this.play.giveUp(), {
          key: 'give-up',
          off: !s.line?.hook,
        }),
      ]
    } else if (phase === 'fight') {
      buttons = [
        button('◀', () => this.play.press('left'), { hot: true, key: 'left' }),
        button('▶', () => this.play.press('right'), {
          hot: true,
          key: 'right',
        }),
      ]
    } else if (phase === 'spent') {
      buttons = [
        button(copy('fishing.reel'), () => this.play.reelIn(), {
          hot: true,
          key: 'reel',
        }),
      ]
    } else if (!rod) {
      buttons = [
        button(copy('fishing.take_rod'), () => this.actions.tackle(), {
          hot: true,
          off: busy,
          key: 'rod',
        }),
      ]
    } else {
      buttons = [
        ...BAITS.map((bait) =>
          button(
            copy('fishing.cast_with', { bait: baitName(bait) }),
            () => this.actions.cast(bait),
            {
              hot: true,
              off: busy || tired || (s.pack[bait] ?? 0) < 1,
              key: `cast-${bait}`,
            }
          )
        ),
        button(
          digIn > 0
            ? copy('fishing.dig_wait', { seconds: digIn })
            : copy('fishing.dig'),
          () => this.actions.dig(),
          { off: busy || digIn > 0, key: 'dig' }
        ),
      ]
    }
    const drawn = buttons
      .map((b) => `${b.dataset.fish}:${b.textContent}:${b.disabled}`)
      .join('|')
    if (drawn === this.drawn) return
    this.drawn = drawn
    this.act.dataset.phase = phase
    this.act.replaceChildren(...buttons)
  }
}
