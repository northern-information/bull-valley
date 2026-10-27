// Pure: the fog wall across the deep chamber's one door (undercroft.ts),
// as Dark Souls hangs one before a boss. While the Warden stands it fills
// the door from the ossuary: no one walks through it, but E at it carries
// a raider into the chamber, and from the inside it lets no one out until
// the Warden bursts. Once it has burst the fog is gone, and it comes back
// when the Warden forms again.
//
// Nothing here is kept: whether the Warden stands is read off the
// valley's frames as they land (wardenStands), and which side a raider is
// on off where they stand. In the Undercroft's own metres, as
// undercroft.ts: x down the grid's rows, z along its columns. No
// three.js, no DOM.

import { inRoom, ROOMS, UNDERCROFT } from './undercroft.ts'
import type { XZ } from './interfaces.ts'
import type { FoeKind } from './undercroftfoes.ts'

// The deep chamber's door, from the ossuary below it: the grid cell the
// fog stands in.
export const FOG_DOOR = { row: 9, col: 23 } as const

// How far past the fog E carries a raider.
const THROUGH = 1.6

const { cell, wall } = UNDERCROFT

// The fog's line across the door, face to face of the stone either side,
// and how tall it stands.
export const FOG_WALL = {
  a: { x: FOG_DOOR.row * cell, z: (FOG_DOOR.col - 1) * cell + wall / 2 },
  b: { x: FOG_DOOR.row * cell, z: (FOG_DOOR.col + 1) * cell - wall / 2 },
  height: UNDERCROFT.height,
  half: 0.2,
} as const

// The fog as a gate on the walls (walls.ts addGate).
export const FOG_GATE = 'fog-wall'

export function isFogGate(gate: string): boolean {
  return gate === FOG_GATE
}

// The gate stands, for everyone on either side, while the Warden does.
export function fogOpen(standing: boolean): boolean {
  return !standing
}

const MID = {
  x: FOG_WALL.a.x,
  z: (FOG_WALL.a.z + FOG_WALL.b.z) / 2,
}

// Where E is offered: just out from the fog on the ossuary's side (so the
// fog never stands between the eye and it), and where it carries a raider,
// into the chamber, facing on in toward `face`.
export const FOG_SPOT: XZ = { x: MID.x + 0.4, z: MID.z }
export const FOG_IN = {
  x: MID.x - THROUGH,
  z: MID.z,
  face: { x: MID.x - THROUGH - 1, z: MID.z },
} as const

// Whether a point is in the deep chamber or its doorway, the fog's inner
// side.
export function inChamber(p: XZ): boolean {
  return inRoom(ROOMS.deep, p, cell) && p.x < MID.x
}

// What a frame of the valley's says of the Undercroft's foes.
interface TunnelFrame {
  tunnel: readonly { kind: FoeKind }[]
  tunnelBursts: readonly { kind: FoeKind }[]
}

// Whether the Warden stands after a frame, given whether it did: it does
// once a frame shows it, and stops when a frame says it burst. Thrown into
// the dark by a hit, it is in no frame for a moment and stands yet.
export function wardenStands(was: boolean, frame: TunnelFrame): boolean {
  if (frame.tunnelBursts.some((b) => b.kind === 'warden')) return false
  if (frame.tunnel.some((s) => s.kind === 'warden')) return true
  return was
}
