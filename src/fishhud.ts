// The line in the water as the 3D valley shows it (sharedworld.ts rule
// 35): with the rod in hand a click at the firefly pond casts, and the
// fight plays over the view, low in the middle, the way Final Fantasy XI
// plays it over the field. It shows the wait, the hook's call and the
// feeling, then the arrow to answer with A or ← and D or → (gold for a
// gold one), the fish's stamina and the line's clock, and Spent once the
// fish can be reeled. The click reels a spent fish in, and gives the line
// up before then. The fight is the one both apps play (fishplay.ts),
// stepped here every frame by the loop; actions.ts sends the frames.

import { FISHING } from './bindings.ts'
import { copy } from './copy.ts'
import { el, text } from './dom.ts'
import { spent, warned } from './fishing.ts'
import { feelingLine, hookLine } from './fishlines.ts'
import { FishPlay } from './fishplay.ts'
import type { ArrowDir, LineOut } from './fishing.ts'
import type { FishPhase } from './fishplay.ts'

export class FishHud {
  readonly root = el('div', 'bv-fish-hud')
  private call = el('p', 'bv-fish-hud-call')
  private feel = el('p', 'bv-fish-hud-feel')
  private fight = el('div', 'bv-fish-hud-fight')
  private arrow = el('div', 'bv-fish-hud-arrow')
  private stamina = el('div')
  private clock = el('div')
  private how = el('p', 'bv-fish-hud-how')
  private play: FishPlay
  private now = 0
  // Told when a fish is reeled in (`landed`: spent) or given up, and when
  // the line comes up empty, with what to say (actions.ts sends them).
  onReel: (landed: boolean) => void = () => {}
  onEmpty: (said: string) => void = () => {}

  constructor() {
    this.play = new FishPlay({
      reel: (landed) => this.onReel(landed),
      empty: (said) => this.onEmpty(said),
    })
    this.root.hidden = true
    this.root.setAttribute('aria-live', 'polite')
    const meter = (label: string, fill: HTMLElement) => {
      const box = el('div', 'bv-fish-hud-meter')
      const bar = el('div', 'bv-npc-meter')
      bar.append(fill)
      box.append(text('span', label, 'bv-npc-label'), bar)
      return box
    }
    this.fight.append(
      text('span', `◀ ${FISHING.left.key}`, 'bv-fish-hud-key'),
      this.arrow,
      text('span', `${FISHING.right.key} ▶`, 'bv-fish-hud-key'),
      meter(copy('fishing.stamina'), this.stamina),
      meter(copy('fishing.clock'), this.clock)
    )
    this.root.append(this.call, this.feel, this.fight, this.how)
  }

  // The line as the game holds it, stepped on to local `now` ms, and drawn.
  update(line: LineOut | null, now: number): void {
    this.now = now
    this.play.step(line, now)
    const phase = this.play.phase(now)
    const out = phase !== 'none' && phase !== 'done'
    this.root.hidden = !out
    if (!out) return
    const hook = line?.hook ?? null
    const state = this.play.state
    if (phase === 'waiting' || !hook || !state) {
      this.call.textContent = copy('fishing.waiting')
      this.feel.textContent = ''
      this.fight.hidden = true
      this.how.textContent = copy('fishing.hud_wait')
      return
    }
    this.call.textContent = hookLine(hook.call)
    const feelings = [
      ...(hook.feeling ? [feelingLine(hook.feeling)] : []),
      ...(hook.epic ? [copy('fishing.epic')] : []),
      ...(warned(hook.fight, state) ? [copy('fishing.warn')] : []),
    ]
    this.feel.textContent = feelings.join(' ')
    this.fight.hidden = false
    const ready = spent(state)
    const arrow = this.play.arrow
    this.arrow.textContent = ready
      ? copy('fishing.spent')
      : arrow
        ? arrow.dir === 'left'
          ? '◀'
          : '▶'
        : ''
    this.arrow.classList.toggle('bv-fish-hud-arrow--gold', arrow?.gold === true)
    this.arrow.classList.toggle('bv-fish-hud-arrow--spent', ready)
    const left = Math.max(0, hook.fight.limitMs - state.ms)
    this.stamina.style.width = `${Math.round((state.stamina / hook.fight.stamina) * 100)}%`
    this.clock.style.width = `${Math.round((left / hook.fight.limitMs) * 100)}%`
    this.how.textContent = copy(
      ready ? 'fishing.hud_reel' : 'fishing.hud_fight'
    )
  }

  // Where the line stands, as last stepped.
  get phase(): FishPhase {
    return this.play.phase(this.now)
  }

  // A line in the water, waiting or fighting: the raider stands to it.
  get out(): boolean {
    const phase = this.phase
    return phase !== 'none' && phase !== 'done'
  }

  // A key toward `dir`.
  press(dir: ArrowDir): void {
    this.play.press(dir)
  }

  // The click with a line out: a spent fish reeled in, anything before
  // that given up. Says whether there was a line to answer it.
  click(): boolean {
    const phase = this.phase
    if (phase === 'spent') this.play.reelIn()
    else if (phase === 'waiting' || phase === 'fight') this.play.giveUp()
    else return false
    return true
  }

  // Let the line go: the rod put away, or the raider gone.
  giveUp(): void {
    this.play.giveUp()
  }
}
