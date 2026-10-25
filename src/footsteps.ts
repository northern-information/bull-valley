// Pure: footsteps, ours and every raider's we see. A walker steps once for
// each stride walked on foot, the stride one half of the head's bob
// (player.ts, CONFIG.player.bobRate), so ours keep time with the view's
// swing, a step at its top and one at its foot. Each step sounds what is
// underfoot (ground.ts treadAt), placed at the feet, a crouch's quietly.
// A jump or a fall comes down with a step of its own. A walker riding the
// truck, emoting, or carried further in one frame than anyone walks (a
// portal, fast travel, the first frame they are seen) takes no step. Nothing goes on the wire: every client hears the feet it
// sees, as slurms.ts squashes under them. No three.js, no DOM.

import { CONFIG } from './config.ts'
import type { Tread } from './ground.ts'
import type { XZ } from './interfaces.ts'
import type { Cue, SfxId } from './sfx.ts'

export const TREAD_SOUNDS: Record<Tread, SfxId> = {
  grass: 'step-grass',
  dirt: 'step-dirt',
  asphalt: 'step-asphalt',
  concrete: 'step-concrete',
  tile: 'step-tile',
  wood: 'step-wood',
  metal: 'step-metal',
}

// Our own walker's id, which no peer's (a socket id) can be.
export const OWN_FEET = 'self'

// A raider's feet this frame.
export interface Walker extends XZ {
  id: string
  // The height the feet stand on.
  feet: number
  // On foot and free to step: not riding, not emoting.
  walking: boolean
  // Crouched: the step is quieter.
  quiet: boolean
  // Down from a jump or a fall this frame.
  landed?: boolean
}

// Where a walker was last frame, and how far into a stride.
export interface Stride extends XZ {
  walked: number
}

interface StepTuning {
  // Metres from one step to the next.
  stride: number
  // A move longer than this in one frame is no walk.
  leap: number
  // No step further from the raider than this is heard.
  hearing: number
  // A crouch's step against a stand's, 0 to 1.
  quietGain: number
  // How high off the feet a step sounds from, and a landing's pitch.
  rise: number
  landRate: number
}

export function stepTuning(cfg = CONFIG): StepTuning {
  return {
    stride: Math.PI / cfg.player.bobRate,
    ...cfg.sfx.steps,
  }
}

// The steps the walkers took since the last frame (`was`), and where each
// stands now for the next. A walker gone from the frame is forgotten.
export function footstepCues(
  was: ReadonlyMap<string, Stride>,
  walkers: readonly Walker[],
  treadAt: (x: number, z: number, feet: number) => Tread,
  player: XZ,
  tuning: StepTuning = stepTuning()
): { cues: Cue[]; strides: Map<string, Stride> } {
  const cues: Cue[] = []
  const strides = new Map<string, Stride>()
  const step = (w: Walker, rate: number, gain: number) => {
    if (Math.hypot(w.x - player.x, w.z - player.z) > tuning.hearing) return
    cues.push({
      id: TREAD_SOUNDS[treadAt(w.x, w.z, w.feet)],
      x: w.x,
      y: w.feet + tuning.rise,
      z: w.z,
      rate,
      gain,
    })
  }
  for (const w of walkers) {
    const prev = was.get(w.id)
    const moved = prev ? Math.hypot(w.x - prev.x, w.z - prev.z) : Infinity
    // Halfway into a stride, so the first step after comes soon.
    const fresh = { x: w.x, z: w.z, walked: tuning.stride / 2 }
    if (!prev || moved > tuning.leap) {
      strides.set(w.id, fresh)
      continue
    }
    if (!w.walking) {
      strides.set(w.id, { x: w.x, z: w.z, walked: prev.walked })
      continue
    }
    const gain = w.quiet ? tuning.quietGain : 1
    if (w.landed) {
      step(w, tuning.landRate, 1)
      strides.set(w.id, { x: w.x, z: w.z, walked: 0 })
      continue
    }
    let walked = prev.walked + moved
    if (walked >= tuning.stride) {
      walked %= tuning.stride
      step(w, 1, gain)
    }
    strides.set(w.id, { x: w.x, z: w.z, walked })
  }
  return { cues, strides }
}
