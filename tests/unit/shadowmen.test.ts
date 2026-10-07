import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { mulberry32 } from '../../src/rng.ts'
import {
  beamFrom,
  contactsOf,
  createShadowmen,
  inBeam,
  inBounds,
  inHaven,
  spawnShadowman,
  stepShadowmen,
} from '../../src/shadowmen.ts'
import type { Metres, XZ } from '../../src/interfaces.ts'
import type {
  Beam,
  Raider,
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
  burnSeconds: 0.5,
  chestHeight: 1.4,
  tickHz: 10,
}
const METRES: Metres = { width: 15059, height: 15038 }
const ORIGIN: XZ = { x: 0, z: 0 }
const ORIGIN_3 = { x: 0, y: 0, z: 0 }
const NONE: readonly XZ[] = []
const DT = 0.05

const raider = (over: Partial<Raider> = {}): Raider => ({
  id: 'a',
  x: 0,
  z: 0,
  vulnerable: false,
  beam: null,
  ...over,
})

const step = (
  field: ShadowmenField,
  rng = mulberry32(1),
  over: Partial<ShadowmenStep> = {}
) =>
  stepShadowmen(
    field,
    rng,
    { dt: DT, raiders: [raider()], metres: METRES, havens: NONE, ...over },
    CFG
  )

// A field with one hand-placed shadowman, raiders 'a' and 'b' already
// known so nothing fills round them, and no respawns for the duration.
const one = (over: Partial<Shadowman> = {}): ShadowmenField => ({
  shadowmen: [
    {
      id: 1,
      x: 0,
      z: -100,
      dirX: 0,
      dirZ: 1,
      speed: 8,
      target: null,
      burn: 0,
      ...over,
    },
  ],
  nextId: 2,
  cooldowns: { a: 1e9, b: 1e9 },
})

const first = (field: ShadowmenField): Shadowman | undefined =>
  field.shadowmen[0]

const closestApproach = (s: Shadowman, p: XZ) =>
  Math.abs((p.x - s.x) * s.dirZ - (p.z - s.z) * s.dirX)

describe('inBounds and inHaven', () => {
  it('measures against the survey inset and the haven radius', () => {
    expect(inBounds(ORIGIN, METRES, 30)).toBe(true)
    expect(inBounds({ x: METRES.width / 2 - 10, z: 0 }, METRES, 30)).toBe(false)
    expect(inHaven({ x: 10, z: 0 }, [ORIGIN], 60)).toBe(true)
    expect(inHaven({ x: 70, z: 0 }, [ORIGIN], 60)).toBe(false)
  })
})

describe('spawnShadowman', () => {
  it('comes in on the ring, heading past the raider', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 50; i++) {
      const s = spawnShadowman(rng, i, ORIGIN, METRES, NONE, CFG)
      expect(s.id).toBe(i)
      expect(Math.hypot(s.x, s.z)).toBeCloseTo(CFG.spawnRadius, 6)
      expect(Math.hypot(s.dirX, s.dirZ)).toBeCloseTo(1, 9)
      expect(closestApproach(s, ORIGIN)).toBeLessThanOrEqual(CFG.crossRadius)
      expect(s.speed).toBeGreaterThanOrEqual(CFG.speedMin)
      expect(s.speed).toBeLessThanOrEqual(CFG.speedMax)
      expect(s.target).toBeNull()
    }
  })

  it('advances along its heading by the preroll', () => {
    const a = spawnShadowman(mulberry32(5), 1, ORIGIN, METRES, NONE, CFG)
    const b = spawnShadowman(mulberry32(5), 1, ORIGIN, METRES, NONE, CFG, 50)
    expect(b.x).toBeCloseTo(a.x + a.dirX * 50, 9)
    expect(b.z).toBeCloseTo(a.z + a.dirZ * 50, 9)
  })

  it('stands still rather than divide by zero when it spawns on its crossing point', () => {
    // A ring and a crossing disc of no size put both ends on the raider.
    const cfg = { ...CFG, spawnRadius: 0, crossRadius: 0 }
    const s = spawnShadowman(mulberry32(5), 1, ORIGIN, METRES, NONE, cfg, 50)
    expect(s).toMatchObject({ x: 0, z: 0, dirX: 0, dirZ: 0 })
  })

  it('never comes in through a haven on the ring', () => {
    const havens = [{ x: CFG.spawnRadius, z: 0 }]
    const rng = mulberry32(9)
    for (let i = 0; i < 50; i++) {
      const s = spawnShadowman(rng, i, ORIGIN, METRES, havens, CFG)
      expect(inHaven(s, havens, CFG.havenRadius)).toBe(false)
    }
  })

  it('stays inside the survey near the edge, and clamps on a tiny map', () => {
    const corner = { x: METRES.width / 2 - 40, z: METRES.height / 2 - 40 }
    const rng = mulberry32(11)
    for (let i = 0; i < 50; i++) {
      const s = spawnShadowman(rng, i, corner, METRES, NONE, CFG)
      expect(inBounds(s, METRES, CFG.edgeInset)).toBe(true)
    }
    const tiny: Metres = { width: 100, height: 100 }
    const s = spawnShadowman(mulberry32(1), 1, ORIGIN, tiny, NONE, CFG)
    expect(inBounds(s, tiny, CFG.edgeInset)).toBe(true)
  })
})

describe('stepShadowmen: the bubbles', () => {
  it("fills a new raider's bubble at once, clear of havens, with new ids", () => {
    const havens = [{ x: 200, z: 0 }]
    const field = createShadowmen()
    step(field, mulberry32(2), { havens, dt: 0 })
    expect(field.shadowmen.length).toBe(CFG.count)
    const ids = new Set(field.shadowmen.map((s) => s.id))
    expect(ids.size).toBe(CFG.count)
    for (const s of field.shadowmen) {
      expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(CFG.despawnRadius)
      expect(inBounds(s, METRES, CFG.edgeInset)).toBe(true)
      expect(inHaven(s, havens, CFG.havenRadius)).toBe(false)
    }
  })

  it('shares one bubble between raiders standing together', () => {
    const field = createShadowmen()
    const together = [raider(), raider({ id: 'b', x: 5 })]
    step(field, mulberry32(2), { raiders: together, dt: 0 })
    expect(field.shadowmen.length).toBe(CFG.count)
  })

  it('gives raiders far apart a bubble each', () => {
    const field = createShadowmen()
    const apart = [raider(), raider({ id: 'b', x: 3000 })]
    step(field, mulberry32(2), { raiders: apart, dt: 0 })
    expect(field.shadowmen.length).toBe(CFG.count * 2)
  })

  it('is deterministic for a seed', () => {
    const a = createShadowmen()
    const b = createShadowmen()
    const ra = mulberry32(8)
    const rb = mulberry32(8)
    for (let i = 0; i < 400; i++) {
      const raiders = [raider({ x: i * 0.2, vulnerable: true })]
      expect(step(a, ra, { raiders })).toEqual(step(b, rb, { raiders }))
    }
    expect(a).toEqual(b)
  })

  it('uses CONFIG.shadowmen by default', () => {
    const field = createShadowmen()
    const update = stepShadowmen(field, mulberry32(1), {
      dt: DT,
      raiders: [raider()],
      metres: METRES,
      havens: NONE,
    })
    expect(update.struck).toEqual([])
    expect(field.shadowmen.length).toBe(CONFIG.shadowmen.count)
  })

  it('moves each shadowman along its heading at its speed', () => {
    const field = one()
    step(field)
    expect(first(field)?.x).toBeCloseTo(0, 9)
    expect(first(field)?.z).toBeCloseTo(-100 + 8 * DT, 9)
  })

  it('drops one past every despawn radius, off the survey, or in a haven', () => {
    const far = one({ z: -400 })
    step(far)
    expect(far.shadowmen).toEqual([])

    // Inside the second raider's bubble, it stays.
    const kept = one({ z: -400 })
    step(kept, undefined, {
      raiders: [raider(), raider({ id: 'b', z: -380 })],
    })
    expect(kept.shadowmen.length).toBe(1)

    const edge = one({ x: METRES.width / 2 - 30.2, z: 0, dirX: 1, dirZ: 0 })
    step(edge)
    expect(edge.shadowmen).toEqual([])

    const lights = one({ x: 100, z: 0, dirX: -1, dirZ: 0 })
    step(lights, undefined, { havens: [{ x: 50, z: 0 }] })
    expect(lights.shadowmen).toEqual([])

    // With no raiders at all, the valley empties.
    const empty = one()
    step(empty, undefined, { raiders: [] })
    expect(empty.shadowmen).toEqual([])
    expect(empty.cooldowns).toEqual({})
  })

  it('refills a bubble one shadowman per spawn interval', () => {
    const field = one({ z: -400 })
    field.cooldowns = { a: 0.2 }
    step(field)
    expect(field.shadowmen).toEqual([])
    step(field, undefined, { dt: 0.2 })
    expect(field.shadowmen.length).toBe(1)
    const s = field.shadowmen[0]
    expect(s.id).toBe(2)
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(CFG.spawnRadius, 6)
    expect(field.cooldowns.a).toBe(CFG.spawnInterval)

    // A teleport empties the bubble; it fills back up a trickle at a time.
    const bubble = createShadowmen()
    step(bubble, mulberry32(4), { dt: 0 })
    const away = [raider({ x: 2000 })]
    step(bubble, undefined, { raiders: away })
    expect(bubble.shadowmen.length).toBeLessThanOrEqual(1)
    for (let i = 0; i < 4; i++) {
      step(bubble, undefined, { raiders: away, dt: CFG.spawnInterval })
    }
    expect(bubble.shadowmen.length).toBeLessThanOrEqual(5)
    expect(bubble.shadowmen.length).toBeGreaterThan(1)
  })
})

describe('stepShadowmen: rushes', () => {
  it('rushes the nearest exposed raider who comes close', () => {
    const field = one({ z: -10 })
    step(field, undefined, {
      raiders: [
        raider({ vulnerable: true }),
        raider({ id: 'b', z: -12, vulnerable: true }),
      ],
    })
    expect(first(field)?.target).toBe('b')
    expect(first(field)?.speed).toBe(CFG.rushSpeed)

    const safe = one({ z: -10, dirX: 1, dirZ: 0 })
    step(safe)
    expect(first(safe)?.target).toBeNull()
    expect(first(safe)?.dirX).toBe(1)
  })

  it("never rushes in a spec's calm valley, unless a spec placed it", () => {
    const exposed = { raiders: [raider({ vulnerable: true })], calm: true }
    const crossing = one({ z: -10 })
    step(crossing, undefined, exposed)
    expect(first(crossing)?.target).toBeNull()
    const placed = one({ z: -10, speed: 0, placed: true })
    step(placed, undefined, exposed)
    expect(first(placed)?.target).toBe('a')
  })

  it('aims at its raider every step', () => {
    const field = one({ x: 10, z: -10 })
    step(field, undefined, { raiders: [raider({ vulnerable: true })] })
    expect(first(field)?.dirX).toBeCloseTo(-Math.SQRT1_2, 9)
    expect(first(field)?.dirZ).toBeCloseTo(Math.SQRT1_2, 9)
  })

  it('keeps its heading when it stands right on its raider', () => {
    // No direction to the raider from on top of them: it runs on as it was,
    // and a long step carries it out past the touch.
    const field = one({
      z: 0,
      dirX: 0,
      dirZ: 1,
      target: 'a',
      speed: CFG.rushSpeed,
    })
    const r = step(field, undefined, {
      dt: 0.2,
      raiders: [raider({ vulnerable: true })],
    })
    expect(r.struck).toEqual([])
    expect(first(field)).toMatchObject({ x: 0, dirX: 0, dirZ: 1 })
    expect(first(field)?.z).toBeCloseTo(CFG.rushSpeed * 0.2, 9)
  })

  it('breaks off when its raider is riding, in a haven, or gone', () => {
    const riding = one({ z: -10, target: 'a', speed: CFG.rushSpeed })
    step(riding)
    expect(first(riding)?.target).toBeNull()
    expect(first(riding)?.speed).toBeGreaterThanOrEqual(CFG.speedMin)
    expect(first(riding)?.speed).toBeLessThanOrEqual(CFG.speedMax)

    const pumps = one({ z: -70, target: 'a', speed: CFG.rushSpeed })
    step(pumps, undefined, {
      raiders: [raider({ vulnerable: true })],
      havens: [ORIGIN],
    })
    expect(first(pumps)?.target).toBeNull()

    const gone = one({ z: -10, target: 'b', speed: CFG.rushSpeed })
    step(gone)
    expect(first(gone)?.target).toBeNull()
  })

  it('strikes the raider it touches, and only while rushing them', () => {
    const touch = one({ z: -1.8, target: 'a', speed: CFG.rushSpeed })
    const hit = step(touch, undefined, {
      raiders: [raider({ vulnerable: true }), raider({ id: 'b', x: 1.5 })],
    })
    expect(hit.struck).toEqual(['a'])
    expect(touch.shadowmen).toEqual([])

    const brush = one({ z: -1.8, target: 'a', speed: CFG.rushSpeed })
    const miss = step(brush)
    expect(miss.struck).toEqual([])
    expect(brush.shadowmen.length).toBe(1)
  })
})

describe('contactsOf', () => {
  const at = (x: number, z: number, target: string | null = null) => ({
    x,
    z,
    target,
  })

  it('reports what is inside scope range by bearing and distance', () => {
    expect(contactsOf([at(0, -100)], ORIGIN, 'a', 250)).toEqual([
      { dist: 100, bearing: 0, hunting: false },
    ])
    const [east] = contactsOf([at(100, 0)], ORIGIN, 'a', 250)
    expect(east.bearing).toBeCloseTo(90, 9)
    expect(east.dist).toBeCloseTo(100, 9)
    expect(contactsOf([at(0, -300)], ORIGIN, 'a', 250)).toEqual([])
    expect(contactsOf([at(0, -300)], ORIGIN, 'a', 400).length).toBe(1)
  })

  it('hunts only when it is rushing this raider', () => {
    expect(contactsOf([at(0, -10, 'a')], ORIGIN, 'a')[0].hunting).toBe(true)
    expect(contactsOf([at(0, -10, 'b')], ORIGIN, 'a')[0].hunting).toBe(false)
  })
})

// The raider's eye at the origin, 1.7 m up, looking down -Z along the
// ground, standing on y 0.
const BEAM: Beam = {
  origin: { x: 0, y: 1.7, z: 0 },
  dir: { x: 0, y: 0, z: -1 },
  range: 30,
  halfAngle: 0.3,
  floor: 0,
}

describe('inBeam', () => {
  it('takes a point inside the range and the cone', () => {
    expect(inBeam(BEAM, { x: 0, y: 1.4, z: -20 })).toBe(true)
    expect(inBeam(BEAM, { x: 4, y: 1.4, z: -20 })).toBe(true)
    expect(inBeam(BEAM, { x: 0, y: 1.7, z: 0 })).toBe(true)
  })

  it('refuses a point past the range, off the cone, or behind', () => {
    expect(inBeam(BEAM, { x: 0, y: 1.4, z: -31 })).toBe(false)
    expect(inBeam(BEAM, { x: 8, y: 1.4, z: -20 })).toBe(false)
    expect(inBeam(BEAM, { x: 0, y: 1.4, z: 5 })).toBe(false)
  })
})

describe('beamFrom', () => {
  it('starts at the eye and looks where the raider looks', () => {
    const level = beamFrom({ x: 1, y: 2, z: 3 }, 0, 0, false)
    expect(level.origin).toEqual({
      x: 1,
      y: 2 + CONFIG.player.eyeHeight,
      z: 3,
    })
    expect(level.floor).toBe(2)
    expect(level.dir.x).toBeCloseTo(0, 9)
    expect(level.dir.y).toBeCloseTo(0, 9)
    expect(level.dir.z).toBeCloseTo(-1, 9)
    expect(level.range).toBe(CONFIG.flashlight.range)

    const east = beamFrom(ORIGIN_3, -Math.PI / 2, 0, false)
    expect(east.dir.x).toBeCloseTo(1, 9)
    const down = beamFrom(ORIGIN_3, 0, -Math.PI / 4, true)
    expect(down.origin.y).toBe(CONFIG.player.crouchEyeHeight)
    expect(down.dir.y).toBeCloseTo(-Math.SQRT1_2, 9)
    expect(down.dir.z).toBeCloseTo(-Math.SQRT1_2, 9)
  })
})

describe('the flashlight', () => {
  // Standing still in the beam of raider 'a', so only the burn moves.
  const lit = [raider({ beam: BEAM })]
  const held = (over: Partial<Shadowman> = {}) =>
    one({ z: -20, speed: 0, ...over })

  it('bursts a shadowman held burnSeconds in a beam, and says where', () => {
    const field = held()
    let steps = 0
    let bursts: unknown[] = []
    while (field.shadowmen.length && steps < 100) {
      bursts = step(field, undefined, { raiders: lit }).bursts
      steps++
    }
    expect(steps * DT).toBeGreaterThanOrEqual(CFG.burnSeconds - 1e-9)
    expect(steps * DT).toBeLessThanOrEqual(CFG.burnSeconds + DT + 1e-9)
    expect(bursts).toEqual([{ id: 1, x: 0, z: -20 }])
  })

  it("burns in anyone's beam", () => {
    const field = held()
    step(field, undefined, {
      raiders: [raider(), raider({ id: 'b', beam: BEAM })],
    })
    expect(first(field)?.burn).toBeCloseTo(DT, 9)
  })

  it('never burns one past the range or off the cone', () => {
    const far = held({ z: -40 })
    const wide = held({ x: 12 })
    for (let i = 0; i < 40; i++) {
      step(far, undefined, { raiders: lit })
      step(wide, undefined, { raiders: lit })
    }
    expect(first(far)?.burn).toBe(0)
    expect(first(wide)?.burn).toBe(0)
  })

  it("aims at the chest over the holder's own floor", () => {
    // From 10 m above its own floor, the level beam passes over the head.
    const high = { ...BEAM, origin: { x: 0, y: 11.7, z: 0 } }
    const field = held()
    for (let i = 0; i < 20; i++) {
      step(field, undefined, { raiders: [raider({ beam: high })] })
    }
    expect(first(field)?.burn).toBe(0)
  })

  it('lets the burn run back down out of the beam', () => {
    const field = held()
    for (let i = 0; i < 6; i++) step(field, undefined, { raiders: lit })
    expect(first(field)?.burn).toBeCloseTo(6 * DT, 9)
    for (let i = 0; i < 4; i++) step(field)
    expect(first(field)?.burn).toBeCloseTo(2 * DT, 9)
    for (let i = 0; i < 4; i++) step(field)
    expect(first(field)?.burn).toBe(0)
  })

  it('bursts a rushing shadowman too', () => {
    const field = one({ z: -20, target: 'a', speed: CFG.rushSpeed })
    const raiders = [raider({ vulnerable: true, beam: BEAM })]
    let bursts = 0
    for (let i = 0; i < 20 && field.shadowmen.length; i++) {
      bursts += step(field, undefined, { raiders }).bursts.length
    }
    expect(bursts).toBe(1)
  })
})
