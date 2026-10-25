import * as THREE from 'three'
import { buildCastle, buildCrane, buildMoat } from './assets.ts'
import { castleOf } from './castle.ts'
import {
  apronOf,
  apronOutlines,
  clutterWall,
  jerichoSpot,
  payphoneSpot,
  yardClutter,
  yardLamps,
  yardPoles,
} from './castleyard.ts'
import { buildYard } from './castleyardmodel.ts'
import { CONFIG } from './config.ts'
import { pointInPolygon } from './coords.ts'
import { dayKey } from './daily.ts'
import { buildJericho } from './jerichomodel.ts'
import { mazeToWorld } from './maze.ts'
import {
  catchPipe,
  craneSpots,
  fireEscapes,
  inChannel,
  MOAT,
  moatEdges,
  moatPipes,
  moatWalls,
  pipeDecks,
  pipeWalls,
  trickle,
} from './moat.ts'
import { MOAT_STATION, moatSlurmsAt } from './moatslurms.ts'
import { buildSlurm } from './slurmmodel.ts'
import { treads, underfoot } from './slurms.ts'
import type { CastleRig, CraneRig, MoatRig } from './assets.ts'
import type { YardSpot } from './castleyard.ts'
import type { Ground } from './ground.ts'
import type { HeightAt, XZ } from './interfaces.ts'
import type { JerichoRig } from './jerichomodel.ts'
import type { MazePlace } from './maze.ts'
import type { CastlePlace, FireEscape, MoatPipe } from './moat.ts'
import type { MoatSlurm, MoatSource } from './moatslurms.ts'
import type { Cue } from './sfx.ts'
import type { CrawlingSlurm } from './slurmrig.ts'
import type { Feet } from './slurms.ts'
import type { Walls } from './walls.ts'

// Castle Entropy placed (moat.ts, castle.ts): the moat already cut into the
// terrain (world.ts carves it before anything stands), its fire escapes
// registered on the Ground flight by flight and their rails, the rim's
// ledge, the island's edge and the pipes on the Walls (the pipes' tops on
// the Ground too), the moat drawn, the concrete poured round the rim (on
// the Ground) and the works on it (castleyard.ts: the bent poles, the
// supplies, the light towers, the payphone and Jericho, the Candlebearer
// beside it, each on the Walls), the
// cranes on the rim, the slurms dropping off the edges and the cranes' hooks into
// the channel (moatslurms.ts), and today's castle floating over the
// island, made anew when the day turns.

export interface CastleSite {
  group: THREE.Group
  place: MazePlace
  floor: number
  // The two edges in the world, for the terrain's hole.
  island: XZ[]
  outer: XZ[]
  // The middle of the island, for the Book of Shadows.
  middle: XZ
  // The fire escapes, as the Ground has them, and the pipes.
  stairs: FireEscape[]
  pipes: MoatPipe[]
  // Where a raider falling at (x, z) from `from` to `to` this frame, in a
  // fall begun at `start`, lands on a pipe, or null (moat.ts catchPipe).
  catchAt: (
    x: number,
    z: number,
    from: number,
    to: number,
    start: number
  ) => (XZ & { y: number }) | null
  // The payphone on the rim (castleyard.ts payphoneSpot).
  payphone: YardSpot
  // Jericho, the Candlebearer, sat beside it (castleyard.ts
  // jerichoSpot): where he sits, and his rig, the body for the glow.
  jericho: YardSpot
  jerichoRig: JerichoRig
  // `t` the shared clock in seconds, `day` its Central day: the castle
  // bobs and its beams turn wherever the raider is; the moat, the cranes
  // and the slurms move only `near` it, squashed under any of `feet`
  // (slurms.ts `treads`), and the frame's sounds come back. A new day
  // builds a new castle.
  update(t: number, day: string, near: boolean, feet: readonly Feet[]): Cue[]
  // Today's castle.
  day(): string
  // The moat's slurms as the last frame drew them.
  slurms(): readonly MoatSlurm[]
  // Those down on the floor a jar could catch (sharedworld.ts rule 36),
  // by MOAT_STATION, and one caught, gone from the floor for good.
  crawlingSlurms(): CrawlingSlurm[]
  jarSlurm(slot: number, index: number): void
}

export function buildCastleSite(
  place: CastlePlace,
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
  // The pipes along the walls, round the fire escapes: what they stop,
  // and their tops to walk along.
  const pipes = moatPipes(raw, place, floor, stairs)
  for (const wall of pipes.flatMap((pipe) => pipeWalls(pipe))) {
    walls.addWall(wall.a, wall.b, wall.half, wall.band)
  }
  const decks = pipes.flatMap(pipeDecks)
  for (const deck of decks) {
    ground.addRibbon([deck.a, deck.b], deck.width, 0)
  }

  const moat: MoatRig = buildMoat({
    ...edges,
    raw,
    floor,
    stairs,
    pipes,
    trickle: trickle(place),
    middle: place,
  })
  group.add(moat.group)

  // The concrete round the rim, stopped short of whatever the ground
  // already carries there (a road and its shoulder), then the works on it.
  const yardCfg = CONFIG.castle.yard
  const apron = apronOf(
    place,
    CONFIG.castle,
    (p) => ground.surfaceAt(p.x, p.z) !== null
  )
  for (const outline of apronOutlines(apron)) {
    ground.addArea(outline, yardCfg.lift)
  }
  const poles = yardPoles(place)
  for (const pole of poles) walls.addWall(pole, pole, yardCfg.poles.radius)
  const clutter = yardClutter(place)
  for (const pile of clutter) {
    const wall = clutterWall(pile)
    walls.addWall(wall.a, wall.b, wall.half)
  }
  const lamps = yardLamps(place)
  for (const lamp of lamps) walls.addWall(lamp, lamp, 1.2)
  const payphone = payphoneSpot(place)
  walls.addWall(payphone, payphone, 0.4)
  const yard = buildYard({
    apron,
    poles,
    clutter,
    lamps,
    payphone,
    raw,
    lift: yardCfg.lift,
    at: ground.at,
    place,
  })
  group.add(yard.group)
  const jericho = jerichoSpot(place)
  walls.addWall(jericho, jericho, yardCfg.jericho.radius)
  // His space is turned by his yaw about where he sits: the ground under
  // a point of it, for his owl's dive, is the world's there.
  const jerichoY = ground.at(jericho.x, jericho.z)
  const jerichoRig = buildJericho((x, z) => {
    const c = Math.cos(jericho.yaw)
    const s = Math.sin(jericho.yaw)
    return (
      ground.at(jericho.x + x * c - z * s, jericho.z + x * s + z * c) - jerichoY
    )
  })
  jerichoRig.group.position.set(jericho.x, jerichoY, jericho.z)
  jerichoRig.group.rotation.y = -jericho.yaw
  group.add(jerichoRig.group)

  const cranes: CraneRig[] = craneSpots(place).map((spot) => {
    const crane = buildCrane(spot.seed, spot.reach)
    crane.group.position.set(spot.x, ground.at(spot.x, spot.z), spot.z)
    crane.group.rotation.y = -spot.yaw
    group.add(crane.group)
    walls.addWall(spot, spot, 2.4)
    return crane
  })

  // Where the slurms drop from: just inside the channel every few metres
  // under the rim and the island's edge (crawling off from the wall, and
  // never where a fire escape would catch them), then the cranes' hooks.
  const sources: MoatSource[] = []
  // Under a fire escape's strip (whatever pipes run over the floor).
  const underStair = (x: number, z: number) =>
    stairs.some(({ ends: [a, b], inward, depth }) => {
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const t = ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / len
      const s = (x - a.x) * inward.x + (z - a.z) * inward.z
      return t > -1 && t < len + 1 && s > -1 && s < depth + 1
    })
  for (const edge of [edges.outer, edges.island]) {
    edge.forEach((a, i) => {
      const b = edge[(i + 1) % edge.length]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      const along = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
      for (let d = 2.5; d < len - 2; d += 5) {
        const on = { x: a.x + along.x * d, z: a.z + along.z * d }
        for (const side of [1, -1]) {
          const heading = { x: -along.z * side, z: along.x * side }
          const x = on.x + heading.x * 0.6
          const z = on.z + heading.z * 0.6
          if (!inChannel(place, x, z) || underStair(x, z)) continue
          sources.push({ x, y: raw(on.x, on.z), z, heading })
        }
      }
    })
  }
  group.updateMatrixWorld(true)
  const hooks = cranes
    .map((crane) => crane.hook.getWorldPosition(new THREE.Vector3()))
    .filter((p) => inChannel(place, p.x, p.z))
  for (const p of hooks) {
    sources.push({ x: p.x, y: p.y - 0.4, z: p.z, heading: null })
  }
  const slurms = Array.from({ length: CONFIG.slurms.moat.pool }, () => {
    const rig = buildSlurm()
    rig.group.visible = false
    group.add(rig.group)
    return rig
  })
  // When each was trodden on, by its key; forgotten once it is gone.
  const trodden = new Map<string, number>()
  // Those caught in a jar, by key; forgotten once they would have melted.
  const jarred = new Set<string>()
  let crawling: CrawlingSlurm[] = []
  // What each looked like last frame, to hear it land.
  let phases = new Map<string, string>()
  let drawn: MoatSlurm[] = []
  // They fall past the pipes to the floor, and crawl on it.
  const landY = (x: number, z: number) =>
    ground.standAt(x, z, floor, CONFIG.fall.climb)

  const stepSlurms = (t: number, feet: readonly Feet[]): Cue[] => {
    const cues: Cue[] = []
    const seen = new Map<string, string>()
    drawn = []
    crawling = []
    const all = moatSlurmsAt(sources, hooks.length, t, landY)
    for (const key of jarred) {
      if (!all.some((slurm) => slurm.key === key)) jarred.delete(key)
    }
    const now = all.filter((slurm) => !jarred.has(slurm.key))
    slurms.forEach((rig, i) => {
      let slurm = now[i]
      rig.group.visible = slurm !== undefined
      if (!slurm) return
      if (slurm.phase === 'crawling' && !trodden.has(slurm.key)) {
        if (treads(slurm, feet)) {
          trodden.set(slurm.key, t)
          cues.push({ id: 'slurm-squish', x: slurm.x, z: slurm.z, rate: 1 })
        }
      }
      const stepped = trodden.get(slurm.key)
      if (stepped !== undefined) {
        slurm = { ...slurm, ...underfoot(slurm, t - stepped) }
      }
      rig.group.visible = slurm.phase !== 'gone'
      if (phases.get(slurm.key) === 'falling' && slurm.phase === 'crawling') {
        cues.push({ id: 'slurm-plop', x: slurm.x, z: slurm.z, rate: 1 })
      }
      seen.set(slurm.key, slurm.phase)
      drawn.push(slurm)
      if (slurm.phase === 'crawling') {
        crawling.push({
          station: MOAT_STATION,
          slot: slurm.slot,
          index: slurm.index,
          x: slurm.x,
          z: slurm.z,
          object: rig.group,
        })
      }
      rig.group.position.set(slurm.x, slurm.y, slurm.z)
      rig.group.rotation.set(
        slurm.phase === 'falling' ? slurm.progress * 5 : 0,
        slurm.yaw,
        0
      )
      rig.pose({
        stretch: slurm.stretch,
        tooth: slurm.tooth,
        splat: slurm.phase === 'squashed' ? slurm.progress : null,
      })
    })
    for (const key of trodden.keys()) {
      if (!seen.has(key)) trodden.delete(key)
    }
    phases = seen
    return cues
  }

  // The castle's base floats over the highest ground on the island, its
  // middle and its edge both.
  const ring = MOAT.island.map((p) => [p.x, p.z] as [number, number])
  const xs = MOAT.island.map((p) => p.x)
  const zs = MOAT.island.map((p) => p.z)
  let top = -Infinity
  for (const p of MOAT.island) {
    const w = mazeToWorld(place, p)
    top = Math.max(top, raw(w.x, w.z))
  }
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 3) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += 3) {
      if (!pointInPolygon(x, z, ring)) continue
      const w = mazeToWorld(place, { x, z })
      top = Math.max(top, raw(w.x, w.z))
    }
  }
  const holder = new THREE.Group()
  holder.position.set(place.x, top + CONFIG.castle.float, place.z)
  holder.rotation.y = -place.yaw
  group.add(holder)
  let today = dayKey(Date.now())
  let castle: CastleRig = buildCastle(castleOf(today))
  holder.add(castle.group)

  const update = (
    t: number,
    day: string,
    near: boolean,
    feet: readonly Feet[]
  ): Cue[] => {
    if (day !== today) {
      holder.remove(castle.group)
      castle.dispose()
      today = day
      castle = buildCastle(castleOf(today))
      holder.add(castle.group)
    }
    castle.update(t)
    if (!near) {
      for (const rig of slurms) rig.group.visible = false
      drawn = []
      crawling = []
      return []
    }
    moat.update(t)
    yard.update(t)
    jerichoRig.update(t)
    for (const crane of cranes) crane.update(t)
    return stepSlurms(t, feet)
  }

  return {
    group,
    place,
    floor,
    island: edges.island,
    outer: edges.outer,
    middle: { x: place.x, z: place.z },
    stairs,
    pipes,
    catchAt: (x, z, from, to, start) =>
      inChannel(place, x, z)
        ? catchPipe(decks, { x, z }, from, to, start)
        : null,
    payphone,
    jericho,
    jerichoRig,
    update,
    day: () => today,
    slurms: () => drawn,
    crawlingSlurms: () => crawling,
    jarSlurm(slot, index) {
      jarred.add(`${slot}:${index}`)
    },
  }
}
