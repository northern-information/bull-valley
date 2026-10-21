import { describe, expect, it } from 'vitest'
import { FRAMES_KEPT } from '../../src/framebuffer.ts'
import {
  applyJoined,
  applyLeft,
  applyState,
  applyUpdated,
  applyWelcome,
  createPeerTable,
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
  level: 1,
  cosmetics: [],
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

  it('keeps what it has of anyone still there on a welcome', () => {
    const peers = createPeerTable()
    applyJoined(peers, wire('a', false), 0)
    applyState(peers, 'a', at(1, 1), 100)
    applyState(peers, 'a', at(2, 2), 200)
    applyWelcome(peers, [{ ...wire('a'), level: 3 }], 300)
    expect(peers.get('a')?.frames.map((f) => f.x)).toEqual([1, 2])
    expect(peers.get('a')?.level).toBe(3)
  })

  it('keeps the latest states and ignores strangers', () => {
    const peers = createPeerTable()
    applyJoined(peers, wire('a', false), 0)
    expect(applyState(peers, 'nobody', at(1, 1), 5)).toBeNull()
    applyState(peers, 'a', at(1, 1), 100)
    applyState(peers, 'a', at(2, 2), 200)
    applyState(peers, 'a', at(3, 3), 300)
    const a = peers.get('a')
    expect(a?.frames.map((f) => f.x)).toEqual([1, 2, 3])
    expect(a?.next?.x).toBe(3)
    for (let i = 0; i < FRAMES_KEPT + 5; i++) {
      applyState(peers, 'a', at(i, 0), 400 + i * 100)
    }
    expect(a?.frames).toHaveLength(FRAMES_KEPT)
    expect(a?.next?.x).toBe(FRAMES_KEPT + 4)
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
      level: 4,
      cosmetics: ['flaming-halo'],
      at: null,
    })
    expect(updated).toMatchObject({
      name: 'Renamed',
      outfit: 'church',
      level: 4,
      cosmetics: ['flaming-halo'],
    })
    expect(peers.get('a')?.frames.map((f) => f.x)).toEqual([1, 2])
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
    // Before the first: held there, standing.
    expect(samplePeer(peer, 900)).toMatchObject({ x: 0, z: 0, y: 0, speed: 0 })
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

  it('draws between the two states either side of the moment', () => {
    const peers = createPeerTable()
    const peer = applyJoined(peers, wire('a', false), 0)
    applyState(peers, 'a', at(0, 0), 1000)
    applyState(peers, 'a', at(1, 0), 1100)
    // Drawn 150 ms behind: just before the third state lands, and just
    // after, the drawing goes on from where it was, never back.
    const before = samplePeer(peer, 1199 - 150)?.x ?? NaN
    applyState(peers, 'a', at(2, 0), 1200)
    const after = samplePeer(peer, 1201 - 150)?.x ?? NaN
    expect(before).toBeCloseTo(0.49)
    expect(after).toBeCloseTo(0.51)
  })

  it('starts a move after a silence a frame before it, not across it', () => {
    const peers = createPeerTable()
    const peer = applyJoined(peers, wire('a', false), 0)
    applyState(peers, 'a', at(0, 0), 1000)
    // Stood still for five seconds, then stepped.
    applyState(peers, 'a', at(1, 0), 6000)
    expect(samplePeer(peer, 5800)).toMatchObject({ x: 0, speed: 0 })
    expect(samplePeer(peer, 5950)?.x).toBeCloseTo(0.5)
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

  it('turns the short way round the other way too', () => {
    const peers = createPeerTable()
    const peer = applyJoined(peers, wire('a', false), 0)
    applyState(peers, 'a', at(0, 0, { yaw: -Math.PI + 0.1 }), 0)
    applyState(peers, 'a', at(0, 0, { yaw: Math.PI - 0.1 }), 100)
    // A quarter of the 0.2 rad turn backwards across the seam, not
    // forwards through 0.
    const yaw = samplePeer(peer, 25)?.yaw ?? 0
    expect(yaw).toBeCloseTo(-Math.PI + 0.05, 9)
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
