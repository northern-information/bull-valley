import * as THREE from 'three'
import { buildCastle, buildCrane, buildMoat } from './assets.ts'
import { castleOf } from './castle.ts'
import { CONFIG } from './config.ts'
import { dayKey } from './daily.ts'
import { mazeToWorld } from './maze.ts'
import {
  craneSpots,
  fireEscapes,
  MOAT,
  moatEdges,
  moatWalls,
  trickle,
} from './moat.ts'
import type { CastleRig, CraneRig, MoatRig } from './assets.ts'
import type { Ground } from './ground.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { FireEscape } from './moat.ts'
import type { Walls } from './walls.ts'

// Castle Entropy placed (moat.ts, castle.ts): the moat already cut into the
// terrain (world.ts carves it before anything stands), its fire escapes
// registered on the Ground flight by flight and their rails, the rim's
// ledge and the island's edge on the Walls, the moat drawn, the cranes on
// the rim, and today's castle floating over the island, made anew when the
// day turns.

export interface CastleSite {
  group: THREE.Group
  place: MazePlace
  floor: number
  // The two edges in the world, for the terrain's hole.
  island: XZ[]
  outer: XZ[]
  // The middle of the island, for the Book of Shadows.
  middle: XZ
  // The fire escapes, as the Ground has them.
  stairs: FireEscape[]
  // `t` the shared clock in seconds, `day` its Central day: the castle
  // bobs and its beams turn wherever the raider is; the moat and the
  // cranes move only `near` it. A new day builds a new castle.
  update(t: number, day: string, near: boolean): void
  // Today's castle.
  day(): string
}

export function buildCastleSite(
  place: MazePlace,
  raw: HeightAt,
  floor: number,
  ground: Ground,
  walls: Walls
): CastleSite {
  const group = new THREE.Group()
  group.name = 'castle-site'
  const edges = moatEdges(place)

  // The fire escapes, flight over flight, and their rails.
  const stairs = fireEscapes(raw, place, floor)
  for (const stair of stairs) {
    for (const flight of stair.flights) {
      ground.addRibbon([flight.a, flight.b], stair.width, 0)
    }
    for (const l of stair.landings) {
      ground.addFloor(l.x, l.z, l.cos, l.sin, l.x0, l.x1, l.halfWidth, l.y)
    }
    for (const rail of stair.rails) {
      walls.addWall(rail.a, rail.b, rail.half, rail.band)
    }
  }
  // The rim's ledge, for the channel alone, and the island's edge.
  for (const wall of moatWalls(raw, place)) {
    walls.addWall(wall.a, wall.b, wall.half, wall.band)
  }

  const moat: MoatRig = buildMoat({
    ...edges,
    raw,
    floor,
    stairs,
    trickle: trickle(place),
    middle: place,
  })
  group.add(moat.group)

  const cranes: CraneRig[] = craneSpots(place).map((spot) => {
    const crane = buildCrane(spot.seed, spot.reach)
    crane.group.position.set(spot.x, ground.at(spot.x, spot.z), spot.z)
    crane.group.rotation.y = -spot.yaw
    group.add(crane.group)
    walls.addWall(spot, spot, 2.4)
    return crane
  })

  // The castle's base floats over the highest of the island's edge.
  const top = Math.max(
    ...MOAT.island.map((p) => {
      const w = mazeToWorld(place, p)
      return raw(w.x, w.z)
    })
  )
  const holder = new THREE.Group()
  holder.position.set(place.x, top + CONFIG.castle.float, place.z)
  holder.rotation.y = -place.yaw
  group.add(holder)
  let today = dayKey(Date.now())
  let castle: CastleRig = buildCastle(castleOf(today))
  holder.add(castle.group)

  const update = (t: number, day: string, near: boolean) => {
    if (day !== today) {
      holder.remove(castle.group)
      castle.dispose()
      today = day
      castle = buildCastle(castleOf(today))
      holder.add(castle.group)
    }
    castle.update(t)
    if (!near) return
    moat.update(t)
    for (const crane of cranes) crane.update(t)
  }

  return {
    group,
    place,
    floor,
    island: edges.island,
    outer: edges.outer,
    middle: { x: place.x, z: place.z },
    stairs,
    update,
    day: () => today,
  }
}
