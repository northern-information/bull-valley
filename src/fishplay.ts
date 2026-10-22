// The fight on the line as both apps play it (sharedworld.ts rule 36):
// the tackle box's dialog in the 3D valley (fishdialog.ts) and the pond on
// Bull Valley Dial-Up (dialfish.ts) step one of these on their own clock.
// It holds the line in the water as cast, waits out the bite, comes up
// empty when nothing bit, plays the fight the valley dealt (fishing.ts
// stepFight, pressFight), and reels once: in, when the fish is spent, or
// out, given up or with the clock run out. Pure: no three.js, no DOM.

import { copy } from './copy.ts'
import { pressFight, spent, startFight, stepFight } from './fishing.ts'
import type { Arrow, ArrowDir, FightState, LineOut } from './fishing.ts'

export interface FishPlayHooks {
  // A fish reeled in (`landed`: spent) or let go.
  reel: (landed: boolean) => void
  // The line came up empty, with what to say.
  empty: (said: string) => void
}

// Where the line stands: none in the water, waiting on the bite, a fish
// fighting, a fish spent and waiting to be reeled, or done with here (the
// valley's answer on its way).
export type FishPhase = 'none' | 'waiting' | 'fight' | 'spent' | 'done'

// A fight never steps more than this at once, so a tab left in the
// background does not lose the fish in one step when it comes back.
const MAX_STEP_MS = 250

export class FishPlay {
  private line: LineOut | null = null
  private fight: FightState | null = null
  private reeled = false
  private last = 0
  private hooks: FishPlayHooks

  constructor(hooks: FishPlayHooks) {
    this.hooks = hooks
  }

  // The line as the app holds it, stepped on to local `now` ms.
  step(line: LineOut | null, now: number): void {
    const dt = Math.min(Math.max(0, now - this.last), MAX_STEP_MS)
    this.last = now
    if (line !== this.line) {
      this.line = line
      this.fight = line?.hook ? startFight(line.hook.fight) : null
      this.reeled = false
    }
    if (!line || this.reeled || now < line.bitesAt) return
    if (!line.hook || !this.fight) {
      this.reeled = true
      this.hooks.empty(copy('fishing.nothing'))
      return
    }
    // The first step after the bite runs only from the bite.
    const since = now - line.bitesAt
    const step = this.fight.ms === 0 ? Math.min(since, dt) : dt
    this.fight = stepFight(line.hook.fight, this.fight, step, line.hook.seed)
    // Out of time, it is gone.
    if (this.fight.over) this.end(false)
  }

  phase(now: number): FishPhase {
    const line = this.line
    if (!line) return 'none'
    if (this.reeled) return 'done'
    if (now < line.bitesAt || !this.fight) return 'waiting'
    return spent(this.fight) ? 'spent' : 'fight'
  }

  // The fight as played, once something has bitten.
  get state(): FightState | null {
    return this.line && this.line.bitesAt <= this.last ? this.fight : null
  }

  get arrow(): Arrow | null {
    return this.phase(this.last) === 'fight'
      ? (this.fight?.arrow ?? null)
      : null
  }

  // A key or a tap toward `dir`.
  press(dir: ArrowDir): void {
    const hook = this.line?.hook
    if (!hook || !this.fight || this.phase(this.last) !== 'fight') return
    this.fight = pressFight(hook.fight, this.fight, dir)
  }

  // Reel the spent fish in.
  reelIn(): void {
    if (this.phase(this.last) === 'spent') this.end(true)
  }

  // Let a fish on the line go (a line still waiting on the bite too).
  giveUp(): void {
    const phase = this.phase(this.last)
    if (this.line?.hook && phase !== 'none' && phase !== 'done') {
      this.end(false)
    }
  }

  private end(landed: boolean): void {
    if (this.reeled) return
    this.reeled = true
    this.hooks.reel(landed)
  }
}
