import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  enteredAt,
  exitFrom,
  fieldEnd,
  freeSlot,
  nextClose,
  openAt,
  ringEnd,
  secondsLeft,
} from '../../src/portals.ts'
import type { Portal } from '../../src/portals.ts'

const CFG = CONFIG.portal
const RING = { x: 10, z: -20 }

const portal = (id: number, slot = 0, closes = 1000, station = 0): Portal => ({
  id,
  name: `R${id}`,
  field: fieldEnd({ x: 300, z: 400, yaw: Math.PI / 2 }),
  citgo: ringEnd(RING, slot),
  station,
  slot,
  closes,
})

describe('where a Citgo portal opens', () => {
  it('opens ahead along the line of sight, its face turned back', () => {
    // yaw 0 looks down -z.
    const ahead = fieldEnd({ x: 0, z: 0, yaw: 0 })
    expect(ahead.x).toBeCloseTo(0, 9)
    expect(ahead.z).toBeCloseTo(-CFG.ahead, 9)
    // Its face looks along (sin yaw, cos yaw): back at the raider.
    expect(Math.cos(ahead.yaw)).toBeCloseTo(1, 9)
    // yaw pi/2 looks down -x.
    const west = fieldEnd({ x: 0, z: 0, yaw: Math.PI / 2 })
    expect(west.x).toBeCloseTo(-CFG.ahead, 9)
    expect(west.z).toBeCloseTo(0, 9)
  })

  it('stands each Citgo end round the lot ring, facing out', () => {
    for (let slot = 0; slot < CFG.slots; slot++) {
      const end = ringEnd(RING, slot)
      const out = { x: end.x - RING.x, z: end.z - RING.z }
      expect(Math.hypot(out.x, out.z)).toBeCloseTo(CFG.ringRadius, 9)
      expect(Math.sin(end.yaw) * CFG.ringRadius).toBeCloseTo(out.x, 9)
      expect(Math.cos(end.yaw) * CFG.ringRadius).toBeCloseTo(out.z, 9)
    }
  })

  it('takes the first slot free at its Citgo, or none', () => {
    expect(freeSlot([], 0)).toBe(0)
    const taken = [
      { station: 0, slot: 0 },
      { station: 0, slot: 2 },
      { station: 1, slot: 1 },
    ]
    expect(freeSlot(taken, 0)).toBe(1)
    // Another Citgo's slots are its own.
    expect(freeSlot(taken, 1)).toBe(0)
    const all = Array.from({ length: CFG.slots }, (_, slot) => ({
      station: 3,
      slot,
    }))
    expect(freeSlot(all, 3)).toBeNull()
  })
})

describe('when portals close', () => {
  it('keeps the ones still open, and says when the next goes', () => {
    const portals = [portal(0, 0, 500), portal(1, 1, 900)]
    expect(openAt(portals, 499).map((p) => p.id)).toEqual([0, 1])
    expect(openAt(portals, 500).map((p) => p.id)).toEqual([1])
    expect(nextClose(portals)).toBe(500)
    expect(nextClose([])).toBeNull()
  })

  it('counts whole seconds down, never below none', () => {
    expect(secondsLeft(10_000, 0)).toBe(10)
    expect(secondsLeft(10_000, 9_001)).toBe(1)
    expect(secondsLeft(10_000, 12_000)).toBe(0)
  })
})

describe('walking through', () => {
  it('takes a raider in at either end of an open portal', () => {
    const p = portal(0, 2)
    expect(enteredAt([p], p.field, 0)).toEqual({ portal: p, side: 'field' })
    expect(enteredAt([p], p.citgo, 0)).toEqual({ portal: p, side: 'citgo' })
    const beside = { x: p.citgo.x + CFG.radius + 0.01, z: p.citgo.z }
    expect(enteredAt([p], beside, 0)).toBeNull()
    // Closed, it takes no one.
    expect(enteredAt([p], p.field, p.closes)).toBeNull()
  })

  it('lets them out in front of the other end, walking away from it', () => {
    const p = portal(0, 1)
    for (const side of ['field', 'citgo'] as const) {
      const out = exitFrom(p, side)
      const end = side === 'field' ? p.citgo : p.field
      expect(Math.hypot(out.x - end.x, out.z - end.z)).toBeCloseTo(CFG.exit, 9)
      // The camera looks along (-sin yaw, -cos yaw): out along the face.
      expect(-Math.sin(out.yaw)).toBeCloseTo(Math.sin(end.yaw), 9)
      expect(-Math.cos(out.yaw)).toBeCloseTo(Math.cos(end.yaw), 9)
      // Clear of both ends, so nothing takes them straight back.
      expect(enteredAt([p], out, 0)).toBeNull()
    }
  })

  it('never lets a raider out at a Citgo into another end of its ring', () => {
    const ring = Array.from({ length: CFG.slots }, (_, slot) =>
      portal(slot, slot)
    )
    for (const p of ring) {
      expect(enteredAt(ring, exitFrom(p, 'field'), 0)).toBeNull()
    }
  })
})
