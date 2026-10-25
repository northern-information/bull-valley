// Pure: the lookout tower beside the corn maze's gate, high enough to look
// down over the corn and make out the paths. It stands in the maze's own
// frame (CONFIG.maze.lookout.at, maze-local), so the valley finds it from
// the MazePlace the world was opened with and nothing more goes on the
// wire.
//
// The ground is a heightfield, so the deck is a registered floor over the
// tower's square footprint, and the footprint is walled all the way round:
// up top the walls are the railing, and at the foot they keep anyone from
// walking in under the deck (where the ground would lift them onto it). So
// anyone standing inside the footprint is up on the deck, and up there is
// out of every shadow's reach (sharedworld.ts rule 11). The ladder moves a
// raider up and down (client-only, player.relocate), like the Undercroft's.
//
// Lookout-local metres: the origin under the deck's middle, x and z along
// the maze's own x (away from the road) and z (along it).

import { CONFIG } from './config.ts'
import { mazeToWorld, worldToMaze } from './maze.ts'
import type { XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'

export const LOOKOUT = {
  // Half the deck's side, and its height over the highest ground at its
  // corners.
  half: 2.5,
  height: 16,
  // The four legs splay out this far past the deck's corners at the foot,
  // and each blocks like a post this thick.
  spread: 1.2,
  legHalf: 0.2,
  // The railing round the deck, and how thick it blocks.
  rail: 1.05,
  wallHalf: 0.12,
  // The ladder climbs the tower's -x face (toward the gate and the road),
  // leaning on it. Its foot is this far out from that face, its top this
  // far in.
  footOut: 1.6,
  topIn: 0.9,
} as const

// The tower's middle in the world, turned as the maze is.
export function lookoutPlace(maze: MazePlace): MazePlace {
  const at = mazeToWorld(maze, CONFIG.maze.lookout.at)
  return { x: at.x, z: at.z, yaw: maze.yaw }
}

// Lookout-local metres to the world.
export function lookoutToWorld(maze: MazePlace, p: XZ): XZ {
  return mazeToWorld(lookoutPlace(maze), p)
}

// Whether a point lies over the deck: inside the walled footprint, where
// no one stands but up top. `margin` grows the square (or shrinks it, if
// negative).
export function onLookout(maze: MazePlace, p: XZ, margin = 0): boolean {
  const local = worldToMaze(lookoutPlace(maze), p)
  const reach = LOOKOUT.half + margin
  return Math.abs(local.x) <= reach && Math.abs(local.z) <= reach
}

// The walls round the footprint in lookout-local metres, corner to corner,
// so the square closes with no gap, and a post at each leg's foot.
export function lookoutWalls(): { a: XZ; b: XZ; half: number }[] {
  const h = LOOKOUT.half
  const corners: XZ[] = [
    { x: -h, z: -h },
    { x: h, z: -h },
    { x: h, z: h },
    { x: -h, z: h },
  ]
  const foot = h + LOOKOUT.spread
  return [
    ...corners.map((a, i) => ({
      a,
      b: corners[(i + 1) % corners.length],
      half: LOOKOUT.wallHalf,
    })),
    ...corners.map((c) => {
      const at = { x: Math.sign(c.x) * foot, z: Math.sign(c.z) * foot }
      return { a: at, b: at, half: LOOKOUT.legHalf }
    }),
  ]
}

// Where the ladder's foot and its top are, lookout-local: the foot outside
// the -x face, the top just inside it.
export const LADDER_FOOT: XZ = { x: -LOOKOUT.half - LOOKOUT.footOut, z: 0 }
export const LADDER_TOP: XZ = { x: -LOOKOUT.half + LOOKOUT.topIn, z: 0 }

// The toolbox the torches come out of (sharedworld.ts rule 39), on the
// ground against the -x face beside the ladder's foot, lookout-local.
export const TOOLBOX_AT: XZ = { x: -LOOKOUT.half - 0.55, z: 1.5 }

// The toolbox in the world.
export function toolboxOf(maze: MazePlace): XZ {
  return lookoutToWorld(maze, TOOLBOX_AT)
}
