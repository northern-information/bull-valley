// The tunnel shades: the shadows that walk only the Undercroft
// (undercroft.ts), under Bull Valley Plaza. Each keeps to its own room,
// drifting slowly round where it lairs; a raider it sees (or feels very
// close) it hunts down the passages, slower than a walk, and its touch is
// a strike, as a shadowman's. One raider's beam held on one for a moment
// bursts it into mist, and it forms again in its lair later. The Warden is
// one of them, bigger and slower to burn, that never leaves the deep
// chamber where it keeps the altar.
//
// Pure, no three.js. In the Undercroft's own metres; MazePlace carries a
// raider's world position in and a shade's out, as for the Caretaker,
// whose pathing they share (caretaker.ts routeTo, clearBetween, advance).
// The valley steps them beside the shadowmen (sharedworld.ts rule 11);
// played alone, the client steps its own. Tune them in CONFIG.tunnel.

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

export type TunnelConfig = typeof CONFIG.tunnel
export type TunnelKind = 'shade' | 'warden'

export interface TunnelShade {
  // Never reused: the lairs in order, the Warden last.
  id: number
  kind: TunnelKind
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
  // Seconds until it forms again in its lair; 0 while it walks.
  gone: number
}

function fresh(id: number, kind: TunnelKind, lair: XZ): TunnelShade {
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
    gone: 0,
  }
}

// Every shade in its lair, and the Warden before the altar.
export function createTunnelShades(): TunnelShade[] {
  const shades = UNDERCROFT.lairs.map((lair, i) => fresh(i, 'shade', lair))
  shades.push(fresh(shades.length, 'warden', UNDERCROFT.warden))
  return shades
}

export interface TunnelStep {
  dt: number
  // Every raider the valley knows, in world metres.
  raiders: readonly Raider[]
  place: MazePlace
  // A dev valley's calm: no shade hunts anyone.
  calm?: boolean
}

// One that burst this step, in world metres, and the raiders whose beams
// held it.
export interface TunnelBurst extends XZ {
  kind: TunnelKind
  by: string[]
}

export interface TunnelUpdate {
  struck: string[]
  bursts: TunnelBurst[]
}

function giveUp(shade: TunnelShade): void {
  shade.target = null
  shade.lastSeen = null
  shade.forget = 0
  shade.route = []
}

// One step of every shade, dt seconds on. Mutates the shades.
export function stepTunnelShades(
  shades: TunnelShade[],
  rng: Rng,
  { dt, raiders, place, calm = false }: TunnelStep,
  cfg: TunnelConfig = CONFIG.tunnel,
  map: MazeMap = theUndercroft()
): TunnelUpdate {
  const out: TunnelUpdate = { struck: [], bursts: [] }
  const local = raiders.map((r) => ({ r, at: worldToMaze(place, r) }))
  const below = local.filter(({ at }) => inMaze(map.size, at.x, at.z))
  for (const shade of shades) {
    const tune = cfg[shade.kind]
    if (shade.gone > 0) {
      shade.gone = Math.max(0, shade.gone - dt)
      if (shade.gone === 0)
        Object.assign(shade, fresh(shade.id, shade.kind, shade.lair))
      continue
    }

    // Any one raider's beam, with nothing but air between.
    const world = mazeToWorld(place, shade)
    const holders: string[] = []
    for (const { r, at } of below) {
      if (!r.beam) continue
      const chest = { ...world, y: r.beam.floor + tune.chestHeight }
      if (inBeam(r.beam, chest) && clearBetween(map, at, shade, 0)) {
        holders.push(r.id)
      }
    }
    shade.burn =
      holders.length > 0 ? shade.burn + dt : Math.max(0, shade.burn - dt)
    if (shade.burn >= tune.burnSeconds) {
      out.bursts.push({ ...world, kind: shade.kind, by: holders })
      giveUp(shade)
      shade.burn = 0
      shade.gone = tune.respawnSeconds
      continue
    }

    // Only a raider who can be struck, in the Undercroft; the Warden only
    // one in its chamber.
    const prey = calm
      ? []
      : below.filter(
          ({ r, at }) =>
            r.vulnerable && (shade.kind !== 'warden' || inRoom(ROOMS.deep, at))
        )
    const sees = (at: XZ) => {
      const d = Math.hypot(at.x - shade.x, at.z - shade.z)
      return (
        d <= tune.senseRadius ||
        (d <= tune.sightRange && clearBetween(map, shade, at, 0))
      )
    }
    let quarry = shade.target
      ? prey.find(({ r }) => r.id === shade.target)
      : undefined
    if (shade.target && !quarry) giveUp(shade)
    if (quarry) {
      if (sees(quarry.at)) {
        shade.lastSeen = quarry.at
        shade.forget = cfg.forgetSeconds
      } else {
        shade.forget -= dt
        if (shade.forget <= 0) giveUp(shade)
        quarry = undefined
      }
    }
    if (!shade.target) {
      let best = Infinity
      for (const p of prey) {
        const d = Math.hypot(p.at.x - shade.x, p.at.z - shade.z)
        if (d < best && sees(p.at)) {
          best = d
          quarry = p
        }
      }
      if (quarry) {
        shade.target = quarry.r.id
        shade.lastSeen = quarry.at
        shade.forget = cfg.forgetSeconds
        shade.rethink = 0
        shade.route = []
      }
    }

    if (shade.target && shade.lastSeen) {
      shade.rethink -= dt
      if (clearBetween(map, shade, shade.lastSeen, cfg.clearance)) {
        shade.route = [shade.lastSeen]
      } else if (shade.rethink <= 0 || shade.route.length === 0) {
        shade.route = routeTo(map, shade, shade.lastSeen)
        shade.rethink = cfg.rethinkSeconds
      }
      advance(shade, tune.huntSpeed * dt, map, cfg.clearance)
      if (
        quarry &&
        Math.hypot(quarry.at.x - shade.x, quarry.at.z - shade.z) <
          tune.touchRadius
      ) {
        out.struck.push(quarry.r.id)
        giveUp(shade)
      }
      continue
    }

    // Drifting round its lair: to a floor cell within patrolRadius of it,
    // then another.
    if (shade.route.length === 0) {
      const near = map.cells
        .map((cell) => cellPoint(map.grid, map.size, cell))
        .filter(
          (p) =>
            Math.hypot(p.x - shade.lair.x, p.z - shade.lair.z) <=
            tune.patrolRadius
        )
      const to =
        near.length > 0 ? near[Math.floor(rng() * near.length)] : shade.lair
      shade.route = routeTo(map, shade, to)
    }
    advance(shade, tune.patrolSpeed * dt, map, cfg.clearance)
  }
  return out
}

// Where each shade walks in the world, the unmade left out.
export function tunnelShadesAt(
  shades: readonly TunnelShade[],
  place: MazePlace
): (TunnelShade & { world: XZ })[] {
  return shades
    .filter((shade) => shade.gone <= 0)
    .map((shade) => ({ ...shade, world: mazeToWorld(place, shade) }))
}
