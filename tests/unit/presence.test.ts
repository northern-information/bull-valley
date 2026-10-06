import { describe, expect, it } from 'vitest'
import {
  applyJoined,
  applyLeft,
  applyState,
  applyUpdated,
  applyWelcome,
  createPeerTable,
  peerContacts,
  poseOf,
  samplePeer,
  stateChanged,
} from '../../src/presence.ts'
import type { PeerStateWire, PeerWire } from '../../src/protocol.ts'

const at = (
  x: number,
  z: number,
  extra: Partial<PeerStateWire> = {}
): PeerStateWire => ({
  x,
  y: 0,
  z,
  yaw: 0,
  pitch: 0,
  pose: 'stand',
  riding: false,
  light: false,
  ...extra,
})

const wire = (id: string, placed = true): PeerWire => ({
  id,
  name: id.toUpperCase(),
  outfit: 'coleman',
  at: placed ? at(0, 0) : null,
})

describe('peer table', () => {
  it('replaces the roster on welcome', () => {
    const peers = createPeerTable()
    applyJoined(peers, wire('old'), 0)
    applyWelcome(peers, [wire('a'), wire('b', false)], 10)
    expect([...peers.keys()]).toEqual(['a', 'b'])
    expect(peers.get('a')?.next?.at).toBe(10)
    expect(peers.get('b')?.next).toBeNull()
  })

  it('keeps the last two states and ignores strangers', () => {
    const peers = createPeerTable()
    applyJoined(peers, wire('a', false), 0)
    expect(applyState(peers, 'nobody', at(1, 1), 5)).toBeNull()
    applyState(peers, 'a', at(1, 1), 100)
    applyState(peers, 'a', at(2, 2), 200)
    applyState(peers, 'a', at(3, 3), 300)
    const a = peers.get('a')
    expect(a?.prev?.x).toBe(2)
    expect(a?.next?.x).toBe(3)
    expect(applyLeft(peers, 'a')).toBe(true)
    expect(applyLeft(peers, 'a')).toBe(false)
  })

  it('takes a new name and character from Gron, keeping where they are', () => {
    const peers = createPeerTable()
    applyJoined(peers, wire('a', false), 0)
    applyState(peers, 'a', at(1, 1), 100)
    applyState(peers, 'a', at(2, 2), 200)
    const updated = applyUpdated(peers, {
      id: 'a',
      name: 'Renamed',
      outfit: 'church',
      at: null,
    })
    expect(updated).toMatchObject({ name: 'Renamed', outfit: 'church' })
    expect(peers.get('a')?.prev?.x).toBe(1)
    expect(peers.get('a')?.next?.x).toBe(2)
    expect(applyUpdated(peers, wire('nobody'))).toBeNull()
    expect(peers.has('nobody')).toBe(false)
  })
})

describe('samplePeer', () => {
  it('is null until placed, then holds a lone snapshot', () => {
    const peers = createPeerTable()
    const peer = applyJoined(peers, wire('a', false), 0)
    expect(samplePeer(peer, 50)).toBeNull()
    applyState(peers, 'a', at(4, 6, { yaw: 1 }), 100)
    expect(samplePeer(peer, 150)).toMatchObject({
      x: 4,
      z: 6,
      yaw: 1,
      speed: 0,
    })
  })

  it('interpolates between two snapshots and clamps outside them', () => {
    const peers = createPeerTable()
    const peer = applyJoined(peers, wire('a', false), 0)
    applyState(peers, 'a', at(0, 0, { pose: 'stand' }), 1000)
    applyState(peers, 'a', at(3, 4, { y: 2, pose: 'walk' }), 1100)
    expect(samplePeer(peer, 900)).toMatchObject({ x: 0, z: 0, y: 0, speed: 50 })
    const mid = samplePeer(peer, 1050)
    expect(mid?.x).toBeCloseTo(1.5)
    expect(mid?.z).toBeCloseTo(2)
    expect(mid?.y).toBeCloseTo(1)
    // Five metres in a tenth of a second.
    expect(mid?.speed).toBeCloseTo(50)
    expect(mid?.pose).toBe('walk')
    expect(samplePeer(peer, 1025)?.pose).toBe('stand')
    // The flashlight takes the newest frame, like riding.
    applyState(peers, 'a', at(3, 4, { light: true }), 1200)
    expect(samplePeer(peer, 1110)?.light).toBe(true)
    // Past the newest frame: hold it, and stop walking.
    expect(samplePeer(peer, 2000)).toMatchObject({ x: 3, z: 4, speed: 0 })
  })

  it('turns the short way round', () => {
    const peers = createPeerTable()
    const peer = applyJoined(peers, wire('a', false), 0)
    applyState(peers, 'a', at(0, 0, { yaw: Math.PI - 0.1 }), 0)
    applyState(peers, 'a', at(0, 0, { yaw: -Math.PI + 0.1 }), 100)
    const yaw = samplePeer(peer, 50)?.yaw ?? 0
    // Halfway between +179° and -179° is ±180°, not 0°.
    expect(Math.abs(Math.abs(yaw) - Math.PI)).toBeLessThan(1e-9)
  })
})

describe('peerContacts', () => {
  it('reports compass bearings with north up and cuts at range', () => {
    const peers = createPeerTable()
    const place = (id: string, x: number, z: number) => {
      applyJoined(peers, { ...wire(id, false) }, 0)
      applyState(peers, id, at(x, z), 0)
    }
    place('n', 0, -10) // north is -Z
    place('e', 10, 0)
    place('s', 0, 10)
    place('w', -10, 0)
    place('far', 0, -300)
    applyJoined(peers, wire('unplaced', false), 0)
    const contacts = peerContacts(peers, { x: 0, z: 0 }, 250, 0)
    expect(contacts.map((c) => Math.round(c.bearing))).toEqual([
      0, 90, 180, 270,
    ])
    expect(contacts.every((c) => c.dist === 10 && !c.hunting)).toBe(true)
  })
})

describe('wire helpers', () => {
  it('reads the pose from the body frame', () => {
    expect(poseOf(0, false)).toBe('stand')
    expect(poseOf(4, false)).toBe('walk')
    expect(poseOf(4, true)).toBe('crouch')
  })

  it('sends only what moved', () => {
    const base = at(1, 1)
    expect(stateChanged(null, base)).toBe(true)
    expect(stateChanged(base, { ...base })).toBe(false)
    expect(stateChanged(base, { ...base, x: 1.005 })).toBe(false)
    expect(stateChanged(base, { ...base, x: 1.05 })).toBe(true)
    expect(stateChanged(base, { ...base, y: 1.05 })).toBe(true)
    expect(stateChanged(base, { ...base, z: 1.05 })).toBe(true)
    expect(stateChanged(base, { ...base, yaw: 0.05 })).toBe(true)
    expect(stateChanged(base, { ...base, pose: 'crouch' })).toBe(true)
    expect(stateChanged(base, { ...base, riding: true })).toBe(true)
    expect(stateChanged(base, { ...base, light: true })).toBe(true)
    expect(stateChanged(base, { ...base, pitch: 0.05 })).toBe(true)
  })
})
