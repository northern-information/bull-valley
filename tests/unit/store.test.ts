import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { ITEMS } from '../../src/items.ts'
import {
  facingInView,
  formatCash,
  freshStock,
  insideStore,
  STORE_LAYOUT,
  storeBase,
  storeCenter,
  storeWalls,
  toLocal,
  toWorld,
  worldFacings,
} from '../../src/store.ts'
import type { Vec3 } from '../../src/interfaces.ts'
import type { StoreOrigin, WorldFacing } from '../../src/store.ts'

const origin: StoreOrigin = { x: 100, z: -40, yaw: 0.7, y: 12 }

describe('STORE_LAYOUT', () => {
  it('shelves every item once, three units each', () => {
    const kinds = STORE_LAYOUT.facings.map((f) => f.kind)
    expect(new Set(kinds).size).toBe(ITEMS.length)
    expect(kinds).toHaveLength(ITEMS.length)
    for (const facing of STORE_LAYOUT.facings) {
      expect(facing.slots).toHaveLength(CONFIG.store.perItem)
    }
  })

  it('keeps every unit inside the walls', () => {
    for (const facing of STORE_LAYOUT.facings) {
      for (const [x, , z] of facing.slots) {
        expect(x).toBeGreaterThan(STORE_LAYOUT.back)
        expect(x).toBeLessThan(STORE_LAYOUT.front)
        expect(Math.abs(z)).toBeLessThan(STORE_LAYOUT.halfWidth)
      }
    }
  })

  it('glazes the front wall either side of the door', () => {
    const panes = STORE_LAYOUT.boxes.filter((b) => b.finish === 'glass')
    expect(panes).toHaveLength(2)
    for (const pane of panes) {
      const [x, y, z] = pane.center
      const [, sy, sz] = pane.size
      // In the front wall, off the floor, under the roof, clear of the door
      // and the corner.
      expect(pane.blocks).toBe(true)
      expect(Math.abs(x - STORE_LAYOUT.front)).toBeLessThan(0.2)
      expect(y - sy / 2).toBeGreaterThan(STORE_LAYOUT.floor)
      expect(y + sy / 2).toBeLessThan(STORE_LAYOUT.height)
      expect(Math.abs(z) - sz / 2).toBeGreaterThan(STORE_LAYOUT.doorWidth / 2)
      expect(Math.abs(z) + sz / 2).toBeLessThan(STORE_LAYOUT.halfWidth)
    }
    // Nothing dark stands in front of the back wall any more.
    expect(STORE_LAYOUT.boxes.find((b) => b.name === 'shelf-back')).toBe(
      undefined
    )
  })

  it('hangs the lights flush under the ceiling, inside the walls', () => {
    const lights = STORE_LAYOUT.boxes.filter((b) => b.finish === 'light')
    expect(lights).toHaveLength(4)
    for (const light of lights) {
      const [x, y, z] = light.center
      const [sx, sy, sz] = light.size
      expect(light.blocks).toBe(false)
      expect(y + sy / 2).toBeCloseTo(STORE_LAYOUT.height)
      expect(x - sx / 2).toBeGreaterThan(STORE_LAYOUT.back)
      expect(x + sx / 2).toBeLessThan(STORE_LAYOUT.front)
      expect(Math.abs(z) + sz / 2).toBeLessThan(STORE_LAYOUT.halfWidth)
    }
  })

  it('hangs every sign on a wall, facing into the room', () => {
    expect(STORE_LAYOUT.signs.length).toBeGreaterThan(0)
    const half = STORE_LAYOUT.signDepth / 2
    for (const sign of STORE_LAYOUT.signs) {
      const [x, y, z] = sign.center
      const [w, h] = sign.size
      // Off the floor and under the ceiling.
      expect(y - h / 2).toBeGreaterThan(STORE_LAYOUT.floor)
      expect(y + h / 2).toBeLessThan(STORE_LAYOUT.height)
      // Its art (asset +Z turned by yaw) points away from the wall it
      // hangs on, and it hangs just off that wall.
      const nx = Math.sin(sign.yaw)
      const nz = Math.cos(sign.yaw)
      if (Math.abs(nx) > 0.5) {
        expect(nx).toBeLessThan(0)
        expect(x + half).toBeLessThan(STORE_LAYOUT.front)
        expect(Math.abs(z) + w / 2).toBeLessThan(STORE_LAYOUT.halfWidth)
      } else {
        expect(Math.sign(nz)).toBe(-Math.sign(z))
        expect(Math.abs(z) + half).toBeLessThan(STORE_LAYOUT.halfWidth)
        expect(x - w / 2).toBeGreaterThan(STORE_LAYOUT.back)
        expect(x + w / 2).toBeLessThan(STORE_LAYOUT.front)
      }
    }
  })
})

describe('space', () => {
  it('round-trips a point through the station frame', () => {
    const [x, y, z] = toWorld(origin, [-9, 1, 2.5])
    expect(y).toBe(13)
    const back = toLocal(origin, x, z)
    expect(back.x).toBeCloseTo(-9)
    expect(back.z).toBeCloseTo(2.5)
  })

  it('knows inside the store from the lot outside', () => {
    const [ix, , iz] = toWorld(origin, [-10, 0, 0])
    const [ox, , oz] = toWorld(origin, [-4, 0, 0])
    expect(insideStore(origin, ix, iz)).toBe(true)
    expect(insideStore(origin, ox, oz)).toBe(false)
    const c = storeCenter(origin)
    expect(insideStore(origin, c.x, c.z)).toBe(true)
  })

  it('stands the store on the lot, or above terrain that rises', () => {
    const flat = () => 5
    expect(storeBase(origin, 5.28, flat)).toBe(5.28)
    // The ground climbs toward the back of the store.
    const slope = (x: number, z: number) => 5 - toLocal(origin, x, z).x * 0.1
    const base = storeBase(origin, 5.28, slope)
    const highest = 5 - STORE_LAYOUT.back * 0.1
    expect(base + STORE_LAYOUT.floor).toBeGreaterThan(highest)
  })

  it('turns blocking boxes into walls, leaving the door open', () => {
    const walls = storeWalls(origin)
    // Every blocking box, and the clerk.
    expect(walls.length).toBe(
      STORE_LAYOUT.boxes.filter((b) => b.blocks).length + 1
    )
    for (const wall of walls) expect(wall.half).toBeGreaterThan(0)
    // Nothing blocks the middle of the doorway.
    const [dx, , dz] = toWorld(origin, [STORE_LAYOUT.front - 0.1, 0, 0])
    for (const { a, b, half } of walls) {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((dx - a.x) * (b.x - a.x) + (dz - a.z) * (b.z - a.z)) /
            ((b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1)
        )
      )
      const px = a.x + (b.x - a.x) * t
      const pz = a.z + (b.z - a.z) * t
      expect(Math.hypot(dx - px, dz - pz)).toBeGreaterThan(
        half + CONFIG.player.radius
      )
    }
  })
})

describe('shopping', () => {
  it('stocks every station full, each its own copy', () => {
    const stock = freshStock(3)
    expect(stock).toHaveLength(3)
    expect(stock[0].marlboro).toBe(CONFIG.store.perItem)
    expect(stock[0].sack).toBe(CONFIG.store.perItem)
    stock[0].marlboro = 0
    expect(stock[1].marlboro).toBe(CONFIG.store.perItem)
  })

  it('picks the facing nearest the view ray, not the nearest one', () => {
    const facings: WorldFacing[] = [
      { kind: 'pbr', center: [0.4, 1.5, -1] },
      { kind: 'modelo', center: [0, 1.5, -2] },
    ]
    const stock = freshStock(1)[0]
    const eye: Vec3 = [0, 1.5, 0]
    const ahead: Vec3 = [0, 0, -1]
    expect(facingInView(facings, stock, eye, ahead)?.kind).toBe('modelo')
    // Sold out drops out.
    expect(
      facingInView(facings, { ...stock, modelo: 0 }, eye, ahead)?.kind
    ).toBe('pbr')
    // Behind you, nothing.
    expect(facingInView(facings, stock, eye, [0, 0, 1])).toBeNull()
    // Out of reach, nothing.
    const far: WorldFacing[] = [
      { kind: 'pbr', center: [0, 1.5, -(CONFIG.store.reach + 0.1)] },
    ]
    expect(facingInView(far, stock, eye, ahead)).toBeNull()
  })

  it('places world facings at their middle unit', () => {
    const facings = worldFacings(origin)
    expect(facings).toHaveLength(STORE_LAYOUT.facings.length)
    const first = STORE_LAYOUT.facings[0]
    expect(facings[0].center).toEqual(toWorld(origin, first.slots[1]))
  })

  it('formats cents as dollars', () => {
    expect(formatCash(4000)).toBe('$40.00')
    expect(formatCash(549)).toBe('$5.49')
    expect(formatCash(5)).toBe('$0.05')
    expect(formatCash(-3)).toBe('$0.00')
  })
})
