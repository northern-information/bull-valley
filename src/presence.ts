// The other players, as data: a table of peers keyed by id, each holding
// its last two states so a figure can be drawn a little behind the present
// and glide between frames instead of teleporting ten times a second. Pure
// and Three-free; peers.ts draws it, valleysync.ts feeds it from the net frames.

import { compassBearing } from './coords.ts'
import { toCosmetics } from './cosmetics.ts'
import type { CosmeticId } from './cosmetics.ts'
import type { ScopeContact, XZ } from './interfaces.ts'
import type { OutfitId } from './outfits.ts'
import type { PeerPose, PeerStateWire, PeerWire } from './protocol.ts'

// A state stamped with the local time it arrived.
export interface PeerSnapshot extends PeerStateWire {
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
  // The two most recent states; prev is null until the second arrives, and
  // both are null until the peer is placed.
  prev: PeerSnapshot | null
  next: PeerSnapshot | null
}

// Where to draw a peer this frame. speed drives the walk cycle.
export interface PeerSample extends PeerStateWire {
  speed: number
}

export type PeerTable = Map<string, Peer>

export function createPeerTable(): PeerTable {
  return new Map()
}

// Replaces the table with the server's roster; on every welcome.
export function applyWelcome(
  peers: PeerTable,
  roster: readonly PeerWire[],
  now: number
): void {
  peers.clear()
  for (const wire of roster) applyJoined(peers, wire, now)
}

export function applyJoined(peers: PeerTable, wire: PeerWire, now: number) {
  const peer: Peer = {
    id: wire.id,
    name: wire.name,
    outfit: wire.outfit,
    cosmetics: toCosmetics(wire.cosmetics),
    level: wire.level,
    prev: null,
    next: wire.at ? { ...wire.at, at: now } : null,
  }
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
  peer.prev = peer.next
  peer.next = { ...state, at: now }
  return peer
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

// The peer's state at renderAt, a moment slightly in the past. Between two
// snapshots it interpolates; before the first or after the newest it holds,
// never extrapolating into a wall. Null until the peer is placed.
export function samplePeer(peer: Peer, renderAt: number): PeerSample | null {
  const { prev, next } = peer
  if (!next) return null
  if (!prev || next.at <= prev.at) return { ...next, speed: 0 }
  const span = next.at - prev.at
  const t = Math.min(1, Math.max(0, (renderAt - prev.at) / span))
  const dx = next.x - prev.x
  const dz = next.z - prev.z
  // Metres per second between the two frames; 0 once the newest is reached
  // and held, so a peer who stopped sending stops walking.
  const speed = t < 1 ? (Math.hypot(dx, dz) / span) * 1000 : 0
  return {
    x: prev.x + dx * t,
    y: prev.y + (next.y - prev.y) * t,
    z: prev.z + dz * t,
    yaw: lerpAngle(prev.yaw, next.yaw, t),
    pitch: prev.pitch + (next.pitch - prev.pitch) * t,
    pose: t < 0.5 ? prev.pose : next.pose,
    riding: next.riding,
    light: next.light,
    speed,
  }
}

// Every placed peer within range as a Scaduscope blip: compass bearing in
// degrees and distance in metres from origin. Peers are never hunting.
export function peerContacts(
  peers: PeerTable,
  origin: XZ,
  rangeMetres: number,
  renderAt: number
): ScopeContact[] {
  const contacts: ScopeContact[] = []
  for (const peer of peers.values()) {
    const at = samplePeer(peer, renderAt)
    if (!at) continue
    const dx = at.x - origin.x
    const dz = at.z - origin.z
    const dist = Math.hypot(dx, dz)
    if (dist > rangeMetres) continue
    contacts.push({
      dist,
      bearing: compassBearing(dx, dz),
      hunting: false,
      kind: 'raider',
    })
  }
  return contacts
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
