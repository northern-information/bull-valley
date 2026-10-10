import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { toWorld } from '../../src/store.ts'
import {
  boxWall,
  insideMall,
  mallCenter,
  mallDeck,
  mallOrigin,
  mallWalls,
  onMallGrounds,
  plazaLotMiddle,
  STRIP_MALL,
} from '../../src/stripmall.ts'
import { Walls } from '../../src/walls.ts'
import type { StoreOrigin } from '../../src/store.ts'

const station: StoreOrigin = { x: 300, z: -120, yaw: 2.4, y: 60 }
const origin = mallOrigin(station, 61)

// A raider's body, as the walls see it.
const RADIUS = CONFIG.player.radius

function built(): Walls {
  const walls = new Walls()
  for (const wall of mallWalls(origin)) walls.addWall(wall.a, wall.b, wall.half)
  return walls
}

// A mall-local point in the world.
function at(x: number, z: number) {
  const [wx, , wz] = toWorld(origin, [x, 0, z])
  return { x: wx, z: wz }
}

describe('STRIP_MALL', () => {
  it('never turns a box that blocks, so its wall stays square to it', () => {
    for (const b of STRIP_MALL.boxes) {
      if (b.blocks) expect(b.turn, b.name).toBeUndefined()
    }
  })

  it('names every box once', () => {
    const names = STRIP_MALL.boxes.map((b) => b.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps every shop inside the shell, four of them in a row', () => {
    expect(STRIP_MALL.units.map((u) => u.id)).toEqual([
      'video',
      'laundromat',
      'wok',
      'salon',
    ])
    for (const b of STRIP_MALL.boxes) {
      const [x, , z] = b.center
      expect(x, b.name).toBeGreaterThanOrEqual(-STRIP_MALL.depth - 1)
      expect(x, b.name).toBeLessThanOrEqual(STRIP_MALL.walk + 0.1)
      expect(Math.abs(z), b.name).toBeLessThanOrEqual(
        STRIP_MALL.length / 2 + 0.1
      )
    }
  })

  it('lets a raider through every open way and none of the shut ones', () => {
    const walls = built()
    for (const way of STRIP_MALL.ways) {
      const p = at(way.x, way.z)
      const out = walls.resolve(p.x, p.z, RADIUS)
      const moved = Math.hypot(out.x - p.x, out.z - p.z)
      if (way.open) expect(moved, way.name).toBeLessThan(1e-6)
      else expect(moved, way.name).toBeGreaterThan(0.05)
    }
  })

  it('boards the Golden Wok up out front, but leaves the alley and the hole', () => {
    const open = (name: string) =>
      STRIP_MALL.ways.find((way) => way.name === name)?.open
    expect(open('wok-front')).toBe(false)
    expect(open('wok-back')).toBe(true)
    expect(open('wok-hole')).toBe(true)
    // Every other shop opens out front.
    for (const id of ['video', 'laundromat', 'salon']) {
      expect(open(`${id}-front`), id).toBe(true)
    }
  })

  it('keeps the shops apart but for the hole', () => {
    const walls = built()
    // Halfway back, at each wall between two shops.
    for (const z of [-9, 9]) {
      const p = at(-7, z)
      const out = walls.resolve(p.x, p.z, RADIUS)
      expect(Math.hypot(out.x - p.x, out.z - p.z), `z ${z}`).toBeGreaterThan(
        0.05
      )
    }
  })

  it('keeps its asphalt clear of the dish array behind the Citgo', () => {
    const { rows, cols, first, spacing } = CONFIG.dishes
    const pad = 1.8
    const { at: mall } = CONFIG.stripMall
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = first - row * spacing - mall.x
        const z = (col - (cols - 1) / 2) * spacing - mall.z
        for (const piece of STRIP_MALL.asphalt) {
          const inside =
            x > piece.x[0] - pad &&
            x < piece.x[1] + pad &&
            z > piece.z[0] - pad &&
            z < piece.z[1] + pad
          expect(inside, `dish ${row},${col}`).toBe(false)
        }
      }
    }
  })

  it('runs its lot on to the Citgo lot', () => {
    // The Citgo's lot is 20 m either side of its pump island.
    expect(STRIP_MALL.lot.z1 + CONFIG.stripMall.at.z).toBe(-20)
  })
})

describe('placing the plaza', () => {
  it('stands in the station frame, turned with it, at the deck', () => {
    const [x, , z] = toWorld(station, [
      CONFIG.stripMall.at.x,
      0,
      CONFIG.stripMall.at.z,
    ])
    expect(origin.x).toBeCloseTo(x)
    expect(origin.z).toBeCloseTo(z)
    expect(origin.yaw).toBe(station.yaw)
    expect(origin.y).toBe(61)
  })

  it('stands a curb over the lot, or clear of the highest ground', () => {
    expect(mallDeck(origin, 10, () => 5)).toBeCloseTo(10.15)
    expect(mallDeck(origin, 10, () => 12)).toBeCloseTo(12.08)
    // The ground under the back corner counts.
    const back = at(-STRIP_MALL.depth, -STRIP_MALL.length / 2)
    const terrain = (x: number, z: number) =>
      Math.hypot(x - back.x, z - back.z) < 0.5 ? 20 : 0
    expect(mallDeck(origin, 10, terrain)).toBeCloseTo(20.08)
  })

  it('says what is inside, what is on its grounds, and what is not', () => {
    const inside = at(-7, 0)
    expect(insideMall(origin, inside.x, inside.z)).toBe(true)
    const walk = at(1.5, 0)
    expect(insideMall(origin, walk.x, walk.z)).toBe(false)
    expect(onMallGrounds(origin, walk.x, walk.z)).toBe(true)
    const alley = at(-STRIP_MALL.depth - 4, 0)
    expect(onMallGrounds(origin, alley.x, alley.z)).toBe(true)
    const field = at(-STRIP_MALL.depth - 20, 0)
    expect(onMallGrounds(origin, field.x, field.z)).toBe(false)
    expect(onMallGrounds(origin, field.x, field.z, 15)).toBe(true)
  })

  it('finds its middle and its lot', () => {
    const center = mallCenter(origin)
    const want = at(-STRIP_MALL.depth / 2, 0)
    expect(center.x).toBeCloseTo(want.x)
    expect(center.z).toBeCloseTo(want.z)
    const lot = plazaLotMiddle(origin)
    expect(onMallGrounds(origin, lot.x, lot.z)).toBe(true)
    expect(insideMall(origin, lot.x, lot.z)).toBe(false)
  })

  it('walls a box along its long side, covering it end to end', () => {
    const square: StoreOrigin = { x: 0, z: 0, yaw: 0, y: 0 }
    const wall = boxWall(square, { center: [2, 1, 3], size: [4, 2, 0.5] })
    expect(wall.half).toBe(0.25)
    expect(wall.a).toEqual({ x: 0.25, z: 3 })
    expect(wall.b).toEqual({ x: 3.75, z: 3 })
    const deep = boxWall(square, { center: [0, 1, 0], size: [0.2, 2, 3] })
    expect(deep.half).toBeCloseTo(0.1)
    expect(deep.a.z).toBeCloseTo(-1.4)
    expect(deep.b.z).toBeCloseTo(1.4)
  })
})
