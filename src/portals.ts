// Citgo portals, pure (sharedworld.ts rule 28): the phone dials one, and it
// opens a little ahead of the raider with its twin in the ring on the lot
// of the last Citgo they stood at (citgos.ts), so anyone can step through
// to that Citgo and back, or from it out to whoever opened it. Where each
// end stands, which ring slot the Citgo end takes, which end a raider
// walked into and where they come out. sharedworld.ts runs these, and
// actions.ts walks a raider through. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { ahead } from './math.ts'
import type { Facing } from './drops.ts'
import type { XZ } from './interfaces.ts'

// One end of a portal: where its middle stands, and its turn (the rig's
// rotation.y), so its face looks along (sin yaw, cos yaw).
export interface PortalEnd extends XZ {
  yaw: number
}

export interface Portal {
  id: number
  // The raider who opened it, as they were named then; shown over it.
  name: string
  // The end opened in the valley, and its twin at Citgo `station` (an
  // index into world.fuelPoints), in ring slot `slot`.
  field: PortalEnd
  citgo: PortalEnd
  station: number
  slot: number
  // Server ms it closes.
  closes: number
}

// Which end of a portal: the one opened in the valley, or the one at the
// Citgo.
type PortalSide = 'field' | 'citgo'

type PortalConfig = typeof CONFIG.portal

// The end a raider standing at `at` opens: `ahead` metres along their line
// of sight (the camera looks along (-sin yaw, -cos yaw)), its face turned
// back to them.
export function fieldEnd(
  at: Facing,
  cfg: PortalConfig = CONFIG.portal
): PortalEnd {
  return { ...ahead(at, at.yaw, cfg.ahead), yaw: at.yaw }
}

// The Citgo end in ring slot `slot` round a lot's ring middle `ring`, its
// face turned out.
export function ringEnd(
  ring: XZ,
  slot: number,
  cfg: PortalConfig = CONFIG.portal
): PortalEnd {
  const a = (slot / cfg.slots) * Math.PI * 2
  return {
    x: ring.x + Math.sin(a) * cfg.ringRadius,
    z: ring.z + Math.cos(a) * cfg.ringRadius,
    yaw: a,
  }
}

// The first ring slot at `station` no portal in `portals` holds, or null
// when every one there is taken.
export function freeSlot(
  portals: readonly Pick<Portal, 'station' | 'slot'>[],
  station: number,
  cfg: PortalConfig = CONFIG.portal
): number | null {
  for (let slot = 0; slot < cfg.slots; slot++) {
    if (!portals.some((p) => p.station === station && p.slot === slot)) {
      return slot
    }
  }
  return null
}

// The portals still open at `now` (server ms).
export function openAt<P extends Pick<Portal, 'closes'>>(
  portals: readonly P[],
  now: number
): P[] {
  return portals.filter((p) => p.closes > now)
}

// When the next of them closes, or null with none open.
export function nextClose(
  portals: readonly Pick<Portal, 'closes'>[]
): number | null {
  let next: number | null = null
  for (const { closes } of portals) {
    if (next === null || closes < next) next = closes
  }
  return next
}

// The open portal whose end a raider at `at` has walked into, and which
// end, or null.
export function enteredAt(
  portals: readonly Portal[],
  at: XZ,
  now: number,
  cfg: PortalConfig = CONFIG.portal
): { portal: Portal; side: PortalSide } | null {
  for (const portal of openAt(portals, now)) {
    for (const side of ['field', 'citgo'] as const) {
      const end = portal[side]
      if (Math.hypot(at.x - end.x, at.z - end.z) <= cfg.radius) {
        return { portal, side }
      }
    }
  }
  return null
}

// Where a raider who walked into `side` comes out: `exit` metres in front
// of the other end's face, looking the way it faces, so they walk away
// from it and never straight back in.
export function exitFrom(
  portal: Portal,
  side: PortalSide,
  cfg: PortalConfig = CONFIG.portal
): Facing {
  const end = side === 'field' ? portal.citgo : portal.field
  return { ...ahead(end, end.yaw, -cfg.exit), yaw: end.yaw + Math.PI }
}

// What the phone says of a portal closing at `closes` at `now` (both ms):
// whole seconds left, never below 0.
export function secondsLeft(closes: number, now: number): number {
  return Math.max(0, Math.ceil((closes - now) / 1000))
}
