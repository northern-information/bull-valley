// Pure: what Matthew Marx's donuts leave behind (donuts.ts): the clods of
// grass and dirt his rear wheels throw, flying and lying a moment, and the
// ruts they cut in the field. Scenery only, nothing on the wire or kept:
// each client throws its own clods, and cuts the ruts along the leg's route
// up to where the truck has got to (`tracksAlong`), so a client arriving
// mid-leg sees what it has cut already. donutwakerig.ts draws both.

import { clamp01 } from './math.ts'
import type { XZ } from './interfaces.ts'
import type { Rng } from './rng.ts'

// The rear wheels, truck-local [x, z] (truckbody.ts).
const REAR: readonly [number, number][] = [
  [0.85, -1.7],
  [-0.85, -1.7],
]

// Where the rear wheels touch the ground, the truck's middle at (x, z)
// and turned `heading` about y as Three turns it (rotation.y).
export function rearWheels(x: number, z: number, heading: number): XZ[] {
  const c = Math.cos(heading)
  const s = Math.sin(heading)
  return REAR.map(([lx, lz]) => ({
    x: x + lx * c + lz * s,
    z: z - lx * s + lz * c,
  }))
}

// The truck's middle and heading along `points`, every `step` metres from
// `from` to `to` metres along them (the last sample exactly at `to`, or the
// route's end): the ruts cut between two frames, however far apart, or all
// a leg has cut by the time a client arrives.
export interface Track extends XZ {
  heading: number
}
export function tracksAlong(
  points: readonly XZ[],
  from: number,
  to: number,
  step: number
): Track[] {
  const out: Track[] = []
  let along = 0
  let d = Math.max(0, from)
  for (let i = 1; i < points.length && d <= to; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const end = along + len
    if (len === 0 || end < d) {
      along = end
      continue
    }
    const heading = Math.atan2(b.x - a.x, b.z - a.z)
    while (d <= end && d <= to) {
      const t = (d - along) / len
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading })
      if (d === to) return out
      d = Math.min(d + step, to)
    }
    along = end
  }
  return out
}

// A clod: where it is and how it flies, how long it has flown, and whether
// it is grass (or dirt). Once landed it lies still until its life is out.
export interface Clod {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  // Grass or dirt, and which of its two shades.
  grass: boolean
  dark: boolean
  landed: boolean
}

export interface SprayTuning {
  // Clods a second at full speed.
  perSecond: number
  // The most a clod is flung back off the tyre, and up, in m/s.
  throw: number
  lift: number
  // Seconds a clod lasts, flying and lying.
  life: number
  // Never more clods than this at once.
  max: number
}

const GRAVITY = 9.8
// How high off the ground a clod leaves the tyre, in metres.
const TYRE = 0.25
// The share of clods that are grass, the rest dirt.
const GRASS = 0.45

// How many clods the wheels throw in `dt` seconds at `speed` of a top of
// `topSpeed`: the fractional part as a chance, so a slow frame rate throws
// as many a second as a fast one.
export function clodsDue(
  dt: number,
  speed: number,
  topSpeed: number,
  tuning: SprayTuning,
  rng: Rng
): number {
  const share = topSpeed > 0 ? clamp01(speed / topSpeed) : 0
  const due = tuning.perSecond * share * dt
  return Math.floor(due) + (rng() < due % 1 ? 1 : 0)
}

// One clod off a rear `wheel` standing on ground `groundY`, the truck
// turned `heading`: flung back off the tyre, scattered either side, up.
export function throwClod(
  wheel: XZ,
  groundY: number,
  heading: number,
  tuning: SprayTuning,
  rng: Rng
): Clod {
  // Back along the truck, scattered a little either way.
  const back = heading + Math.PI + (rng() - 0.5) * 1.4
  const speed = tuning.throw * (0.35 + 0.65 * rng())
  return {
    x: wheel.x + (rng() - 0.5) * 0.3,
    y: groundY + TYRE,
    z: wheel.z + (rng() - 0.5) * 0.3,
    vx: Math.sin(back) * speed,
    vy: tuning.lift * (0.4 + 0.6 * rng()),
    vz: Math.cos(back) * speed,
    age: 0,
    grass: rng() < GRASS,
    dark: rng() < 0.5,
    landed: false,
  }
}

// The clods `dt` seconds on, stepped in place (a few hundred a frame, so
// none is made anew): falling until they land on the ground, then lying
// there; those past their life are gone, and the oldest go first past the
// tuning's most.
export function stepClods(
  clods: Clod[],
  dt: number,
  groundAt: (x: number, z: number) => number,
  tuning: SprayTuning
): void {
  let kept = 0
  for (const clod of clods) {
    clod.age += dt
    if (clod.age >= tuning.life) continue
    clods[kept++] = clod
    if (clod.landed) continue
    clod.x += clod.vx * dt
    clod.z += clod.vz * dt
    clod.y += clod.vy * dt
    clod.vy -= GRAVITY * dt
    const ground = groundAt(clod.x, clod.z)
    if (clod.y <= ground && clod.vy < 0) {
      clod.y = ground
      clod.vx = 0
      clod.vy = 0
      clod.vz = 0
      clod.landed = true
    }
  }
  clods.length = kept
  if (kept > tuning.max) clods.splice(0, kept - tuning.max)
}

// Whether a point is inside the field, where there is grass to tear: no
// clods or ruts on the road he crosses to get there.
export function inField(field: XZ & { radius: number }, { x, z }: XZ): boolean {
  return Math.hypot(x - field.x, z - field.z) <= field.radius
}
