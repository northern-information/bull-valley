// Pure: the drive-in past the corn maze's far end (sharedworld.ts rule
// 41). A gravel lot of burnt-out cars nosed up to a screen, a speaker post
// at every other stall, and at the back of the lot a cinder-block booth
// whose projector throws whatever film the valley has threaded, on loop,
// for everyone. The films are mp4s in the Worker's R2 bucket (worker/
// films.ts); the valley keeps only which one plays and since when (Reel).
//
// It stands in the maze's own frame (CONFIG.driveIn.at, maze-local), as the
// lookout does, so the valley finds the projector from the MazePlace the
// world was opened with and nothing more goes on the wire.
//
// Drive-in-local metres: the origin at the lot's middle, x and z along the
// maze's own x (away from the road) and z (along it, away from the maze).
// The screen stands at the +z end facing -z, back toward the maze; the
// booth stands at the -z end, its door at the back and its port facing the
// screen.

import { CONFIG } from './config.ts'
import { mazeToWorld, worldToMaze } from './maze.ts'
import { mulberry32, range } from './rng.ts'
import { weedAt } from './weedspots.ts'
import type { XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { WeedSpot } from './weedspots.ts'

export const DRIVE_IN = {
  // The screen: its middle this far along, this wide and tall, its foot
  // this high off the ground, on legs this far either side of its middle.
  screen: { z: 26, width: 20, height: 9, lift: 3.5, legs: 8, legHalf: 0.25 },
  // The booth: its middle this far along, this wide (across) and deep
  // (along), walls this tall and this thick, the door in its back wall
  // this wide, and the projector this far in from its front wall.
  booth: {
    z: -24,
    width: 6,
    depth: 4.5,
    height: 3,
    wallHalf: 0.12,
    door: 1.3,
    projectorIn: 1,
  },
  // The stalls: a row at each of these, a stall every `pitch` across, out
  // to `reach` either side. `cars` of them hold a burnt-out car.
  rows: [-14, -5, 4, 13],
  pitch: 5.2,
  reach: 26,
  cars: 3,
  // Tufts of weeds through the gravel: this many over the lot, and this
  // many more crowded round each car, within `weedHug` of it. None inside
  // the booth, which is kept empty.
  weeds: 160,
  weedsPerCar: 10,
  weedHug: 3,
  // Each car blocks as a capsule this far either side of its middle, this
  // wide.
  carHalf: 1.9,
  carRadius: 0.95,
  seed: 0xd71e,
} as const

// The shapes a burnt-out car was before the fire (driveinmodel.ts).
export const CAR_KINDS = ['sedan', 'wagon', 'pickup', 'coupe'] as const
export type CarKind = (typeof CAR_KINDS)[number]

// A burnt-out car in its stall, drive-in-local: its middle, its yaw
// (0 noses it at the screen, +z), its shape and the seed its char and
// rust are drawn from.
export interface CarSpot extends XZ {
  yaw: number
  kind: CarKind
  seed: number
}

// The film the valley has threaded, and since when (valley ms): it plays
// from its start then, on loop, for everyone (sharedworld.ts rule 41).
export interface Reel {
  film: string
  since: number
}

// The drive-in's middle in the world, turned as the maze is.
export function driveInPlace(maze: MazePlace): MazePlace {
  const at = mazeToWorld(maze, CONFIG.driveIn.at)
  return { x: at.x, z: at.z, yaw: maze.yaw }
}

// Drive-in-local metres to the world.
export function driveInToWorld(maze: MazePlace, p: XZ): XZ {
  return mazeToWorld(driveInPlace(maze), p)
}

// Whether a point lies on the lot, grown by `margin`.
export function onDriveIn(maze: MazePlace, p: XZ, margin = 0): boolean {
  const local = worldToMaze(driveInPlace(maze), p)
  const { half } = CONFIG.driveIn
  return (
    Math.abs(local.x) <= half.x + margin && Math.abs(local.z) <= half.z + margin
  )
}

// The projector, drive-in-local: inside the booth against its front wall,
// facing the screen.
export const PROJECTOR_AT: XZ = {
  x: 0,
  z: DRIVE_IN.booth.z + DRIVE_IN.booth.depth / 2 - DRIVE_IN.booth.projectorIn,
}

// The projector in the world.
export function projectorOf(maze: MazePlace): XZ {
  return driveInToWorld(maze, PROJECTOR_AT)
}

// Whether `at` (where a raider's last state frame put them) is close
// enough to the projector to thread it, with `slack` for the frames' own
// jitter.
export function atProjector(maze: MazePlace, at: XZ, slack = 0): boolean {
  const p = projectorOf(maze)
  return (
    Math.hypot(at.x - p.x, at.z - p.z) <= CONFIG.driveIn.projectorReach + slack
  )
}

// The booth's walls, drive-in-local, corner to corner so it closes with no
// gap but the door: the back wall in two pieces either side of it.
export function boothWalls(): { a: XZ; b: XZ; half: number }[] {
  const { z, width, depth, wallHalf, door } = DRIVE_IN.booth
  const x = width / 2
  const front = z + depth / 2
  const back = z - depth / 2
  const jamb = door / 2
  return [
    { a: { x: -x, z: back }, b: { x: -x, z: front } },
    { a: { x: -x, z: front }, b: { x, z: front } },
    { a: { x, z: front }, b: { x, z: back } },
    { a: { x, z: back }, b: { x: jamb, z: back } },
    { a: { x: -jamb, z: back }, b: { x: -x, z: back } },
  ].map((w) => ({ ...w, half: wallHalf }))
}

// The burnt-out cars, drive-in-local, the same for everyone: DRIVE_IN.cars
// stalls drawn from all the rows', each car nosed roughly at the screen.
export function carSpots(): CarSpot[] {
  const rng = mulberry32(DRIVE_IN.seed)
  const stalls = Math.floor(DRIVE_IN.reach / DRIVE_IN.pitch)
  const free: XZ[] = []
  for (const z of DRIVE_IN.rows) {
    for (let i = -stalls; i <= stalls; i++) {
      free.push({ x: i * DRIVE_IN.pitch, z })
    }
  }
  const spots: CarSpot[] = []
  while (spots.length < DRIVE_IN.cars && free.length > 0) {
    const [stall] = free.splice(Math.floor(rng() * free.length), 1)
    spots.push({
      x: stall.x,
      z: stall.z + range(rng, -0.4, 0.4),
      yaw: range(rng, -0.25, 0.25),
      kind: CAR_KINDS[Math.floor(rng() * CAR_KINDS.length)],
      seed: Math.floor(rng() * 0xffffff),
    })
  }
  return spots
}

// Whether a drive-in-local point lies inside the booth, grown by `margin`.
export function inBooth(p: XZ, margin = 0): boolean {
  const { z, width, depth } = DRIVE_IN.booth
  return (
    Math.abs(p.x) <= width / 2 + margin &&
    Math.abs(p.z - z) <= depth / 2 + margin
  )
}

// The weeds through the gravel, drive-in-local, the same for everyone:
// scattered over the lot and crowded round the cars, never in the booth.
// Each with the yaw and the height it grows to.
export function weedSpots(): WeedSpot[] {
  const rng = mulberry32(DRIVE_IN.seed ^ 0x3eed)
  const { half } = CONFIG.driveIn
  const spots: WeedSpot[] = []
  const grow = (x: number, z: number) => {
    const p = { x, z }
    if (Math.abs(x) > half.x || Math.abs(z) > half.z || inBooth(p, 0.3)) return
    spots.push(weedAt(rng, x, z))
  }
  for (let i = 0; i < DRIVE_IN.weeds; i++) {
    grow(range(rng, -half.x, half.x), range(rng, -half.z, half.z))
  }
  for (const car of carSpots()) {
    for (let i = 0; i < DRIVE_IN.weedsPerCar; i++) {
      const a = rng() * Math.PI * 2
      const r = range(rng, 1, DRIVE_IN.weedHug)
      grow(car.x + Math.cos(a) * r, car.z + Math.sin(a) * r)
    }
  }
  return spots
}

// The speaker posts, drive-in-local: one between every other pair of
// stalls in each row, where both cars could reach a speaker.
export function speakerPosts(): XZ[] {
  const posts: XZ[] = []
  const stalls = Math.floor(DRIVE_IN.reach / DRIVE_IN.pitch)
  for (const z of DRIVE_IN.rows) {
    for (let i = -stalls; i < stalls; i += 2) {
      posts.push({ x: (i + 0.5) * DRIVE_IN.pitch, z })
    }
  }
  return posts
}

// --- Films ----------------------------------------------------------------

// Where the Worker lists the films (GET, JSON `{ films: string[] }`) and
// serves each one, ranged, under its name (worker/films.ts).
export const FILMS_PATH = '/films'

export function filmUrl(name: string): string {
  return `${FILMS_PATH}/${encodeURIComponent(name)}`
}

// The longest name a film may go by in the bucket.
export const FILM_NAME_MAX = 120

// Whether `name` is a film the drive-in can show: an .mp4 at the bucket's
// top level, its name plain enough to sit in a URL path and a frame
// (letters, digits, spaces and a little punctuation, never a slash).
export function isFilmName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length <= FILM_NAME_MAX &&
    /^[A-Za-z0-9][\w .,()'&!-]*\.mp4$/i.test(name) &&
    !name.includes('..')
  )
}

// A film's name as the booth's list shows it: the .mp4 off, and its
// underscores as spaces.
export function filmTitle(name: string): string {
  return name.replace(/\.mp4$/i, '').replace(/_/g, ' ')
}

// Where in the film the reel is at `now` (valley ms): from its start at
// `since`, round and round a film `duration` seconds long. Nothing before
// it started, and nothing for a film of no length.
export function reelSeconds(reel: Reel, now: number, duration: number): number {
  if (!(duration > 0) || now <= reel.since) return 0
  return ((now - reel.since) / 1000) % duration
}

// Whether a film playing at `at` seconds is far enough off where the reel
// should be (`want`) to be put back, the loop's seam counted either way.
export function offReel(at: number, want: number, duration: number): boolean {
  if (!(duration > 0)) return false
  const d = Math.abs(at - want) % duration
  return Math.min(d, duration - d) > CONFIG.driveIn.resyncSeconds
}

// How loud the film is `distance` metres from the screen, 0 to 1: full
// under it, falling away to nothing at CONFIG.driveIn.hearRange.
export function screenVolume(distance: number): number {
  const t = 1 - distance / CONFIG.driveIn.hearRange
  return t <= 0 ? 0 : Math.min(1, t * t)
}
