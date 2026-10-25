import { describe, expect, it } from 'vitest'
import {
  apronOf,
  apronOutlines,
  CLUTTER_SIZE,
  clutterWall,
  crumbAt,
  floatAt,
  jerichoSpot,
  payphoneSpot,
  poleAt,
  poolReach,
  yardClutter,
  yardLamps,
  yardPoles,
} from '../../src/castleyard.ts'
import { CONFIG } from '../../src/config.ts'
import { mazeToWorld, worldToMaze } from '../../src/maze.ts'
import {
  castlePlace,
  craneSpots,
  inChannel,
  inflate,
  MOAT,
  onIsland,
  onMoatGrounds,
} from '../../src/moat.ts'
import type { XZ } from '../../src/interfaces.ts'

const station = { x: 1000, z: 500, yaw: 0.4, y: 0 }
const place = castlePlace(station)
const Y = CONFIG.castle.yard
const poles = yardPoles(place)
const clutter = yardClutter(place)
const lamps = yardLamps(place)
const phone = payphoneSpot(place)
const jericho = jerichoSpot(place)
const cranes = craneSpots(place)
const middle = { x: place.x, z: place.z }
const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z)

// Each outer side's fire escape top, in the world.
const stairTops = CONFIG.castle.stairs.sides.map((k) => {
  const a = MOAT.outer[k]
  const b = MOAT.outer[(k + 1) % MOAT.outer.length]
  return mazeToWorld(place, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 })
})

describe('the concrete round the rim', () => {
  const apron = apronOf(place)
  const spokes = apron.sides.flat()

  it('runs apron metres out to its mitred corners, never over the channel', () => {
    expect(apron.sides).toHaveLength(MOAT.outer.length)
    for (const { inner, outer } of spokes) {
      expect(inChannel(place, inner.x, inner.z)).toBe(false)
      expect(inChannel(place, outer.x, outer.z)).toBe(false)
    }
    // Each side runs from one mitred outer corner to the next.
    const corners = inflate(MOAT.outer, Y.apron).map((p) =>
      mazeToWorld(place, p)
    )
    apron.sides.forEach((side, k) => {
      expect(side[0].outer.x).toBeCloseTo(corners[k].x, 6)
      expect(side[0].outer.z).toBeCloseTo(corners[k].z, 6)
      const last = side[side.length - 1].outer
      expect(last.x).toBeCloseTo(corners[(k + 1) % corners.length].x, 6)
    })
    // Its outline for the Ground closes round each side's slab.
    const outlines = apronOutlines(apron)
    expect(outlines).toHaveLength(apron.sides.length)
    expect(outlines[0]).toHaveLength(apron.sides[0].length * 2)
  })

  it('stays inside the grounds the trees and the pickups keep off', () => {
    for (const { outer } of spokes) {
      expect(onMoatGrounds(place, outer.x, outer.z)).toBe(true)
    }
  })

  it('stops short of a road where one runs by', () => {
    // A road across one side, 12 m out from the moat's edge.
    const a = MOAT.outer[0]
    const b = MOAT.outer[1]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    let out = { x: (b.z - a.z) / len, z: -(b.x - a.x) / len }
    if (out.x * mid.x + out.z * mid.z < 0) out = { x: -out.x, z: -out.z }
    // Moat-local distance out from side 0's line.
    const beyond = (p: { x: number; z: number }) => {
      const m = worldToMaze(place, p)
      return (m.x - a.x) * out.x + (m.z - a.z) * out.z
    }
    const road = (p: { x: number; z: number }) => beyond(p) >= 12
    const cut = apronOf(place, CONFIG.castle, road)
    for (const { inner, outer } of cut.sides[0]) {
      expect(road(outer)).toBe(false)
      // Short of it, by its stopping distance and no more than a probe.
      const along = Math.hypot(outer.x - inner.x, outer.z - inner.z)
      if (along > 0) expect(beyond(outer)).toBeGreaterThan(11)
    }
    // The other sides' spokes that never meet it run out to the apron's
    // full reach.
    const whole = apron.sides[2]
    cut.sides[2].forEach((s, i) => {
      if (road(whole[i].outer)) return
      expect(s.outer.x).toBeCloseTo(whole[i].outer.x, 6)
    })
  })
})

describe('the unfinished fence', () => {
  it('stands dozens of poles round the rim, off the channel', () => {
    expect(poles.length).toBeGreaterThan(150)
    for (const pole of poles) {
      expect(inChannel(place, pole.x, pole.z)).toBe(false)
      expect(Math.hypot(pole.lean.x, pole.lean.z)).toBeCloseTo(1, 9)
    }
    // Every seed its own.
    expect(new Set(poles.map((p) => p.seed)).size).toBe(poles.length)
  })

  it('bends each in toward the island, about thirty degrees', () => {
    for (const pole of poles) {
      expect(pole.bend).toBeGreaterThanOrEqual(Y.poles.bend.min)
      expect(pole.bend).toBeLessThanOrEqual(Y.poles.bend.max)
      const top = poleAt(pole, pole.length)
      const tip = { x: pole.x + top.x, z: pole.z + top.z }
      expect(dist(tip, middle)).toBeLessThan(dist(pole, middle))
      expect(top.y).toBeGreaterThan(pole.knee)
      expect(top.y).toBeLessThan(pole.length)
    }
    // Straight up to the knee.
    const [one] = poles
    expect(poleAt(one, one.knee / 2)).toEqual({ x: 0, y: one.knee / 2, z: 0 })
  })

  it('leaves a share broken, each loose span on one straight run', () => {
    const broken = poles.filter((p) => p.piece)
    expect(broken.length).toBeGreaterThan(poles.length * 0.25)
    expect(broken.length).toBeLessThan(poles.length * 0.6)
    for (const { piece, knee, length } of broken) {
      if (!piece) continue
      expect(piece.from).toBeLessThan(piece.to)
      expect(piece.to).toBeLessThanOrEqual(length + 1e-9)
      const below = piece.to <= knee
      const above = piece.from >= knee
      expect(below || above).toBe(true)
    }
  })

  it('keeps clear of the fire escapes and the cranes', () => {
    for (const pole of poles) {
      for (const crane of cranes) {
        expect(dist(pole, crane)).toBeGreaterThan(Y.clear)
      }
      for (const top of stairTops) {
        expect(dist(pole, top)).toBeGreaterThan(Y.clear)
      }
    }
  })
})

describe('a loose span on the shared clock', () => {
  const pole = poles.find((p) => p.piece)!

  it('hangs over its break and bobs', () => {
    const lift = pole.piece!.lift
    for (let t = 0; t < 30; t += 0.7) {
      const f = floatAt(pole, t)
      expect(f.dy).toBeGreaterThanOrEqual(lift - Y.float.bob - 1e-9)
      expect(f.dy).toBeLessThanOrEqual(lift + Y.float.bob + 1e-9)
    }
  })

  it('crumbles away, stays gone, and comes back, the same for everyone', () => {
    const cfg = { ...Y.float, share: 1 }
    const seen = new Set<string>()
    for (let t = 0; t < cfg.cycle; t += 0.25) {
      const f = floatAt(pole, t, cfg)
      expect(f.whole).toBeGreaterThanOrEqual(0)
      expect(f.whole).toBeLessThanOrEqual(1)
      if (f.crumbling) seen.add('crumbling')
      else if (f.whole === 0) seen.add('gone')
      else if (f.whole < 1) seen.add('regrowing')
      else seen.add('whole')
      expect(floatAt(pole, t, cfg)).toEqual(f)
    }
    expect([...seen].sort()).toEqual([
      'crumbling',
      'gone',
      'regrowing',
      'whole',
    ])
    // Never crumbles at a share of nothing.
    const never = { ...Y.float, share: 0 }
    for (let t = 0; t < 200; t += 3) {
      expect(floatAt(pole, t, never).whole).toBe(1)
    }
  })

  it('sheds bits that fall and fade, and bursts only while it crumbles', () => {
    const steady = { ...Y.float, share: 0 }
    const bit = crumbAt(pole, 0, 10, steady)
    expect(bit).not.toBeNull()
    expect(bit!.fade).toBeGreaterThanOrEqual(0)
    expect(bit!.fade).toBeLessThan(1)
    // A burst bit never falls off a span that is not crumbling.
    for (let t = 0; t < 50; t += 1.3) {
      expect(crumbAt(pole, steady.crumbs, t, steady)).toBeNull()
    }
    const whole = { ...pole, piece: null }
    expect(crumbAt(whole, 0, 10)).toBeNull()
    // It falls: lower later in the same life.
    const life = steady.crumbLife
    const at = (t: number) => crumbAt(pole, 1, t, steady)
    const first = at(100)!
    const later = at(100 + Math.min(0.5, life * (1 - first.fade) * 0.5))!
    expect(later.y).toBeLessThan(first.y)
  })
})

describe('the supplies, the lamps and the payphone', () => {
  it('lies about the concrete behind the fence, clear of the stairs', () => {
    expect(clutter.length).toBeGreaterThan(15)
    const kinds = new Set(clutter.map((c) => c.kind))
    expect(kinds.size).toBe(Object.keys(CLUTTER_SIZE).length)
    for (const pile of clutter) {
      const wall = clutterWall(pile)
      for (const p of [wall.a, wall.b]) {
        expect(inChannel(place, p.x, p.z)).toBe(false)
        expect(onMoatGrounds(place, p.x, p.z)).toBe(true)
      }
      for (const top of stairTops) {
        expect(dist(pile, top)).toBeGreaterThan(Y.clear)
      }
      expect(dist(pile, phone)).toBeGreaterThan(3)
    }
  })

  it('stands a light tower to a side, its lamps toward the island', () => {
    expect(lamps.length).toBe(MOAT.outer.length)
    for (const lamp of lamps) {
      const ahead = {
        x: lamp.x + Math.cos(lamp.yaw) * 5,
        z: lamp.z + Math.sin(lamp.yaw) * 5,
      }
      expect(dist(ahead, middle)).toBeLessThan(dist(lamp, middle))
    }
  })

  it('stands the payphone on the concrete, its face out to the valley', () => {
    expect(inChannel(place, phone.x, phone.z)).toBe(false)
    expect(onMoatGrounds(place, phone.x, phone.z)).toBe(true)
    const ahead = {
      x: phone.x + Math.cos(phone.yaw) * 2,
      z: phone.z + Math.sin(phone.yaw) * 2,
    }
    expect(dist(ahead, middle)).toBeGreaterThan(dist(phone, middle))
  })
})

describe('Jericho, the Candlebearer', () => {
  const J = Y.jericho

  it('sits on the concrete beside the payphone, a step along from it', () => {
    expect(inChannel(place, jericho.x, jericho.z)).toBe(false)
    expect(onMoatGrounds(place, jericho.x, jericho.z)).toBe(true)
    const d = dist(jericho, phone)
    expect(d).toBeGreaterThan(Y.payphone.reach)
    expect(d).toBeLessThan(5)
  })

  it('turns toward where a raider stands at the phone', () => {
    const before = {
      x: phone.x + Math.cos(phone.yaw),
      z: phone.z + Math.sin(phone.yaw),
    }
    const ahead = {
      x: jericho.x + Math.cos(jericho.yaw) * 2,
      z: jericho.z + Math.sin(jericho.yaw) * 2,
    }
    expect(dist(ahead, before)).toBeLessThan(dist(jericho, before))
  })

  it('keeps clear of the fence, the supplies, the lamps and the stairs', () => {
    for (const pole of poles) {
      expect(dist(pole, jericho)).toBeGreaterThan(J.radius)
    }
    for (const pile of clutter) {
      const wall = clutterWall(pile)
      const reach = CLUTTER_SIZE[pile.kind].length / 2
      expect(dist(pile, jericho)).toBeGreaterThan(J.radius + 1 + reach - 1e-9)
      expect(dist(wall.a, jericho)).toBeGreaterThan(J.radius)
      expect(dist(wall.b, jericho)).toBeGreaterThan(J.radius)
    }
    for (const lamp of lamps) {
      expect(dist(lamp, jericho)).toBeGreaterThan(J.radius + 1.2)
    }
    for (const top of stairTops) {
      expect(dist(jericho, top)).toBeGreaterThan(Y.clear)
    }
    for (const crane of cranes) {
      expect(dist(jericho, crane)).toBeGreaterThan(Y.clear)
    }
  })
})

describe("the light towers' pools", () => {
  it('end at the lip, never hanging down the wall to the floor', () => {
    const radius = Y.lamps.pool
    let cut = 0
    for (const lamp of yardLamps(place)) {
      const c = {
        x: lamp.x + Math.cos(lamp.yaw) * radius * 0.55,
        z: lamp.z + Math.sin(lamp.yaw) * radius * 0.55,
      }
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
        for (const r of [radius / 2, radius]) {
          const p = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }
          const q = poolReach(place, c, p)
          expect(inChannel(place, q.x, q.z)).toBe(false)
          expect(onIsland(place, q.x, q.z)).toBe(false)
          const past = inChannel(place, p.x, p.z) || onIsland(place, p.x, p.z)
          if (!past) {
            // On the rim it is where it was.
            expect(q).toEqual(p)
            continue
          }
          cut++
          // Pulled back along its line, to just short of the edge.
          expect(Math.hypot(q.x - c.x, q.z - c.z)).toBeLessThan(r)
          const on = {
            x: q.x + ((p.x - c.x) / r) * 0.3,
            z: q.z + ((p.z - c.z) / r) * 0.3,
          }
          expect(inChannel(place, on.x, on.z)).toBe(true)
        }
      }
    }
    // Each pool did reach out past the rim, and was cut there.
    expect(cut).toBeGreaterThan(0)
  })
})
