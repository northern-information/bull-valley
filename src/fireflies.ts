import { mulberry32, range } from './rng.ts'
import type { XZ } from './interfaces.ts'

// Fireflies over a field, as pure motion: no three.js, no DOM. Each fly is
// drawn once from the seed and then read at any time, so every raider sees
// the same flies in the same places, blinking in step. They blink as the
// common eastern firefly (Photinus pyralis) does: dark most of the time,
// then a half-second flash every five or six seconds, rising as it lights
// (the male's J-shaped swoop).

// One fly: where it hangs about, how it drifts, and when it flashes.
export interface Firefly {
  // Its home point, the middle of its wander.
  x: number
  z: number
  // How far it drifts from home on each axis, in metres.
  reach: number
  // Two slow waves an axis: [frequency in radians a second, phase].
  wx: [number, number, number, number]
  wz: [number, number, number, number]
  // Height over the ground: a middle, a sway about it, and the sway's wave.
  lift: number
  sway: number
  swayRate: number
  swayPhase: number
  // Seconds between flashes, and where in that cycle it is at t = 0.
  period: number
  phase: number
}

// Where a fly is and how bright, at one moment.
export interface FireflyState {
  x: number
  z: number
  // Height over the ground, in metres.
  lift: number
  // 0 dark, 1 at the peak of a flash.
  glow: number
}

export const FIREFLY = {
  // The band it hovers in over the ground.
  liftMin: 0.4,
  liftMax: 3,
  // How long a flash lasts, and the range of its period (P. pyralis
  // flashes about every 5.5 s on a warm night).
  flash: 0.5,
  period: [4.5, 7] as const,
  // The farthest a fly wanders from home, and how much it climbs during a
  // flash.
  reach: 3,
  swoop: 0.3,
}

// `count` flies scattered evenly over the disc at `centre`, wandering only
// as far as keeps every one of them inside `radius`.
export function fireflyField(
  seed: number,
  count: number,
  centre: XZ,
  radius: number
): Firefly[] {
  const rng = mulberry32(seed)
  // A fly drifts at most `reach` on each axis, so √2·reach in all; its
  // home stays that far in from the rim.
  const reach = Math.min(FIREFLY.reach, radius / 4)
  const homeRadius = Math.max(0, radius - reach * Math.SQRT2)
  const swayMax = 0.4
  const flies: Firefly[] = []
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rng()) * homeRadius
    const a = rng() * Math.PI * 2
    const sway = range(rng, 0.1, swayMax)
    // Room for the swoop on top, so a flashing fly stays under liftMax.
    const lift = range(
      rng,
      FIREFLY.liftMin + sway,
      FIREFLY.liftMax - sway - FIREFLY.swoop
    )
    flies.push({
      x: centre.x + Math.cos(a) * r,
      z: centre.z + Math.sin(a) * r,
      reach: range(rng, 0.4, 1) * reach,
      wx: [
        range(rng, 0.05, 0.15),
        rng() * Math.PI * 2,
        range(rng, 0.2, 0.45),
        rng() * Math.PI * 2,
      ],
      wz: [
        range(rng, 0.05, 0.15),
        rng() * Math.PI * 2,
        range(rng, 0.2, 0.45),
        rng() * Math.PI * 2,
      ],
      lift,
      sway,
      swayRate: range(rng, 0.2, 0.6),
      swayPhase: rng() * Math.PI * 2,
      period: range(rng, FIREFLY.period[0], FIREFLY.period[1]),
      phase: rng() * FIREFLY.period[1],
    })
  }
  return flies
}

// A slow wander: a long wave and a short one, together never past 1.
function wander(w: readonly number[], t: number): number {
  return 0.7 * Math.sin(w[0] * t + w[1]) + 0.3 * Math.sin(w[2] * t + w[3])
}

// How far into its flash a fly is: 0..1 while lit, -1 while dark.
function flashAt(fly: Firefly, t: number): number {
  const into = (((t + fly.phase) % fly.period) + fly.period) % fly.period
  return into < FIREFLY.flash ? into / FIREFLY.flash : -1
}

export function fireflyAt(fly: Firefly, t: number): FireflyState {
  const s = flashAt(fly, t)
  // Quick to light, slower to go out: the peak sits a third of the way in.
  let glow = 0
  if (s >= 0) {
    glow = s < 1 / 3 ? s * 3 : (1 - s) * 1.5
    glow = glow * glow * (3 - 2 * glow)
  }
  const swoop = s >= 0 ? FIREFLY.swoop * s : 0
  return {
    x: fly.x + fly.reach * wander(fly.wx, t),
    z: fly.z + fly.reach * wander(fly.wz, t),
    lift:
      fly.lift + fly.sway * Math.sin(fly.swayRate * t + fly.swayPhase) + swoop,
    glow,
  }
}
