import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { surveyedStations } from '../../src/citgos.ts'
import { CONFIG } from '../../src/config.ts'
import { pointSegmentDistance, unitToWorld } from '../../src/coords.ts'
import {
  buildingBoxes,
  buildingDeck,
  buildingLoot,
  buildingLurks,
  buildingOrigin,
  buildingSigns,
  CAR,
  inBuilding,
  INDUSTRIAL,
  LOOT_INSET,
  onParkGrounds,
  PARK_SIGN,
  parkLoot,
  parkLurks,
  parkMiddle,
  parkOrigin,
  parkRings,
  parkToWorld,
  propBoxes,
  propSigns,
  TRAILER,
  waysOf,
  worksWalls,
} from '../../src/industrial.ts'
import { ITEMS } from '../../src/items.ts'
import { roadWidth } from '../../src/roadside.ts'
import { dishSpotsOf } from '../../src/spawnlot.ts'
import { chooseSpawnStation, stationFacing } from '../../src/stations.ts'
import { toLocal, toWorld } from '../../src/store.ts'
import { mallOrigin, onMallGrounds, STRIP_MALL } from '../../src/stripmall.ts'
import type { Building, WorksBox } from '../../src/industrial.ts'
import type { Geo, XZ } from '../../src/interfaces.ts'
import type { FuelPoint } from '../../src/world.ts'

// The industrial park stands behind Bull Valley Plaza, past its alley: on
// no road, no water and none of the dish array; every building has a way
// in, and every pickup and lurk in it is a walk from outside.

const geo = JSON.parse(
  readFileSync('public/data/bull-valley/geo.json', 'utf8')
) as Geo
const { metres } = geo
const stations: FuelPoint[] = surveyedStations(geo.fuel).map((f) => {
  const { x, z, yaw } = stationFacing(
    geo.roads,
    metres,
    unitToWorld(f.p[0], f.p[1], metres)
  )
  return { x, z, yaw, y: 0, name: f.n }
})
const spawn = chooseSpawnStation(geo, metres, stations)
if (!spawn) throw new Error('No spawn station in the survey')
const park = parkOrigin(spawn)
const { pad } = INDUSTRIAL

// Whether a world point lies within `margin` of the asphalt.
const onPad = (p: XZ, margin: number) => onParkGrounds(park, p.x, p.z, margin)

// The player's body, for the walls (CONFIG.player.radius).
const BODY = CONFIG.player.radius

// A box's footprint, building-local, grown by `grow`.
function rect(b: WorksBox, grow = 0) {
  const [cx, , cz] = b.center
  const [sx, , sz] = b.size
  return {
    x0: cx - sx / 2 - grow,
    x1: cx + sx / 2 + grow,
    z0: cz - sz / 2 - grow,
    z1: cz + sz / 2 + grow,
  }
}

// Every cell a body may stand in round and through building `b`, flooded
// from outside it: the cells reached.
function reachable(b: Building) {
  const step = 0.2
  const reach = 3
  const x0 = -b.w / 2 - reach
  const z0 = -b.d / 2 - reach
  const nx = Math.ceil((b.w + reach * 2) / step)
  const nz = Math.ceil((b.d + reach * 2) / step)
  const blocked = new Uint8Array(nx * nz)
  for (const box of buildingBoxes(b).filter((one) => one.blocks)) {
    const r = rect(box, BODY)
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * step
      if (x < r.x0 || x > r.x1) continue
      for (let j = 0; j < nz; j++) {
        const z = z0 + (j + 0.5) * step
        if (z >= r.z0 && z <= r.z1) blocked[j * nx + i] = 1
      }
    }
  }
  const seen = new Uint8Array(nx * nz)
  const queue = [0]
  seen[0] = 1
  while (queue.length > 0) {
    const k = queue.pop() as number
    const i = k % nx
    const j = Math.floor(k / nx)
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di
      const c = j + dj
      if (a < 0 || c < 0 || a >= nx || c >= nz) continue
      const n = c * nx + a
      if (seen[n] || blocked[n]) continue
      seen[n] = 1
      queue.push(n)
    }
  }
  return (p: XZ) => {
    const i = Math.floor((p.x - x0) / step)
    const j = Math.floor((p.z - z0) / step)
    return seen[j * nx + i] === 1
  }
}

describe("the industrial park's place in the survey", () => {
  it('lies behind the plaza, its asphalt meeting the alley behind the Golden Wok', () => {
    const mall = mallOrigin(spawn, 0)
    // The alley's back edge, behind the Golden Wok (the third unit).
    const wok = STRIP_MALL.units.findIndex((u) => u.id === 'wok')
    const behind = {
      x: -STRIP_MALL.depth - 8,
      z: -STRIP_MALL.length / 2 + (wok + 0.5) * STRIP_MALL.unitWidth,
    }
    const edge = parkToWorld(mall, behind)
    // The park's own edge is there, and a few metres back is its asphalt.
    expect(toLocal(park, edge.x, edge.z).x).toBeCloseTo(0)
    const back = parkToWorld(mall, { x: behind.x - 4, z: behind.z })
    expect(onPad(back, 0)).toBe(true)
    // And none of the plaza's own building stands on it.
    for (const [x, z] of [
      [0, -STRIP_MALL.length / 2],
      [0, STRIP_MALL.length / 2],
      [-STRIP_MALL.depth, -STRIP_MALL.length / 2],
      [-STRIP_MALL.depth, STRIP_MALL.length / 2],
    ]) {
      expect(onPad(parkToWorld(mall, { x, z }), 0)).toBe(false)
    }
  })

  it('keeps every road off its asphalt, with room to spare', () => {
    const shoulder = 1.8
    const middle = parkMiddle(park)
    for (const road of geo.roads) {
      const half = roadWidth(road.c) / 2 + shoulder
      const points = road.p.map(([u, v]) => unitToWorld(u, v, metres))
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]
        const b = points[i + 1]
        // Far off, it is clear; near, look along it.
        const d = pointSegmentDistance(middle.x, middle.z, a.x, a.z, b.x, b.z)
        if (d - half > middle.radius + 20) continue
        for (let t = 0; t <= 1; t += 0.02) {
          const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
          expect(onPad(p, half + 10), road.n).toBe(false)
        }
      }
    }
  })

  it('swallows no water', () => {
    const middle = parkMiddle(park)
    for (const water of geo.water) {
      const points = water.p.map(([u, v]) => unitToWorld(u, v, metres))
      for (const p of points) expect(onPad(p, 10), water.n).toBe(false)
      // And no stretch of it between its points, looked along near by.
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]
        const b = points[i + 1]
        const d = pointSegmentDistance(middle.x, middle.z, a.x, a.z, b.x, b.z)
        if (d > middle.radius + 20) continue
        for (let t = 0; t <= 1; t += 0.05) {
          const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
          expect(onPad(p, 5), water.n).toBe(false)
        }
      }
    }
  })

  it('stays clear of the dish array behind the Citgo', () => {
    for (const dish of dishSpotsOf(spawn)) {
      expect(onPad(dish, CONFIG.dishes.treeClear + 4)).toBe(false)
    }
  })

  it('reaches the plaza grounds only along the alley it adjoins', () => {
    const mall = mallOrigin(spawn, 0)
    for (const [i, b] of INDUSTRIAL.buildings.entries()) {
      const o = buildingOrigin(park, i, 0)
      for (const [x, z] of [
        [-b.w / 2, -b.d / 2],
        [b.w / 2, -b.d / 2],
        [-b.w / 2, b.d / 2],
        [b.w / 2, b.d / 2],
      ]) {
        const [wx, , wz] = toWorld(o, [x, 0, z])
        const w = { x: wx, z: wz }
        expect(onMallGrounds(mall, w.x, w.z, 4), b.id).toBe(false)
      }
    }
  })
})

describe('the industrial park', () => {
  it('stands a dozen buildings on its asphalt, none touching another', () => {
    expect(INDUSTRIAL.buildings).toHaveLength(12)
    const ids = new Set(INDUSTRIAL.buildings.map((b) => b.id))
    expect(ids.size).toBe(12)
    const boxes = INDUSTRIAL.buildings.map((b, i) => {
      const p = INDUSTRIAL.places[i]
      return {
        x0: p.x - b.w / 2,
        x1: p.x + b.w / 2,
        z0: p.z - b.d / 2,
        z1: p.z + b.d / 2,
      }
    })
    for (const [i, a] of boxes.entries()) {
      expect(a.x0).toBeGreaterThan(pad.x0 + 4)
      expect(a.x1).toBeLessThan(pad.x1 - 4)
      expect(a.z0).toBeGreaterThan(pad.z0 + 14)
      expect(a.z1).toBeLessThan(pad.z1 - 14)
      for (const b of boxes.slice(i + 1)) {
        const apart =
          a.x1 + 12 < b.x0 ||
          b.x1 + 12 < a.x0 ||
          a.z1 + 12 < b.z0 ||
          b.z1 + 12 < a.z0
        expect(apart).toBe(true)
      }
    }
  })

  it('gives every building a way in, and bays out back', () => {
    for (const b of INDUSTRIAL.buildings) {
      const ways = waysOf(b)
      expect(
        ways.some((w) => w.open),
        b.id
      ).toBe(true)
      expect(b.bays.length, b.id).toBeGreaterThanOrEqual(2)
      expect(ways.filter((w) => w.name.startsWith('bay-'))).toHaveLength(
        b.bays.length
      )
    }
  })

  it('reaches every pickup and every lurk on foot from outside', () => {
    for (const b of INDUSTRIAL.buildings) {
      const can = reachable(b)
      for (const spot of [...buildingLoot(b), ...buildingLurks(b)]) {
        expect(
          can(spot),
          `${b.id} (${spot.x.toFixed(1)}, ${spot.z.toFixed(1)})`
        ).toBe(true)
      }
      // And in through every open way.
      for (const way of waysOf(b).filter((w) => w.open)) {
        expect(can(way), `${b.id} ${way.name}`).toBe(true)
      }
    }
  })

  it('leaves a dead forklift in every building, in nothing else', () => {
    for (const b of INDUSTRIAL.buildings) {
      const boxes = buildingBoxes(b)
      const bodies = boxes.filter((one) => /^forklift-.*-body$/.test(one.name))
      expect(bodies.length, b.id).toBe(b.bays.length >= 3 ? 2 : 1)
      const others = boxes.filter(
        (one) => one.blocks && !one.name.startsWith('forklift-')
      )
      for (const body of bodies) {
        const r = rect(body)
        // Inside the walls, with the forks too.
        expect(Math.abs(body.center[0]) + body.size[0] / 2).toBeLessThan(
          b.w / 2 - 1
        )
        expect(Math.abs(body.center[2]) + body.size[2] / 2).toBeLessThan(
          b.d / 2 - 1
        )
        for (const other of others) {
          const o = rect(other)
          const apart =
            r.x1 <= o.x0 || o.x1 <= r.x0 || r.z1 <= o.z0 || o.z1 <= r.z0
          expect(apart, `${b.id} ${body.name} and ${other.name}`).toBe(true)
        }
        // Clear of every pickup and lurk.
        for (const spot of [...buildingLoot(b), ...buildingLurks(b)]) {
          const inside =
            spot.x > r.x0 - 1 &&
            spot.x < r.x1 + 1 &&
            spot.z > r.z0 - 1 &&
            spot.z < r.z1 + 1
          expect(inside, `${b.id} ${body.name}`).toBe(false)
        }
      }
    }
  })

  it('leaves its pickups inside, out of reach through the walls', () => {
    for (const b of INDUSTRIAL.buildings) {
      for (const spot of buildingLoot(b)) {
        expect(Math.abs(spot.x), b.id).toBeLessThanOrEqual(
          b.w / 2 - LOOT_INSET + 0.01
        )
        expect(Math.abs(spot.z), b.id).toBeLessThanOrEqual(
          b.d / 2 - LOOT_INSET + 0.01
        )
        expect(
          ITEMS.some((item) => item.id === spot.kind) ||
            ['quarters', 'twenty', 'dimes'].includes(spot.kind)
        ).toBe(true)
      }
    }
  })

  it('lays every pickup and every lurk in the world inside its building', () => {
    const loot = parkLoot(park)
    expect(loot).toHaveLength(
      INDUSTRIAL.buildings.reduce((n, b) => n + b.loot.length, 0)
    )
    const lurks = parkLurks(park)
    expect(lurks).toHaveLength(INDUSTRIAL.buildings.length * 3)
    for (const p of [...loot, ...lurks]) {
      expect(
        INDUSTRIAL.buildings.some((_, i) => inBuilding(park, i, p.x, p.z))
      ).toBe(true)
    }
    // One bar of gold, in a cold room, for whoever finds it first.
    expect(loot.filter((l) => l.kind === 'gold-bullion')).toHaveLength(1)
  })

  it('keeps the props on the asphalt, off the buildings and each other', () => {
    const covers = INDUSTRIAL.props.map((prop) => {
      const size =
        prop.kind === 'trailer'
          ? TRAILER
          : prop.kind === 'car'
            ? CAR
            : { width: 2, length: 2 }
      const reach = Math.max(size.width, size.length) / 2
      return { prop, reach }
    })
    for (const { prop, reach } of covers) {
      expect(prop.x - reach).toBeGreaterThan(pad.x0)
      expect(prop.x + reach).toBeLessThan(pad.x1)
      expect(prop.z - reach).toBeGreaterThan(pad.z0)
      expect(prop.z + reach).toBeLessThan(pad.z1)
      INDUSTRIAL.buildings.forEach((b, i) => {
        const p = INDUSTRIAL.places[i]
        // Its long side along its own z (yaw near 0 or pi for all).
        const along =
          prop.kind === 'trailer'
            ? TRAILER.length / 2
            : prop.kind === 'car'
              ? CAR.length / 2
              : 1
        const across =
          prop.kind === 'trailer'
            ? TRAILER.width / 2
            : prop.kind === 'car'
              ? CAR.width / 2
              : 1
        const clear =
          prop.x + across <= p.x - b.w / 2 ||
          prop.x - across >= p.x + b.w / 2 ||
          prop.z + along <= p.z - b.d / 2 ||
          prop.z - along >= p.z + b.d / 2
        expect(clear, `${prop.kind} at ${b.id}`).toBe(true)
      })
    }
    // A trailer stands only at a bay that is shut: none blocks a way in.
    for (const prop of INDUSTRIAL.props.filter((p) => p.kind === 'trailer')) {
      expect(propBoxes(prop).length).toBeGreaterThan(0)
      // The building it backs onto: the nearest in its column in front of it.
      let i = -1
      INDUSTRIAL.places.forEach((p, k) => {
        if (Math.abs(prop.x - p.x) >= INDUSTRIAL.buildings[k].w / 2) return
        if (p.z < prop.z) return
        if (i < 0 || p.z < INDUSTRIAL.places[i].z) i = k
      })
      const b = INDUSTRIAL.buildings[i]
      const p = INDUSTRIAL.places[i]
      const bay = waysOf(b).find(
        (w) => w.name.startsWith('bay-') && Math.abs(p.x + w.x - prop.x) < 0.01
      )
      expect(bay?.open).toBe(false)
    }
  })

  it('stands its sign out front, where the alley from the plaza comes in', () => {
    const signs = INDUSTRIAL.props.filter((p) => p.kind === 'sign')
    expect(signs).toHaveLength(1)
    const [sign] = signs
    // At the asphalt's edge toward the plaza, a lamp's reach from the
    // nearest lamp, and read on both faces.
    expect(sign.x).toBeGreaterThan(-PARK_SIGN.length)
    for (const lamp of INDUSTRIAL.lamps) {
      expect(Math.hypot(lamp.x - sign.x, lamp.z - sign.z)).toBeGreaterThan(5)
    }
    const faces = propSigns(sign)
    expect(faces.map((f) => f.art)).toEqual(['park-sign', 'park-sign'])
    expect(propBoxes(sign).length).toBeGreaterThan(0)
    // Its face, turned by its yaw, looks out toward the plaza (+x) and
    // up the alley (+z) at once.
    const out = { x: Math.cos(sign.yaw), z: -Math.sin(sign.yaw) }
    expect(out.x).toBeGreaterThan(0.5)
    expect(out.z).toBeGreaterThan(0.5)
    // Nothing else is painted.
    for (const prop of INDUSTRIAL.props.filter((p) => p.kind !== 'sign')) {
      expect(propSigns(prop)).toEqual([])
    }
  })

  it('stands its lamps on the drives, clear of the buildings', () => {
    expect(INDUSTRIAL.lamps.length).toBeGreaterThanOrEqual(24)
    for (const lamp of INDUSTRIAL.lamps) {
      expect(lamp.x).toBeGreaterThan(pad.x0)
      expect(lamp.x).toBeLessThan(pad.x1)
      INDUSTRIAL.buildings.forEach((b, i) => {
        const p = INDUSTRIAL.places[i]
        const dx = Math.max(0, Math.abs(lamp.x - p.x) - b.w / 2)
        const dz = Math.max(0, Math.abs(lamp.z - p.z) - b.d / 2)
        expect(Math.hypot(dx, dz)).toBeGreaterThan(3)
      })
      for (const prop of INDUSTRIAL.props) {
        const reach = prop.kind === 'trailer' ? TRAILER.length / 2 : 3
        expect(Math.hypot(lamp.x - prop.x, lamp.z - prop.z)).toBeGreaterThan(
          Math.min(reach, 3)
        )
      }
    }
  })

  it('puts up walls only from boxes that stand square', () => {
    for (const [i, b] of INDUSTRIAL.buildings.entries()) {
      const boxes = buildingBoxes(b)
      expect(boxes.filter((one) => one.blocks && one.turn)).toEqual([])
      const walls = worksWalls(buildingOrigin(park, i, 0), b)
      expect(walls.length).toBe(boxes.filter((one) => one.blocks).length)
      // A sign for the building, one for each bay.
      const signs = buildingSigns(b)
      expect(signs.filter((s) => s.art === b.sign)).toHaveLength(1)
      expect(signs.filter((s) => s.art.startsWith('bay-'))).toHaveLength(
        b.bays.length
      )
    }
  })

  it('stands each floor a curb over the lot, or clear of the ground under it', () => {
    const b = INDUSTRIAL.buildings[0]
    const o = buildingOrigin(park, 0, 0)
    expect(buildingDeck(o, b, 10, () => 9)).toBeCloseTo(10.15)
    expect(buildingDeck(o, b, 10, () => 12)).toBeCloseTo(12.08)
  })

  it('rings the park for the lair and the Book of Shadows', () => {
    const middle = parkMiddle(park)
    const local = toLocal(park, middle.x, middle.z)
    expect(local.x).toBeCloseTo((pad.x0 + pad.x1) / 2)
    expect(local.z).toBeCloseTo((pad.z0 + pad.z1) / 2)
    const rings = parkRings(park)
    expect(rings).toHaveLength(3)
    // The first ring keeps off the plaza's building.
    const mall = mallOrigin(spawn, 0)
    const first = rings[0]
    const front = toLocal(mall, first.x, first.z)
    expect(Math.hypot(front.x + STRIP_MALL.depth / 2, front.z)).toBeGreaterThan(
      first.radius
    )
    // Each a point on the asphalt.
    for (const ring of rings) expect(onPad(ring, 0)).toBe(true)
  })
})
