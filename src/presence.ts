// The other players, as data: a table of peers keyed by id, each holding
// its last few seconds of states so a figure can be drawn a little behind
// the present and glide between the two frames either side of that moment,
// instead of teleporting ten times a second. Pure and Three-free; peers.ts
// draws it, valleysync.ts feeds it from the net frames. The run of states
// is framebuffer.ts's, as the shadows' is.

import { CONFIG } from './config.ts'
import { toCosmetics } from './cosmetics.ts'
import { between, keepFrame, lerp } from './framebuffer.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { OutfitId } from './outfits.ts'
import type { PeerPose, PeerStateWire, PeerWire } from './protocol.ts'

// A state stamped with the local time it arrived.
interface PeerSnapshot extends PeerStateWire {
  at: number
}

export interface Peer {
  id: string
  name: string
  outfit: OutfitId
  // What they wear over it (cosmetics.ts).
  cosmetics: CosmeticId[]
  // Their account's level (progression.ts).
  level: number
  // Dialed in from Bull Valley Dial-Up: never placed, so never drawn.
  dialup: boolean
  // The states heard, oldest first, at most framebuffer.ts FRAMES_KEPT;
  // empty until the peer is placed.
  frames: PeerSnapshot[]
  // The newest of them, or null until the peer is placed.
  next: PeerSnapshot | null
}

// The span of one of a peer's states on the wire.
const FRAME_MS = 1000 / CONFIG.net.sendHz

// Where to draw a peer this frame. speed drives the walk cycle.
interface PeerSample extends PeerStateWire {
  speed: number
}

export type PeerTable = Map<string, Peer>

export function createPeerTable(): PeerTable {
  return new Map()
}

// Makes the table the server's roster; on every welcome. Someone already
// in it keeps the states we have of them, so our own reconnect never
// snaps anyone back.
export function applyWelcome(
  peers: PeerTable,
  roster: readonly PeerWire[],
  now: number
): void {
  const ids = new Set(roster.map((wire) => wire.id))
  for (const id of [...peers.keys()]) if (!ids.has(id)) peers.delete(id)
  for (const wire of roster) {
    const peer = applyUpdated(peers, wire)
    if (!peer) applyJoined(peers, wire, now)
    else if (!peer.next && wire.at) record(peer, { ...wire.at, at: now })
  }
}

export function applyJoined(peers: PeerTable, wire: PeerWire, now: number) {
  const peer: Peer = {
    id: wire.id,
    name: wire.name,
    outfit: wire.outfit,
    cosmetics: toCosmetics(wire.cosmetics),
    level: wire.level,
    dialup: wire.dialup === true,
    frames: [],
    next: null,
  }
  if (wire.at) record(peer, { ...wire.at, at: now })
  peers.set(wire.id, peer)
  return peer
}

// A known peer's new name or character, from Gron, a cosmetic from Moab,
// or a new level. Their place and motion stay as they were. An unknown id is ignored: we have not seen them join.
export function applyUpdated(peers: PeerTable, wire: PeerWire): Peer | null {
  const peer = peers.get(wire.id)
  if (!peer) return null
  peer.name = wire.name
  peer.outfit = wire.outfit
  peer.cosmetics = toCosmetics(wire.cosmetics)
  peer.level = wire.level
  return peer
}

// Records a state for a known peer. An unknown id is ignored: the server
// sends peer-joined first, and a late frame for someone gone means nothing.
export function applyState(
  peers: PeerTable,
  id: string,
  state: PeerStateWire,
  now: number
): Peer | null {
  const peer = peers.get(id)
  if (!peer) return null
  record(peer, { ...state, at: now })
  return peer
}

function record(peer: Peer, snapshot: PeerSnapshot): void {
  keepFrame(peer.frames, snapshot, FRAME_MS)
  peer.next = snapshot
}

export function applyLeft(peers: PeerTable, id: string): boolean {
  return peers.delete(id)
}

// The shortest turn from a to b, in radians.
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

// The peer's state at renderAt, a moment slightly in the past: between
// the two states either side of it, or held at the oldest before them all
// and at the newest past them, never extrapolating into a wall. Riding and
// the flashlight take the newest state. Null until the peer is placed.
export function samplePeer(peer: Peer, renderAt: number): PeerSample | null {
  const { next } = peer
  const at = next ? between(peer.frames, renderAt, (frame) => frame) : null
  if (!next || !at) return null
  const { from: prev, to, t } = at
  const span = to.at - prev.at
  const dx = to.x - prev.x
  const dz = to.z - prev.z
  return {
    x: lerp(prev.x, to.x, t),
    y: lerp(prev.y, to.y, t),
    z: lerp(prev.z, to.z, t),
    yaw: lerpAngle(prev.yaw, to.yaw, t),
    pitch: lerp(prev.pitch, to.pitch, t),
    pose: t < 0.5 ? prev.pose : to.pose,
    riding: next.riding,
    light: next.light,
    // Metres per second between the two states.
    speed: span > 0 ? (Math.hypot(dx, dz) / span) * 1000 : 0,
  }
}

// The pose a local player's frame reads as on the wire.
export function poseOf(speed: number, crouching: boolean): PeerPose {
  if (crouching) return 'crouch'
  return speed > 0.3 ? 'walk' : 'stand'
}

// Whether a state differs enough from the last one sent to be worth a
// frame. Positions move a few millimetres a frame while easing to a stop;
// a centimetre and half a degree are below what a figure shows.
export function stateChanged(
  last: PeerStateWire | null,
  next: PeerStateWire
): boolean {
  if (!last) return true
  return (
    Math.abs(last.x - next.x) > 0.01 ||
    Math.abs(last.y - next.y) > 0.01 ||
    Math.abs(last.z - next.z) > 0.01 ||
    Math.abs(last.yaw - next.yaw) > 0.01 ||
    Math.abs(last.pitch - next.pitch) > 0.01 ||
    last.pose !== next.pose ||
    last.riding !== next.riding ||
    last.light !== next.light
  )
}
