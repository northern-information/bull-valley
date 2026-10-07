// Matthew Marx's donuts: when he is done reading (marx.ts) he crosses the
// road to the field by the corn maze and tears it up until he is due home,
// someone arrives in the valley, or someone whistles. Pure and Three-free: the path is a polyline the truck
// drives like any route (truck.ts driveDonuts), drawn from a seed so every
// client in the valley draws the same one and the shared clock puts the
// truck at the same spot on it.
//
// The path is built from sets, each starting where the last one ended and
// facing the same way, so it never kinks:
// - a circle: a few loops one way, ending part of the way round the last,
// - a figure-eight: a loop one way, then a loop the other, a few times,
// - a dash: a hard turn, then a run across the field to somewhere new.
// Loops are drawn only where they fit inside the field.

import { pick, range } from './rng.ts'
import type { XZ } from './interfaces.ts'
import type { Rng } from './rng.ts'

export interface DonutField extends XZ {
  radius: number
}

export interface DonutTuning {
  // The path runs about this long, then ends where the truck parks.
  metres: number
  // Each loop's radius is drawn from this range.
  loop: { min: number; max: number }
}

// Metres between points: short enough that a tight loop stays round.
export const DONUT_STEP = 1.5
// The tightest the truck turns outside a loop, on the way in and on a dash.
const STEER_RADIUS = 7
// A loop keeps this far inside the field's edge.
const EDGE = 1.5
// How near a dash or the approach must come to its mark.
const ARRIVE = 3
const TAU = Math.PI * 2

// The path's pen: where it is, which way it faces (an angle in the x-z
// plane, the heading (cos, sin)), the points so far and their length.
interface Pen {
  x: number
  z: number
  heading: number
  points: XZ[]
  length: number
}

function step(pen: Pen, heading: number, metres: number): void {
  pen.heading = heading
  pen.x += Math.cos(heading) * metres
  pen.z += Math.sin(heading) * metres
  pen.points.push({ x: pen.x, z: pen.z })
  pen.length += metres
}

// Turns `angle` radians round a circle of `radius`: left (+1) or right (-1)
// of the heading.
function arc(pen: Pen, radius: number, side: 1 | -1, angle: number): void {
  const n = Math.max(1, Math.ceil((radius * angle) / DONUT_STEP))
  const cx = pen.x - side * radius * Math.sin(pen.heading)
  const cz = pen.z + side * radius * Math.cos(pen.heading)
  const start = pen.heading
  for (let i = 1; i <= n; i++) {
    const h = start + (side * angle * i) / n
    const x = cx + side * radius * Math.sin(h)
    const z = cz - side * radius * Math.cos(h)
    pen.length += Math.hypot(x - pen.x, z - pen.z)
    pen.x = x
    pen.z = z
    pen.heading = h
    pen.points.push({ x, z })
  }
}

// Drives toward `target`, turning no tighter than STEER_RADIUS, until
// within ARRIVE of it or `limit` metres on.
function steer(pen: Pen, target: XZ, limit: number): void {
  const most = DONUT_STEP / STEER_RADIUS
  for (let run = 0; run < limit; run += DONUT_STEP) {
    const dx = target.x - pen.x
    const dz = target.z - pen.z
    if (Math.hypot(dx, dz) < ARRIVE) return
    let turn = Math.atan2(dz, dx) - pen.heading
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    step(pen, pen.heading + Math.max(-most, Math.min(most, turn)), DONUT_STEP)
  }
}

// The middle of the loop of `radius` on `side` of the pen.
function loopCentre(pen: Pen, radius: number, side: 1 | -1): XZ {
  return {
    x: pen.x - side * radius * Math.sin(pen.heading),
    z: pen.z + side * radius * Math.cos(pen.heading),
  }
}

function fits(field: DonutField, centre: XZ, radius: number): boolean {
  return (
    Math.hypot(centre.x - field.x, centre.z - field.z) + radius <=
    field.radius - EDGE
  )
}

// The largest radius up to `want`, and no smaller than the tuning allows,
// whose loop on each of `sides` fits in the field; null when none does.
function fitRadius(
  pen: Pen,
  field: DonutField,
  tuning: DonutTuning,
  want: number,
  sides: readonly (1 | -1)[]
): number | null {
  for (let r = want; r >= tuning.loop.min; r -= 0.5) {
    if (sides.every((side) => fits(field, loopCentre(pen, r, side), r))) {
      return r
    }
  }
  return null
}

// A mark for a dash: somewhere in the middle half of the field.
function dashMark(field: DonutField, rng: Rng): XZ {
  const angle = rng() * TAU
  const out = Math.sqrt(rng()) * field.radius * 0.5
  return {
    x: field.x + Math.cos(angle) * out,
    z: field.z + Math.sin(angle) * out,
  }
}

// The whole path from where the truck is parked (`start`, facing
// `startDir`): across to the field, then sets until `tuning.metres`.
export function donutRoute(
  start: XZ,
  startDir: XZ,
  field: DonutField,
  rng: Rng,
  tuning: DonutTuning
): XZ[] {
  const pen: Pen = {
    x: start.x,
    z: start.z,
    heading: Math.atan2(startDir.z, startDir.x),
    points: [{ x: start.x, z: start.z }],
    length: 0,
  }
  steer(pen, field, field.radius * 6)
  const sides: readonly (1 | -1)[] = [1, -1]
  while (pen.length < tuning.metres) {
    const roll = rng()
    const side = pick(rng, sides)
    const want = range(rng, tuning.loop.min, tuning.loop.max)
    if (roll < 0.55) {
      const r = fitRadius(pen, field, tuning, want, [side])
      if (r !== null) {
        const loops = 2 + Math.floor(rng() * 4)
        arc(pen, r, side, (loops + rng()) * TAU)
        continue
      }
    } else if (roll < 0.85) {
      const r = fitRadius(pen, field, tuning, want, sides)
      if (r !== null) {
        const times = 1 + Math.floor(rng() * 3)
        for (let i = 0; i < times; i++) {
          arc(pen, r, side, TAU)
          arc(pen, r, side === 1 ? -1 : 1, TAU)
        }
        continue
      }
    }
    // A dash, or nowhere a loop fits from here. A mark already in reach
    // still rolls on a step, so the path always grows.
    const before = pen.length
    steer(pen, dashMark(field, rng), field.radius * 3)
    if (pen.length === before) step(pen, pen.heading, DONUT_STEP)
  }
  return pen.points
}
