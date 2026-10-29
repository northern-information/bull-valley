import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { buildRoadGraph } from '../../src/roadgraph.ts'
import { roadWidth } from '../../src/roadside.ts'
import {
  buildTraffic,
  carsNear,
  chooseRoutes,
  exitsOf,
  handSpots,
  isLampKind,
  isVehicleKind,
  isVehicleSpeed,
  lampBeams,
  lampsOf,
  laneOf,
  placeCar,
  pointAt,
  routeOf,
  speedsOf,
  struckBy,
  throwOf,
  travelAt,
  vehicleDamage,
} from '../../src/traffic.ts'
import type { Road } from '../../src/interfaces.ts'
import type { Car } from '../../src/traffic.ts'

const cfg = CONFIG.traffic
const METRES = { width: 1000, height: 1000 }

// A road in unit coordinates, as geo.json has them.
const road = (c: Road['c'], ...p: [number, number][]): Road => ({
  c,
  n: '',
  p,
})

// A plus of two tertiary roads crossing the survey, and a lane off one arm
// that ends short of the edge.
const PLUS = [
  road('tertiary', [0, 0.5], [0.5, 0.5], [1, 0.5]),
  road('tertiary', [0.5, 0], [0.5, 0.5], [0.5, 1]),
  road('residential', [0.75, 0.5], [0.75, 0.6]),
]

describe('laying the routes', () => {
  const graph = buildRoadGraph(PLUS, METRES)

  it('finds the ways in and out at the edge, not a dead end inside', () => {
    const exits = exitsOf(graph, METRES)
    expect(exits).toHaveLength(4)
    for (const e of exits) {
      const { x, z } = graph.nodes[e]
      expect(Math.max(Math.abs(x), Math.abs(z))).toBe(500)
    }
  })

  it('chooses routes until the bigger roads are carried', () => {
    const routes = chooseRoutes(graph, exitsOf(graph, METRES), {
      ...cfg,
      minGain: 100,
    })
    // Two straight through routes carry all of the plus.
    expect(routes).toHaveLength(2)
    for (const r of routes) {
      expect(r.share).toBe(1)
      const ends = r.edges.length
      expect(ends).toBeGreaterThan(0)
    }
    expect(
      chooseRoutes(graph, exitsOf(graph, METRES), { ...cfg, minGain: 5000 })
    ).toEqual([])
  })

  it('stretches the headway where routes share a road', () => {
    // Two roads in from the west join one trunk out to the east.
    const fork = buildRoadGraph(
      [
        road('tertiary', [0, 0.4], [0.5, 0.5]),
        road('tertiary', [0, 0.6], [0.5, 0.5]),
        road('tertiary', [0.5, 0.5], [1, 0.5]),
      ],
      METRES
    )
    const routes = chooseRoutes(fork, exitsOf(fork, METRES), {
      ...cfg,
      minGain: 1,
    })
    expect(routes).toHaveLength(2)
    expect(Math.max(...routes.map((r) => r.share))).toBeGreaterThan(1)
  })

  it('lays every route both ways, keeping right', () => {
    const traffic = buildTraffic(graph, METRES, { ...cfg, minGain: 100 })
    expect(traffic.routes).toHaveLength(4)
    // Westbound along z = 0 (the first road reversed) keeps to its right,
    // the north side (-z).
    const lane = laneOf(
      [
        { x: 10, z: 0 },
        { x: 0, z: 0 },
      ],
      ['tertiary']
    )
    // A quarter of the road's width: the middle of its right-hand lane.
    const middle = -roadWidth('tertiary') / 4
    expect(lane[0].z).toBeCloseTo(middle, 9)
    expect(lane[1].z).toBeCloseTo(middle, 9)
  })
})

describe('the speed down a lane', () => {
  it('slows for a sharp bend and eases in and out of it', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 0, z: 200 },
      { x: 10, z: 200 },
      { x: 10, z: 400 },
    ]
    const v = speedsOf(points, ['primary', 'primary', 'primary'])
    expect(v[0]).toBe(cfg.speed.primary)
    expect(v[1]).toBeLessThan(cfg.speed.primary / 2)
    expect(v[1]).toBeGreaterThanOrEqual(cfg.minSpeed)
    expect(v[2]).toBeLessThan(cfg.speed.primary / 2)
    expect(v[3]).toBe(cfg.speed.primary)
  })

  it('drives the lane by the clock, start to end', () => {
    const route = routeOf(
      [
        { x: 0, z: 0 },
        { x: 0, z: 100 },
        { x: 0, z: 300 },
      ],
      ['secondary', 'residential'],
      1
    )
    expect(travelAt(route, 0)).toEqual({ s: 0, speed: cfg.speed.secondary })
    const end = travelAt(route, route.seconds + 5)
    expect(end.s).toBeCloseTo(route.cum[route.cum.length - 1], 6)
    expect(end.speed).toBeCloseTo(cfg.speed.residential, 6)
    // Always further down the lane as time goes on.
    let last = -1
    for (let t = 0; t <= route.seconds; t += 0.5) {
      const { s } = travelAt(route, t)
      expect(s).toBeGreaterThanOrEqual(last)
      last = s
    }
    // Carried straight on past either end.
    expect(pointAt(route, -10).z).toBeCloseTo(-10, 3)
  })
})

describe('the cars', () => {
  const graph = buildRoadGraph(PLUS, METRES)
  const traffic = buildTraffic(graph, METRES, { ...cfg, minGain: 100 })
  const T = 1_800_000_000

  it('stand in the same place for everyone at the same moment', () => {
    const one = carsNear(traffic, T, { x: 0, z: 0 }, 2000)
    const two = carsNear(
      buildTraffic(graph, METRES, { ...cfg, minGain: 100 }),
      T,
      { x: 0, z: 0 },
      2000
    )
    expect(one).toEqual(two)
  })

  it('come by on every road, a few a minute', () => {
    const seen = new Set<string>()
    for (let t = T; t < T + 600; t += 0.5) {
      for (const car of carsNear(traffic, t, { x: -250, z: 0 }, 6)) {
        seen.add(car.id)
      }
    }
    // Both ways, every 60 s or so each way.
    expect(seen.size).toBeGreaterThanOrEqual(12)
    expect(seen.size).toBeLessThanOrEqual(30)
  })

  it('are worked out only near', () => {
    expect(carsNear(traffic, T, { x: 5000, z: 5000 }, 100)).toEqual([])
    for (const car of carsNear(traffic, T, { x: 0, z: 0 }, 100)) {
      expect(Math.hypot(car.x, car.z)).toBeLessThanOrEqual(100)
    }
  })

  it('pull a semi trailer behind on its kingpin', () => {
    const route = traffic.routes[0]
    const semi = placeCar(route, 's', 'semi', 1, 20)
    const car = placeCar(route, 'c', 'bmw', 1, 20)
    expect(car.trailer).toBeNull()
    expect(semi.trailer).not.toBeNull()
    const t = semi.trailer as NonNullable<Car['trailer']>
    const behind =
      semi.trailer &&
      Math.hypot(t.x - semi.x, t.z - semi.z) -
        (cfg.semi.kingpin + cfg.semi.trailer / 2 - cfg.semi.overhang)
    expect(behind).toBeCloseTo(0, 3)
  })
})

describe('a hit', () => {
  const car: Car = {
    id: 'a',
    kind: 'pickup',
    seed: 1,
    x: 0,
    z: 0,
    heading: 0,
    speed: 15,
    trailer: null,
  }

  it('lands on feet under a moving car, not beside it or a stopped one', () => {
    expect(struckBy([car], { x: 0.5, z: 2.5 }, 0.3)).toBe(car)
    expect(struckBy([car], { x: 2, z: 0 }, 0.3)).toBeNull()
    expect(struckBy([{ ...car, speed: 1 }], { x: 0, z: 0 }, 0.3)).toBeNull()
  })

  it('lands on feet a car passed over since the last frame', () => {
    const was = new Map([['a', { ...car, z: -30 }]])
    expect(struckBy([car], { x: 0, z: -15 }, 0.3, was)).toBe(car)
    // Beside its path, or behind where it was, it missed.
    expect(struckBy([car], { x: 3, z: -15 }, 0.3, was)).toBeNull()
    expect(struckBy([car], { x: 0, z: -40 }, 0.3, was)).toBeNull()
  })

  it("lands under a semi's trailer too", () => {
    const semi: Car = {
      ...car,
      kind: 'semi',
      trailer: { x: 0, z: -9, heading: 0 },
    }
    expect(struckBy([semi], { x: 0, z: -14 }, 0.3)).toBe(semi)
  })

  it('takes more the bigger and faster, never nothing', () => {
    expect(vehicleDamage('semi', 30, 100)).toBe(85)
    expect(vehicleDamage('jeep', 10, 100)).toBe(20)
    expect(vehicleDamage('jeep', 0, 100)).toBe(1)
  })

  it('throws the raider its way and off to their side', () => {
    const left = throwOf(car, { x: 0.5, z: 0 })
    expect(left.z).toBeGreaterThan(0)
    expect(left.x).toBeGreaterThan(0)
    const right = throwOf(car, { x: -0.5, z: 0 })
    expect(right.x).toBeLessThan(0)
    expect(Math.hypot(left.x, left.z)).toBeCloseTo(cfg.throwSpeed, 9)
  })
})

describe('the lamps', () => {
  it('throw headlights and taillights; a semi its taillights off the trailer', () => {
    const car: Car = {
      id: 'a',
      kind: 'semi',
      seed: 1,
      x: 0,
      z: 0,
      heading: 0,
      speed: 15,
      trailer: { x: 0, z: -9, heading: 0 },
    }
    const lamps = lampsOf(car, 1, 2)
    expect(lamps.map((l) => l.kind)).toEqual(['semi', 'trailer'])
    expect(lamps[1].y).toBe(2)
    const [head] = lampBeams(lamps[0])
    expect(head.dir.z).toBe(1)
    expect(lampBeams(lamps[0])).toHaveLength(1)
    const [tail] = lampBeams(lamps[1])
    expect(tail.dir.z).toBe(-1)
    expect(tail.origin.z).toBeCloseTo(-9 - cfg.semi.trailer / 2, 9)
    expect(lampBeams({ ...lamps[0], kind: 'bmw' })).toHaveLength(2)
  })

  it('checks what comes off the wire', () => {
    expect(isVehicleKind('jeep')).toBe(true)
    expect(isVehicleKind('trailer')).toBe(false)
    expect(isLampKind('trailer')).toBe(true)
    expect(isLampKind(3)).toBe(false)
    expect(isVehicleSpeed(12)).toBe(true)
    expect(isVehicleSpeed(-1)).toBe(false)
    expect(isVehicleSpeed(Infinity)).toBe(false)
  })
})

describe('the valley', () => {
  it('carries most of its bigger roads', () => {
    const geo = JSON.parse(
      readFileSync('public/data/bull-valley/geo.json', 'utf8')
    ) as { roads: Road[]; metres: typeof METRES }
    const graph = buildRoadGraph(geo.roads, geo.metres)
    const routes = chooseRoutes(graph, exitsOf(graph, geo.metres))
    const main = new Set<string>(cfg.main)
    const carried = new Set(routes.flatMap((r) => r.edges))
    let all = 0
    let on = 0
    graph.edges.forEach((e, i) => {
      if (!main.has(e.c)) return
      all += e.length
      if (carried.has(i)) on += e.length
    })
    expect(on / all).toBeGreaterThan(0.6)
  })
})

describe('handSpots', () => {
  const off = [
    { car: null, level: 0 },
    { car: null, level: 0 },
  ]

  it('fades the spots in on the nearest cars', () => {
    const spots = handSpots(off, ['a', 'b', 'c'], 0.3, 0.6)
    expect(spots).toEqual([
      { car: 'a', level: 0.5 },
      { car: 'b', level: 0.5 },
    ])
    expect(handSpots(spots, ['a', 'b', 'c'], 0.3, 0.6)).toEqual([
      { car: 'a', level: 1 },
      { car: 'b', level: 1 },
    ])
  })

  it('fades a spot out before handing it to a nearer car', () => {
    const lit = [
      { car: 'a', level: 1 },
      { car: 'b', level: 1 },
    ]
    // c comes nearer than b: b's spot dims, and only goes once dark.
    let spots = handSpots(lit, ['a', 'c', 'b'], 0.3, 0.6)
    expect(spots).toEqual([
      { car: 'a', level: 1 },
      { car: 'b', level: 0.5 },
    ])
    spots = handSpots(spots, ['a', 'c', 'b'], 0.3, 0.6)
    expect(spots[1]).toEqual({ car: null, level: 0 })
    spots = handSpots(spots, ['a', 'c', 'b'], 0.3, 0.6)
    expect(spots[1]).toEqual({ car: 'c', level: 0.5 })
  })

  it('keeps a spot on a car no nearer car is without', () => {
    const lit = [
      { car: 'a', level: 1 },
      { car: 'c', level: 1 },
    ]
    // c drove out of reach: its spot goes to b.
    expect(handSpots(lit, ['a', 'b'], 0.3, 0.6)).toEqual([
      { car: 'a', level: 1 },
      { car: 'b', level: 0.5 },
    ])
    expect(handSpots(lit, ['c', 'a', 'b'], 0.3, 0.6)).toEqual(lit)
  })
})
