import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { mulberry32 } from '../../src/rng.ts'
import {
  createShadowmen,
  inBounds,
  inHaven,
  spawnShadowman,
  stepShadowmen,
} from '../../src/shadowmen.ts'
import type { Metres, XZ } from '../../src/interfaces.ts'
import type {
  Shadowman,
  ShadowmenConfig,
  ShadowmenField,
  ShadowmenStep,
} from '../../src/shadowmen.ts'

// Pinned so the tests do not move when CONFIG.shadowmen is retuned.
const CFG: ShadowmenConfig = {
  count: 6,
  spawnRadius: 300,
  crossRadius: 120,
  despawnRadius: 360,
  speedMin: 7,
  speedMax: 10,
  spawnInterval: 0.75,
  edgeInset: 30,
  rushRadius: 25,
  rushSpeed: 12,
  touchRadius: 1.4,
  havenRadius: 60,
  strikeSeconds: 1.6,
}
const METRES: Metres = { width: 15059, height: 15038 }
const ORIGIN: XZ = { x: 0, z: 0 }
const NONE: readonly XZ[] = []
const DT = 0.05

const step = (
  field: ShadowmenField,
  rng = mulberry32(1),
  over: Partial<ShadowmenStep> = {}
) =>
  stepShadowmen(
    field,
    rng,
    {
      dt: DT,
      player: ORIGIN,
      metres: METRES,
      havens: NONE,
      vulnerable: false,
      ...over,
    },
    CFG
  )

// A field with one hand-placed shadowman and no respawns for the duration.
const one = (over: Partial<Shadowman> = {}): ShadowmenField => ({
  slots: [
    { x: 0, z: -100, dirX: 0, dirZ: 1, speed: 8, rushing: false, ...over },
  ],
  cooldown: 1e9,
})

const alive = (field: ShadowmenField) =>
  field.slots.filter((s) => s !== null).length

const closestApproach = (s: Shadowman, player: XZ) =>
  Math.abs((player.x - s.x) * s.dirZ - (player.z - s.z) * s.dirX)

describe('spawnShadowman', () => {
  it('comes in on the ring, heading past the player', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 50; i++) {
      const s = spawnShadowman(rng, ORIGIN, METRES, NONE, CFG)
      expect(Math.hypot(s.x, s.z)).toBeCloseTo(CFG.spawnRadius, 6)
      expect(Math.hypot(s.dirX, s.dirZ)).toBeCloseTo(1, 9)
      expect(closestApproach(s, ORIGIN)).toBeLessThanOrEqual(CFG.crossRadius)
      expect(s.speed).toBeGreaterThanOrEqual(CFG.speedMin)
      expect(s.speed).toBeLessThanOrEqual(CFG.speedMax)
      expect(s.rushing).toBe(false)
    }
  })

  it('advances along its heading by the preroll', () => {
    const a = spawnShadowman(mulberry32(5), ORIGIN, METRES, NONE, CFG)
    const b = spawnShadowman(mulberry32(5), ORIGIN, METRES, NONE, CFG, 50)
    expect(b.x).toBeCloseTo(a.x + a.dirX * 50, 9)
    expect(b.z).toBeCloseTo(a.z + a.dirZ * 50, 9)
  })

  it('never comes in through a haven on the ring', () => {
    const havens = [{ x: CFG.spawnRadius, z: 0 }]
    const rng = mulberry32(9)
    for (let i = 0; i < 50; i++) {
      const s = spawnShadowman(rng, ORIGIN, METRES, havens, CFG)
      expect(inHaven(s, havens, CFG.havenRadius)).toBe(false)
    }
  })

  it('stays inside the survey near the edge, and clamps on a tiny map', () => {
    const corner = { x: METRES.width / 2 - 40, z: METRES.height / 2 - 40 }
    const rng = mulberry32(11)
    for (let i = 0; i < 50; i++) {
      const s = spawnShadowman(rng, corner, METRES, NONE, CFG)
      expect(inBounds(s, METRES, CFG.edgeInset)).toBe(true)
    }
    const tiny: Metres = { width: 100, height: 100 }
    const s = spawnShadowman(mulberry32(1), ORIGIN, tiny, NONE, CFG)
    expect(inBounds(s, tiny, CFG.edgeInset)).toBe(true)
  })
})

describe('createShadowmen', () => {
  it('fills every slot inside the bubble, clear of havens', () => {
    const havens = [{ x: 200, z: 0 }]
    const field = createShadowmen(mulberry32(2), ORIGIN, METRES, havens, CFG)
    expect(field.slots.length).toBe(CFG.count)
    expect(alive(field)).toBe(CFG.count)
    for (const s of field.slots) {
      if (!s) throw new Error('empty slot')
      expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(CFG.despawnRadius)
      expect(inBounds(s, METRES, CFG.edgeInset)).toBe(true)
      expect(inHaven(s, havens, CFG.havenRadius)).toBe(false)
    }
    expect(field.cooldown).toBe(0)
  })

  it('is deterministic for a seed', () => {
    const a = createShadowmen(mulberry32(7), ORIGIN, METRES, NONE, CFG)
    const b = createShadowmen(mulberry32(7), ORIGIN, METRES, NONE, CFG)
    const ra = mulberry32(8)
    const rb = mulberry32(8)
    for (let i = 0; i < 400; i++) {
      const player = { x: i * 0.2, z: 0 }
      const ua = step(a, ra, { player, vulnerable: true })
      const ub = step(b, rb, { player, vulnerable: true })
      expect(ua).toEqual(ub)
    }
    expect(a).toEqual(b)
  })

  it('uses CONFIG.shadowmen by default', () => {
    const field = createShadowmen(mulberry32(1), ORIGIN, METRES, NONE)
    expect(field.slots.length).toBe(CONFIG.shadowmen.count)
    const update = stepShadowmen(field, mulberry32(1), {
      dt: DT,
      player: ORIGIN,
      metres: METRES,
      havens: NONE,
      vulnerable: false,
    })
    expect(update.struck).toBe(false)
    for (const c of update.contacts) {
      expect(c.dist).toBeLessThan(CONFIG.scope.rangeMetres)
    }
  })
})

describe('stepShadowmen', () => {
  it('moves each shadowman along its heading at its speed', () => {
    const field = one()
    step(field)
    expect(field.slots[0]?.x).toBeCloseTo(0, 9)
    expect(field.slots[0]?.z).toBeCloseTo(-100 + 8 * DT, 9)
  })

  it('drops one past the despawn radius, off the survey, or in a haven', () => {
    const far = one({ z: -400 })
    step(far)
    expect(far.slots[0]).toBeNull()

    const edge = one({ x: METRES.width / 2 - 30.2, z: 0, dirX: 1, dirZ: 0 })
    step(edge)
    expect(edge.slots[0]).toBeNull()

    const lights = one({ x: 100, z: 0, dirX: -1, dirZ: 0 })
    step(lights, undefined, { havens: [{ x: 50, z: 0 }] })
    expect(lights.slots[0]).toBeNull()
  })

  it('refills one empty slot per spawn interval', () => {
    const field = one({ z: -400 })
    field.cooldown = 0.2
    step(field)
    expect(field.slots[0]).toBeNull()
    step(field, undefined, { dt: 0.2 })
    const s = field.slots[0]
    expect(s).not.toBeNull()
    expect(Math.hypot(s?.x ?? 0, s?.z ?? 0)).toBeCloseTo(CFG.spawnRadius, 6)
    expect(field.cooldown).toBe(CFG.spawnInterval)

    // A teleport empties the bubble; it fills back up a trickle at a time.
    const bubble = createShadowmen(mulberry32(4), ORIGIN, METRES, NONE, CFG)
    const away = { x: 2000, z: 0 }
    step(bubble, undefined, { player: away })
    expect(alive(bubble)).toBeLessThanOrEqual(1)
    for (let i = 0; i < 4; i++) {
      step(bubble, undefined, { player: away, dt: CFG.spawnInterval })
    }
    expect(alive(bubble)).toBeLessThanOrEqual(5)
    expect(alive(bubble)).toBeGreaterThan(1)
  })

  it('reports contacts inside scope range by bearing and distance', () => {
    const north = step(one({ speed: 0 }))
    expect(north.contacts).toEqual([{ dist: 100, bearing: 0, hunting: false }])

    const east = step(one({ x: 100, z: 0, speed: 0 }))
    expect(east.contacts[0].bearing).toBeCloseTo(90, 9)
    expect(east.contacts[0].dist).toBeCloseTo(100, 9)

    const beyond = step(one({ z: -300, speed: 0 }))
    expect(beyond.contacts).toEqual([])

    const near = step(one({ z: -300, speed: 0 }), undefined, {
      scopeRange: 400,
    })
    expect(near.contacts.length).toBe(1)

    const field = createShadowmen(mulberry32(6), ORIGIN, METRES, NONE, CFG)
    const { contacts } = step(field)
    const inRange = field.slots.filter(
      (s) => s && Math.hypot(s.x, s.z) < CONFIG.scope.rangeMetres
    ).length
    expect(contacts.length).toBe(inRange)
    for (const c of contacts) {
      expect(c.bearing).toBeGreaterThanOrEqual(0)
      expect(c.bearing).toBeLessThan(360)
      expect(c.dist).toBeLessThan(CONFIG.scope.rangeMetres)
      expect(c.hunting).toBe(false)
    }
  })

  it('rushes a player on foot who comes within reach', () => {
    const field = one({ z: -10, dirX: 1, dirZ: 0 })
    const { contacts } = step(field, undefined, { vulnerable: true })
    const s = field.slots[0]
    expect(s?.rushing).toBe(true)
    expect(s?.speed).toBe(CFG.rushSpeed)
    expect(s?.dirX).toBeCloseTo(0, 9)
    expect(s?.dirZ).toBeCloseTo(1, 9)
    expect(contacts[0].hunting).toBe(true)

    const safe = one({ z: -10, dirX: 1, dirZ: 0 })
    step(safe)
    expect(safe.slots[0]?.rushing).toBe(false)
    expect(safe.slots[0]?.dirX).toBe(1)
  })

  it('breaks off a rush when the player is riding or in a haven', () => {
    const riding = one({ z: -10, rushing: true, speed: CFG.rushSpeed })
    step(riding)
    expect(riding.slots[0]?.rushing).toBe(false)
    expect(riding.slots[0]?.speed).toBeGreaterThanOrEqual(CFG.speedMin)
    expect(riding.slots[0]?.speed).toBeLessThanOrEqual(CFG.speedMax)

    const pumps = one({ z: -70, rushing: true, speed: CFG.rushSpeed })
    step(pumps, undefined, { vulnerable: true, havens: [ORIGIN] })
    expect(pumps.slots[0]?.rushing).toBe(false)
  })

  it('strikes on touch, and only while rushing', () => {
    const touch = one({ z: -1.8, rushing: true, speed: CFG.rushSpeed })
    const hit = step(touch, undefined, { vulnerable: true })
    expect(hit.struck).toBe(true)
    expect(touch.slots[0]).toBeNull()

    const brush = one({ z: -1.8, rushing: true, speed: CFG.rushSpeed })
    const miss = step(brush)
    expect(miss.struck).toBe(false)
    expect(brush.slots[0]).not.toBeNull()
  })
})
