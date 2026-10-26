import { CONFIG } from './config.ts'
import { driveInPlace } from './drivein.ts'
import { KEEP } from './landmarks.ts'
import { mazeToWorld } from './maze.ts'
import { toWorld } from './store.ts'
import { UNDERCROFT } from './undercroft.ts'
import type { Sight } from './book.ts'
import type { MazeFrame } from './cornmaze.ts'
import type { DonutField } from './donuts.ts'
import type { XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { FuelPoint, LandmarkPoint, MazePortal } from './world.ts'

// Where each place of the Book of Shadows is found (CONFIG.book.reach):
// every Citgo, and round the spawn Citgo its stand, the wreck, the dishes,
// Bull Valley Plaza and the Undercroft under it, the industrial park behind
// it (three rings down its length), the donut field, the corn
// maze (three rings down its length, so the whole of it counts and little
// past it) and its heart, the drive-in past the maze's far end (from the
// lot's middle out past its corners), the Keep, and Castle Entropy over
// its moat.
export function bookSights(at: {
  stations: readonly FuelPoint[]
  spawn: FuelPoint | null
  maze: MazeFrame | null
  portal: Pick<MazePortal, 'at'> | null
  // Where the maze lies, for the drive-in past it, or null.
  mazePlace: MazePlace | null
  donutField: DonutField | null
  wreck: XZ | null
  dishes: readonly XZ[]
  plaza: XZ | null
  undercroft: MazePlace | null
  // The industrial park's rings (industrial.ts parkRings), none without it.
  industrial: readonly (XZ & { radius: number })[]
  landmarks: readonly LandmarkPoint[]
  // The middle of Castle Entropy's island.
  castle: XZ | null
}): Sight[] {
  const { reach } = CONFIG.book
  const sights: Sight[] = at.stations.map((station) => ({
    id: 'citgo',
    x: station.x,
    z: station.z,
    reach: reach.citgo,
  }))
  if (at.spawn) {
    const [x, , z] = toWorld(at.spawn, [
      CONFIG.stand.at.x,
      0,
      CONFIG.stand.at.z,
    ])
    sights.push({ id: 'cabbage-stand', x, z, reach: reach.stand })
  }
  if (at.wreck) sights.push({ id: 'wreck', ...at.wreck, reach: reach.wreck })
  if (at.dishes.length > 0) {
    const n = at.dishes.length
    sights.push({
      id: 'dishes',
      x: at.dishes.reduce((sum, d) => sum + d.x, 0) / n,
      z: at.dishes.reduce((sum, d) => sum + d.z, 0) / n,
      reach: reach.dishes,
    })
  }
  if (at.plaza) {
    sights.push({ id: 'strip-mall', ...at.plaza, reach: reach.plaza })
  }
  // The Undercroft: anywhere in it.
  if (at.undercroft) {
    const { across, along } = UNDERCROFT.size
    sights.push({
      id: 'undercroft',
      ...mazeToWorld(at.undercroft, { x: across / 2, z: along / 2 }),
      reach: Math.hypot(across, along) / 2,
    })
  }
  for (const ring of at.industrial) {
    sights.push({ id: 'industrial', x: ring.x, z: ring.z, reach: ring.radius })
  }
  if (at.donutField) {
    const { x, z, radius } = at.donutField
    sights.push({ id: 'donut-field', x, z, reach: radius + reach.donutField })
  }
  if (at.maze) {
    const { across, along } = CONFIG.maze.size
    for (const part of [1 / 6, 1 / 2, 5 / 6]) {
      const p = at.maze.toWorld(across / 2, along * part)
      sights.push({ id: 'corn-maze', ...p, reach: across / 2 + reach.maze })
    }
  }
  if (at.portal) {
    sights.push({ id: 'maze-heart', ...at.portal.at, reach: reach.heart })
  }
  // The drive-in stands in the maze's own frame (drivein.ts).
  if (at.mazePlace) {
    const { x, z } = driveInPlace(at.mazePlace)
    const { half } = CONFIG.driveIn
    sights.push({
      id: 'drive-in',
      x,
      z,
      reach: Math.hypot(half.x, half.z) + reach.driveIn,
    })
  }
  for (const mark of at.landmarks) {
    if (mark.n === KEEP) {
      sights.push({ id: 'keep', x: mark.x, z: mark.z, reach: reach.keep })
    }
  }
  if (at.castle) {
    sights.push({ id: 'castle', ...at.castle, reach: reach.castle })
  }
  return sights
}
