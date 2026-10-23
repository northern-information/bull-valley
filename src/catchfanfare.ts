// Pure: a fish landed made a big deal of, the same in both apps
// (sharedworld.ts rule 36). The 3D valley sweeps its banner across the
// view (seasonhud.ts) and Dial-Up across the pond's scene (dialfish.ts),
// with the same words; both burst fireflies over it (catchburst.ts) and
// play the fanfare (sfx.ts `fish-fanfare`); and the fish itself comes up
// out of the water on the line, thrashing, and hangs there a moment
// (`hoistPose`), off the valley's pond (pondsite.ts) and off the phone's
// (pondview.ts). A bigger fish is a bigger deal: a large one's banner
// burns gold, and the legend's says nobody will believe you. Junk is
// no fish, and comes in quietly. No three.js, no DOM.

import { copy } from './copy.ts'
import { catchableOf, skillText } from './fishing.ts'
import { itemLabel } from './itemcopy.ts'
import type { CatchMessage } from './protocol.ts'

// How big a deal: any fish, a large one, or the pond's legend.
export type FanfareTier = 'fish' | 'big' | 'legend'

export interface Fanfare {
  kind: string
  tier: FanfareTier
  kicker: string
  headline: string
  detail?: string
  gold: boolean
}

export const FANFARE = {
  // How long the fish hangs off the line, seconds, from the reel in: up
  // out of the water over `rise`, then thrashing, then gone into the pack
  // over the last `fade`.
  seconds: 3.4,
  rise: 0.55,
  fade: 0.4,
  // How hard it thrashes, radians, and how fast, Hz; and how fast it
  // turns on the line, radians a second.
  thrash: 0.55,
  thrashHz: 3.2,
  spin: 1.4,
  // How a phone buzzes for each tier, ms on and off (dialfish.ts).
  buzz: {
    fish: [80, 60, 80],
    big: [120, 60, 120, 60, 220],
    legend: [220, 80, 220, 80, 480],
  } as Record<FanfareTier, number[]>,
  // How many fireflies burst for each tier (catchburst.ts).
  sparks: { fish: 28, big: 44, legend: 72 } as Record<FanfareTier, number>,
} as const

// The line over the fish's name, by how big a deal it is.
const KICKER: Record<FanfareTier, () => string> = {
  fish: () => copy('fishing.fanfare_fish'),
  big: () => copy('fishing.fanfare_big'),
  legend: () => copy('fishing.fanfare_legend'),
}

// The fanfare for how the line came out, or null for anything but a fish
// landed.
export function fanfareOf(
  msg: Pick<CatchMessage, 'outcome' | 'kind' | 'skill' | 'up'>
): Fanfare | null {
  if (msg.outcome !== 'landed' || !msg.kind) return null
  const fish = catchableOf(msg.kind)
  if (!fish || fish.junk) return null
  const tier: FanfareTier = fish.legend
    ? 'legend'
    : fish.size === 'large'
      ? 'big'
      : 'fish'
  const details = [
    ...(tier === 'legend' ? [copy('fishing.fanfare_legend_detail')] : []),
    ...(msg.up
      ? [copy('fishing.fanfare_skill', { skill: skillText(msg.skill) })]
      : []),
  ]
  return {
    kind: msg.kind,
    tier,
    kicker: KICKER[tier](),
    headline: itemLabel(msg.kind),
    ...(details.length > 0 ? { detail: details.join(' · ') } : {}),
    gold: tier !== 'fish',
  }
}

export interface Hoist {
  // How far up out of the water, 0 at the bobber to 1 hanging at the top.
  rise: number
  // Its thrash on the line (a roll, radians) and its turn about the line.
  thrash: number
  turn: number
  // How much of it is left as it goes into the pack, 1 to 0.
  scale: number
}

// The fish `t` seconds after the reel in, or null once it is in the pack.
export function hoistPose(
  t: number,
  cfg: typeof FANFARE = FANFARE
): Hoist | null {
  if (t < 0 || t >= cfg.seconds) return null
  const up = Math.min(1, t / cfg.rise)
  // Out of the water fast, easing to the top.
  const rise = 1 - (1 - up) ** 3
  // Thrashing hardest as it comes out, settling as it hangs.
  const fight = 1 - 0.6 * Math.min(1, t / cfg.seconds)
  const thrash = Math.sin(t * Math.PI * 2 * cfg.thrashHz) * cfg.thrash * fight
  const left = cfg.seconds - t
  const scale = left < cfg.fade ? left / cfg.fade : 1
  return { rise, thrash, turn: t * cfg.spin, scale }
}
