// The Undercroft's foes: the shadows that walk only the Undercroft
// (undercroft.ts), under Bull Valley Plaza. Each keeps to its own room,
// drifting slowly round where it lairs; a raider it sees (or feels very
// close) it hunts down the passages, slower than a walk, and its touch is
// a strike, as a shadowman's. One raider's beam held on one for a moment
// bursts it into mist, and it forms again in its lair later. The Warden is
// one of them, bigger, that never leaves the deep chamber where it keeps
// the altar but roams the whole of it through the broken walls, and takes
// several hits (CONFIG.tunnel.warden.hits): each beam held long enough
// throws it into the dark, and it forms again somewhere else in the ruins,
// away from every raider, until the last hit bursts it.
//
// Pure, no three.js. In the Undercroft's own metres; MazePlace carries a
// raider's world position in and a foe's out, as for the Caretaker,
// whose pathing they share (caretaker.ts routeTo, clearBetween, advance).
// The valley steps them beside the shadowmen (sharedworld.ts rule 11), and
// undercroftfoesrig.ts draws them. Tune them in CONFIG.tunnel.

import { advance, clearBetween, routeTo } from './caretaker.ts'
import { CONFIG } from './config.ts'
import { cellPoint, inMaze, mazeToWorld, worldToMaze } from './maze.ts'
import { inBeam } from './shadowmen.ts'
import { inRoom, ROOMS, theUndercroft, UNDERCROFT } from './undercroft.ts'
import type { MazeMap } from './caretaker.ts'
import type { XZ } from './interfaces.ts'
import type { MazePlace } from './maze.ts'
import type { Rng } from './rng.ts'
import type { Raider } from './shadowmen.ts'

type TunnelConfig = typeof CONFIG.tunnel
export type FoeKind = 'rat' | 'warden'

export interface UndercroftFoe {
  // Never reused: the lairs in order, the Warden last.
  id: number
  kind: FoeKind
  // Where it keeps to and forms again, in the Undercroft's metres.
  lair: XZ
  x: number
  z: number
  route: XZ[]
  // The raider it hunts, where it last saw them, the seconds left before
  // it gives them up, and before it works out its way again.
  target: string | null
  lastSeen: XZ | null
  forget: number
  rethink: number
  // Seconds held in a beam, running back down outside one.
  burn: number
  // Hits taken (each a beam held burnSeconds), kept until it bursts.
  wounds: number
  // Seconds until it forms again where a hit threw it; 0 while it walks.
  blink: number
  // Seconds until it forms again in its lair; 0 while it walks.
  gone: number
}

function fresh(id: number, kind: FoeKind, lair: XZ): UndercroftFoe {
  return {
    id,
    kind,
    lair,
    x: lair.x,
    z: lair.z,
    route: [],
    target: null,
    lastSeen: null,
    forget: 0,
    rethink: 0,
    burn: 0,
    wounds: 0,
    blink: 0,
    gone: 0,
  }
}

// Every foe in its lair, and the Warden before the altar.
export function createUndercroftFoes(): UndercroftFoe[] {
  const foes = UNDERCROFT.lairs.map((lair, i) => fresh(i, 'rat', lair))
  foes.push(fresh(foes.length, 'warden', UNDERCROFT.warden))
  return foes
}

interface TunnelStep {
  dt: number
  // Every raider the valley knows, in world metres.
  raiders: readonly Raider[]
  place: MazePlace
  // A dev valley's calm: no foe hunts anyone.
  calm?: boolean
}

// One that burst this step, in world metres, and the raiders whose beams
// held it.
export interface FoeBurst extends XZ {
  kind: FoeKind
  by: string[]
}

export interface FoeUpdate {
  struck: string[]
  // What touched each raider struck.
  strikers: Record<string, FoeKind>
  bursts: FoeBurst[]
  // Where one took a hit and went into the dark, standing yet, in world
  // metres.
  wounds: (XZ & { kind: FoeKind })[]
}

function giveUp(foe: UndercroftFoe): void {
  foe.target = null
  foe.lastSeen = null
  foe.forget = 0
  foe.route = []
}

// One step of every foe, dt seconds on. Mutates the foes.
export function stepUndercroftFoes(
  foes: UndercroftFoe[],
  rng: Rng,
  { dt, raiders, place, calm = false }: TunnelStep,
  cfg: TunnelConfig = CONFIG.tunnel,
  map: MazeMap = theUndercroft()
): FoeUpdate {
  const out: FoeUpdate = {
    struck: [],
    strikers: {},
    bursts: [],
    wounds: [],
  }
  const local = raiders.map((r) => ({ r, at: worldToMaze(place, r) }))
  const below = local.filter(({ at }) => inMaze(map.size, at.x, at.z))
  for (const foe of foes) {
    const tune = cfg[foe.kind]
    if (foe.gone > 0) {
      foe.gone = Math.max(0, foe.gone - dt)
      if (foe.gone === 0) Object.assign(foe, fresh(foe.id, foe.kind, foe.lair))
      continue
    }
    if (foe.blink > 0) {
      foe.blink = Math.max(0, foe.blink - dt)
      continue
    }

    // Any one raider's beam, with nothing but air between.
    const world = mazeToWorld(place, foe)
    const holders: string[] = []
    for (const { r, at } of below) {
      if (!r.beam) continue
      const chest = { ...world, y: r.beam.floor + tune.chestHeight }
      if (inBeam(r.beam, chest) && clearBetween(map, at, foe, 0)) {
        holders.push(r.id)
      }
    }
    foe.burn = holders.length > 0 ? foe.burn + dt : Math.max(0, foe.burn - dt)
    if (foe.burn >= tune.burnSeconds) {
      giveUp(foe)
      foe.burn = 0
      foe.wounds += 1
      if (foe.wounds < tune.hits) {
        // A hit it stands: into the dark, to form again elsewhere.
        out.wounds.push({ ...world, kind: foe.kind })
        const to = blinkSpot(
          foe,
          below,
          map,
          rng,
          tune.blinkFrom,
          tune.patrolRadius
        )
        foe.x = to.x
        foe.z = to.z
        foe.blink = tune.blinkSeconds
        continue
      }
      out.bursts.push({ ...world, kind: foe.kind, by: holders })
      foe.gone = tune.respawnSeconds
      continue
    }

    // Only a raider who can be struck, in the Undercroft; the Warden only
    // one in its chamber.
    const prey = calm
      ? []
      : below.filter(
          ({ r, at }) =>
            r.vulnerable && (foe.kind !== 'warden' || inRoom(ROOMS.deep, at))
        )
    const sees = (at: XZ) => {
      const d = Math.hypot(at.x - foe.x, at.z - foe.z)
      return (
        d <= tune.senseRadius ||
        (d <= tune.sightRange && clearBetween(map, foe, at, 0))
      )
    }
    let quarry = foe.target
      ? prey.find(({ r }) => r.id === foe.target)
      : undefined
    if (foe.target && !quarry) giveUp(foe)
    if (quarry) {
      if (sees(quarry.at)) {
        foe.lastSeen = quarry.at
        foe.forget = cfg.forgetSeconds
      } else {
        foe.forget -= dt
        if (foe.forget <= 0) giveUp(foe)
        quarry = undefined
      }
    }
    if (!foe.target) {
      let best = Infinity
      for (const p of prey) {
        const d = Math.hypot(p.at.x - foe.x, p.at.z - foe.z)
        if (d < best && sees(p.at)) {
          best = d
          quarry = p
        }
      }
      if (quarry) {
        foe.target = quarry.r.id
        foe.lastSeen = quarry.at
        foe.forget = cfg.forgetSeconds
        foe.rethink = 0
        foe.route = []
      }
    }

    if (foe.target && foe.lastSeen) {
      foe.rethink -= dt
      if (clearBetween(map, foe, foe.lastSeen, cfg.clearance)) {
        foe.route = [foe.lastSeen]
      } else if (foe.rethink <= 0 || foe.route.length === 0) {
        foe.route = routeTo(map, foe, foe.lastSeen)
        foe.rethink = cfg.rethinkSeconds
      }
      advance(foe, tune.huntSpeed * dt, map, cfg.clearance)
      if (
        quarry &&
        Math.hypot(quarry.at.x - foe.x, quarry.at.z - foe.z) < tune.touchRadius
      ) {
        out.struck.push(quarry.r.id)
        out.strikers[quarry.r.id] = foe.kind
        giveUp(foe)
      }
      continue
    }

    // Drifting round its lair: to a floor cell within patrolRadius of it,
    // then another.
    if (foe.route.length === 0) {
      const near = roomCells(foe, map, tune.patrolRadius)
      const to =
        near.length > 0 ? near[Math.floor(rng() * near.length)] : foe.lair
      foe.route = routeTo(map, foe, to)
    }
    advance(foe, tune.patrolSpeed * dt, map, cfg.clearance)
  }
  return out
}

// The floor a foe keeps to: the Warden its chamber, any other the
// floor within `radius` of its lair.
function roomCells(foe: UndercroftFoe, map: MazeMap, radius: number): XZ[] {
  const cells = map.cells.map((cell) => cellPoint(map.grid, map.size, cell))
  return foe.kind === 'warden'
    ? cells.filter((p) => inRoom(ROOMS.deep, p))
    : cells.filter(
        (p) => Math.hypot(p.x - foe.lair.x, p.z - foe.lair.z) <= radius
      )
}

// Where a hit throws a foe: a floor cell of its room at least `from`
// metres from every raider down here, or, with none so far, the furthest.
function blinkSpot(
  foe: UndercroftFoe,
  below: readonly { at: XZ }[],
  map: MazeMap,
  rng: Rng,
  from: number,
  radius: number
): XZ {
  const cells = roomCells(foe, map, radius)
  const nearest = (p: XZ) =>
    below.reduce(
      (d, { at }) => Math.min(d, Math.hypot(at.x - p.x, at.z - p.z)),
      Infinity
    )
  const far = cells.filter((p) => nearest(p) >= from)
  if (far.length > 0) return far[Math.floor(rng() * far.length)]
  let best: XZ = foe.lair
  let bestD = -1
  for (const p of cells) {
    const d = nearest(p)
    if (d > bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

// Where each foe walks in the world, the burned and the thrown left out.
export function undercroftFoesAt(
  foes: readonly UndercroftFoe[],
  place: MazePlace
): (UndercroftFoe & { world: XZ })[] {
  return foes
    .filter((foe) => foe.gone <= 0 && foe.blink <= 0)
    .map((foe) => ({ ...foe, world: mazeToWorld(place, foe) }))
}
