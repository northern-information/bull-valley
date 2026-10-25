import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { mulberry32 } from '../../src/rng.ts'
import { CLING } from '../../src/shadowclimb.ts'
import {
  beamFrom,
  burstScaleOf,
  createShadowmen,
  headlightBeam,
  headlightsDue,
  inBeam,
  inBounds,
  inHaven,
  inTorchLight,
  reachesUp,
  spawnShadowman,
  stepShadowmen,
} from '../../src/shadowmen.ts'
import type { Metres, XZ } from '../../src/interfaces.ts'
import type { Lair } from '../../src/lairs.ts'
import type { StairPath } from '../../src/shadowclimb.ts'
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
  dimes: { min: 3, max: 20 },
  spider: {
    chance: 0,
    lairChance: 0,
    lairReach: 120,
    maxPerBubble: 3,
    burnScale: 2,
    burstScale: 2,
    aimHeight: 2.8,
    speedMin: 5,
    speedMax: 8,
    rushSpeed: 13,
    touchRadius: 2.4,
  },
  spiderling: {
    brood: { min: 3, max: 8 },
    scatter: 2.5,
    scale: 0.25,
    burstScale: 0.5,
    speedMin: 8,
    speedMax: 11,
    rushRadius: 40,
    rushSpeed: 14,
    touchRadius: 0.9,
    burnSeconds: 0.2,
    aimHeight: 0.5,
    dimes: { min: 1, max: 3 },
  },
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
  windupSeconds: 0.3,
  reachScale: 1.25,
  vertical: { under: 1, over: 0.8 },
  wall: 2,
  climb: { seek: 60, patience: 30 },
  havenRadius: 60,
  strikeSeconds: 1.6,
  burnSeconds: 0.5,
  chestHeight: 1.4,
  glowFade: { near: 200, far: 290 },
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
      kind: 'man',
      x: 0,
      z: -100,
      dirX: 0,
      dirZ: 1,
      speed: 8,
      target: null,
      burn: 0,
      windup: 0,
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
    // The firefly pond reaches as far as its own radius.
    expect(inHaven({ x: 70, z: 0 }, [{ ...ORIGIN, radius: 80 }], 60)).toBe(true)
    expect(inHaven({ x: 50, z: 0 }, [{ ...ORIGIN, radius: 40 }], 60)).toBe(
      false
    )
  })

  it('turns aside at a haven of its own radius, as at the firefly pond', () => {
    const havens = [{ x: 0, z: 0, radius: 150 }]
    // Heading into the fireflies, a little off their middle.
    const pond = one({ x: 10, z: -150.1, dirX: 0, dirZ: 1 })
    for (let i = 0; i < 200; i++) step(pond, undefined, { havens })
    const s = first(pond)
    expect(s && inHaven(s, havens, CFG.havenRadius)).toBe(false)
    expect(s && s.x > 10).toBe(true)
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

  it('drops one past every despawn radius, and only there', () => {
    const far = one({ z: -400 })
    step(far)
    expect(far.shadowmen).toEqual([])

    // Inside the second raider's bubble, it stays.
    const kept = one({ z: -400 })
    step(kept, undefined, {
      raiders: [raider(), raider({ id: 'b', z: -380 })],
    })
    expect(kept.shadowmen.length).toBe(1)

    // With no raiders at all, the valley empties.
    const empty = one()
    step(empty, undefined, { raiders: [] })
    expect(empty.shadowmen).toEqual([])
    expect(empty.cooldowns).toEqual({})
  })

  it('turns aside at the survey edge instead of going', () => {
    const x = METRES.width / 2 - 30.2
    const edge = one({ x, z: 0, dirX: 1, dirZ: 0 })
    const raiders = [raider({ x: x - 100 })]
    step(edge, undefined, { raiders })
    expect(edge.shadowmen.length).toBe(1)
    expect(first(edge)?.dirX).toBe(-1)
    for (let i = 0; i < 40; i++) step(edge, undefined, { raiders })
    expect(edge.shadowmen.length).toBe(1)
    expect(inBounds(first(edge) ?? ORIGIN, METRES, CFG.edgeInset)).toBe(true)
  })

  it('turns aside at a haven instead of vanishing at the lights', () => {
    const havens = [{ x: 0, z: 0 }]
    // Heading into the forecourt, a little off its centre.
    const lights = one({ x: 10, z: -CFG.havenRadius - 0.1, dirX: 0, dirZ: 1 })
    for (let i = 0; i < 200; i++) step(lights, undefined, { havens })
    expect(lights.shadowmen.length).toBe(1)
    const s = first(lights)
    expect(s && inHaven(s, havens, CFG.havenRadius)).toBe(false)
    // Reflected off the rim: away from the pumps, still on its way.
    expect(s && s.x > 10).toBe(true)
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
    // No direction to the raider from on top of them: it keeps the one it
    // had, and stands there winding up.
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
    expect(first(field)).toMatchObject({ x: 0, z: 0, dirX: 0, dirZ: 1 })
    expect(first(field)?.windup).toBeCloseTo(0.2, 9)
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

  it('winds up in reach, then lunges and strikes, and stays', () => {
    const touch = one({ z: -1.2, target: 'a', speed: CFG.rushSpeed })
    const raiders = [raider({ vulnerable: true }), raider({ id: 'b', x: 1.5 })]
    const steps = Math.round(CFG.windupSeconds / DT)
    for (let i = 1; i < steps; i++) {
      const winding = step(touch, undefined, { raiders })
      expect(winding.struck).toEqual([])
      expect(winding.lunges).toEqual([])
      // It stands while it winds up.
      expect(first(touch)?.z).toBe(-1.2)
    }
    const hit = step(touch, undefined, { raiders })
    expect(hit.struck).toEqual(['a'])
    expect(hit.lunges).toEqual([1])
    expect(touch.shadowmen.length).toBe(1)
    expect(first(touch)?.windup).toBe(0)

    // Only while rushing them: raider 'a' here cannot be struck.
    const brush = one({ z: -1.2, target: 'a', speed: CFG.rushSpeed })
    for (let i = 0; i <= steps; i++) expect(step(brush).struck).toEqual([])
    expect(brush.shadowmen.length).toBe(1)
  })

  it('misses a raider who steps out of reach during the windup', () => {
    const field = one({ z: -1.2, target: 'a', speed: CFG.rushSpeed })
    step(field, undefined, { raiders: [raider({ vulnerable: true })] })
    const out = CFG.touchRadius * CFG.reachScale + 0.5
    let lunged: number[] = []
    for (let i = 0; i < 20 && lunged.length === 0; i++) {
      const r = step(field, undefined, {
        raiders: [raider({ vulnerable: true, z: out })],
      })
      expect(r.struck).toEqual([])
      lunged = r.lunges
    }
    expect(lunged).toEqual([1])
    // And rushes on.
    step(field, undefined, { raiders: [raider({ vulnerable: true, z: out })] })
    expect(first(field)?.z).toBeGreaterThan(-1.2)
  })

  it('lets a windup go when its raider can no longer be struck', () => {
    const field = one({ z: -1.2, target: 'a', speed: CFG.rushSpeed })
    step(field, undefined, { raiders: [raider({ vulnerable: true })] })
    expect(first(field)?.windup).toBeGreaterThan(0)
    step(field)
    expect(first(field)?.windup).toBe(0)
    expect(first(field)?.target).toBeNull()
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

describe('headlightBeam', () => {
  const cfg = {
    reach: 400,
    range: 30,
    halfAngle: 0.45,
    height: 0.95,
    nose: 3,
    staleMs: 1000,
  }

  it('starts at the lamps and runs level the way the truck faces', () => {
    const north = headlightBeam({ x: 1, y: 2, z: 3, heading: 0 }, cfg)
    expect(north.origin).toEqual({ x: 1, y: 2.95, z: 6 })
    expect(north.floor).toBe(2)
    expect(north.dir).toEqual({ x: 0, y: 0, z: 1 })
    expect(north.range).toBe(30)
    expect(north.halfAngle).toBe(0.45)

    const east = headlightBeam({ ...ORIGIN_3, heading: Math.PI / 2 }, cfg)
    expect(east.origin.x).toBeCloseTo(3, 9)
    expect(east.dir.x).toBeCloseTo(1, 9)
    expect(east.dir.z).toBeCloseTo(0, 9)
  })
})

describe('headlightsDue', () => {
  const cfg = {
    reach: 400,
    range: 30,
    halfAngle: 0.45,
    height: 0.95,
    nose: 3,
    staleMs: 1000,
  }
  const pose = { x: 1, y: 2, z: 3, heading: 0 }

  it('owes the first word, and one every tick while the truck drives', () => {
    expect(headlightsDue(null, pose, false, 0, cfg)).toBe(true)
    const sent = { pose, at: 0 }
    expect(headlightsDue(sent, pose, true, 100, cfg)).toBe(true)
  })

  it('owes one where the truck stopped, and none while nothing moves', () => {
    const sent = { pose, at: 0 }
    expect(headlightsDue(sent, pose, false, 100, cfg)).toBe(false)
    expect(headlightsDue(sent, { ...pose, x: 1.5 }, false, 100, cfg)).toBe(true)
    expect(
      headlightsDue(sent, { ...pose, heading: 0.2 }, false, 100, cfg)
    ).toBe(true)
  })

  it('says it again before the valley forgets', () => {
    const sent = { pose, at: 0 }
    expect(headlightsDue(sent, pose, false, cfg.staleMs / 2 - 1, cfg)).toBe(
      false
    )
    expect(headlightsDue(sent, pose, false, cfg.staleMs / 2, cfg)).toBe(true)
  })
})

describe('the headlights', () => {
  // The truck at the origin facing -Z, its lamps on a shadowman ahead.
  const lights = [headlightBeam({ ...ORIGIN_3, heading: Math.PI })]

  it('burst a shadowman held in them, crediting no one', () => {
    const field = one({ z: -15, speed: 0 })
    let bursts: unknown[] = []
    for (let i = 0; i < 100 && field.shadowmen.length; i++) {
      bursts = step(field, undefined, { raiders: [raider()], lights }).bursts
    }
    expect(field.shadowmen).toEqual([])
    expect(bursts).toEqual([{ id: 1, kind: 'man', x: 0, z: -15, by: [] }])
  })

  it('leave one behind the truck alone', () => {
    const field = one({ z: 15, speed: 0 })
    for (let i = 0; i < 20; i++) {
      step(field, undefined, { raiders: [raider()], lights })
    }
    expect(first(field)?.burn).toBe(0)
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
    expect(bursts).toEqual([{ id: 1, kind: 'man', x: 0, z: -20, by: ['a'] }])
  })

  it('takes twice as long to burst a spider, aimed at its body', () => {
    const field = held({ kind: 'spider' })
    let steps = 0
    let bursts: unknown[] = []
    while (bursts.length === 0 && steps < 200) {
      bursts = step(field, undefined, { raiders: lit }).bursts
      steps++
    }
    const want = CFG.burnSeconds * CFG.spider.burnScale
    expect(want).toBe(2 * CFG.burnSeconds)
    expect(steps * DT).toBeGreaterThanOrEqual(want - 1e-9)
    expect(steps * DT).toBeLessThanOrEqual(want + DT + 1e-9)
    expect(bursts).toEqual([{ id: 1, kind: 'spider', x: 0, z: -20, by: ['a'] }])
  })

  it('names every raider whose beam was on it as it burst', () => {
    const field = held()
    const raiders = [
      raider({ beam: BEAM }),
      raider({ id: 'b', beam: BEAM }),
      // Beam down, and no part in it.
      raider({ id: 'c' }),
    ]
    const bursts: { id: number; by: string[] }[] = []
    for (let i = 0; i < 100; i++) {
      bursts.push(...step(field, undefined, { raiders }).bursts)
    }
    expect(bursts.find((b) => b.id === 1)?.by).toEqual(['a', 'b'])
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

describe('the torch', () => {
  const { lightRadius, burnRate } = CONFIG.torch
  const close = (over: Partial<Shadowman> = {}) =>
    one({ z: -(lightRadius - 1), speed: 0, ...over })

  it('lights a raider all round, close in, and only while held', () => {
    const lit = raider({ torch: true })
    expect(inTorchLight(lit, { x: 0, z: -lightRadius })).toBe(true)
    expect(inTorchLight(lit, { x: lightRadius, z: 0 })).toBe(true)
    expect(inTorchLight(lit, { x: 0, z: lightRadius + 0.1 })).toBe(false)
    expect(inTorchLight(raider(), { x: 0, z: -1 })).toBe(false)
    // Not through a floor: one far over or under the holder.
    const below = raider({ torch: true, y: 0 })
    expect(inTorchLight(below, { x: 0, z: -1, y: lightRadius + 1 })).toBe(false)
  })

  it('burns a shadowman held close, slower than a beam, and names the holder', () => {
    const field = close()
    step(field, undefined, { raiders: [raider({ torch: true })] })
    expect(first(field)?.burn).toBeCloseTo(DT * burnRate, 9)
    let bursts: { by: string[] }[] = []
    for (let i = 0; i < 200 && field.shadowmen.length; i++) {
      bursts = step(field, undefined, {
        raiders: [raider({ torch: true })],
      }).bursts
    }
    expect(bursts[0]?.by).toEqual(['a'])
  })

  it('burns no faster with a beam on it too, and names both', () => {
    const field = close()
    const raiders = [raider({ torch: true }), raider({ id: 'b', beam: BEAM })]
    step(field, undefined, { raiders })
    expect(first(field)?.burn).toBeCloseTo(DT, 9)
    let bursts: { by: string[] }[] = []
    for (let i = 0; i < 100 && field.shadowmen.length; i++) {
      bursts = step(field, undefined, { raiders }).bursts
    }
    expect(bursts[0]?.by.sort()).toEqual(['a', 'b'])
  })

  it('never burns one past its reach', () => {
    const field = close({ z: -(lightRadius + 2) })
    for (let i = 0; i < 20; i++) {
      step(field, undefined, { raiders: [raider({ torch: true })] })
    }
    expect(first(field)?.burn).toBe(0)
  })
})

describe('the shadow spiders', () => {
  // A lair round the origin, where the raider stands.
  const lair: Lair[] = [{ x: 0, z: 0, radius: 30 }]
  const spiderCfg = (over: Partial<ShadowmenConfig['spider']>) => ({
    ...CFG,
    spider: { ...CFG.spider, ...over },
  })
  const fill = (cfg: ShadowmenConfig, lairs: Lair[], seed: number) => {
    const field = createShadowmen()
    stepShadowmen(
      field,
      mulberry32(seed),
      { dt: DT, raiders: [raider()], metres: METRES, havens: NONE, lairs },
      cfg
    )
    return field.shadowmen.filter((s) => s.kind === 'spider').length
  }

  it('come by their chance, and far more often near a lair', () => {
    const cfg = spiderCfg({
      chance: 0.05,
      lairChance: 0.6,
      maxPerBubble: 6,
    })
    let away = 0
    let near = 0
    for (let seed = 1; seed <= 60; seed++) {
      away += fill(cfg, [], seed)
      near += fill(cfg, lair, seed)
    }
    expect(near).toBeGreaterThan(away * 4)
  })

  it('never crowd a bubble past maxPerBubble', () => {
    const cfg = spiderCfg({ chance: 1, lairChance: 1, maxPerBubble: 2 })
    for (let seed = 1; seed <= 10; seed++) {
      expect(fill(cfg, lair, seed)).toBe(2)
    }
  })

  it('never come at a chance of nothing', () => {
    expect(fill(CFG, lair, 1)).toBe(0)
  })

  it('cross at their own pace, rush faster and touch from further off', () => {
    const cfg = spiderCfg({ chance: 1, lairChance: 1, maxPerBubble: 6 })
    const field = createShadowmen()
    stepShadowmen(
      field,
      mulberry32(4),
      { dt: DT, raiders: [raider()], metres: METRES, havens: NONE },
      cfg
    )
    for (const s of field.shadowmen.filter((m) => m.kind === 'spider')) {
      expect(s.speed).toBeGreaterThanOrEqual(cfg.spider.speedMin)
      expect(s.speed).toBeLessThanOrEqual(cfg.spider.speedMax)
    }
    // Rushing: a spider 2 m off is already in reach, winding up; a
    // shadowman is not.
    const near = (kind: 'man' | 'spider') => {
      const f = one({ kind, z: -2, speed: 0 })
      step(f, undefined, {
        raiders: [raider({ vulnerable: true })],
        dt: 0.001,
      })
      return (first(f)?.windup ?? 0) > 0
    }
    expect(near('spider')).toBe(true)
    expect(near('man')).toBe(false)
    const rusher = one({ kind: 'spider', z: -20 })
    step(rusher, undefined, { raiders: [raider({ vulnerable: true })] })
    expect(first(rusher)?.speed).toBe(CFG.spider.rushSpeed)
  })
})

describe('the spiderlings', () => {
  const lit = [raider({ beam: BEAM })]

  it('a burst spider breaks into brood.min to brood.max of them, with new ids', () => {
    const counts = new Set<number>()
    for (let seed = 1; seed <= 40; seed++) {
      const field = one({ kind: 'spider', z: -20, speed: 0 })
      const rng = mulberry32(seed)
      let bursts: { kind: string }[] = []
      for (let i = 0; i < 200 && bursts.length === 0; i++) {
        bursts = step(field, rng, { raiders: lit }).bursts
      }
      expect(bursts.map((b) => b.kind)).toEqual(['spider'])
      const brood = field.shadowmen.filter((s) => s.kind === 'spiderling')
      expect(brood.length).toBe(field.shadowmen.length)
      expect(brood.length).toBeGreaterThanOrEqual(CFG.spiderling.brood.min)
      expect(brood.length).toBeLessThanOrEqual(CFG.spiderling.brood.max)
      counts.add(brood.length)
      const ids = brood.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(Math.min(...ids)).toBeGreaterThan(1)
      for (const s of brood) {
        expect(Math.hypot(s.x, s.z + 20)).toBeLessThanOrEqual(
          CFG.spiderling.scatter + 1e-9
        )
        expect(s.speed).toBeGreaterThanOrEqual(CFG.spiderling.speedMin)
        expect(s.speed).toBeLessThanOrEqual(CFG.spiderling.speedMax)
      }
    }
    expect(counts.size).toBeGreaterThan(2)
  })

  it('never break again, and burst in their own short time', () => {
    const field = one({ kind: 'spiderling', z: -20, speed: 0 })
    let steps = 0
    let bursts: { kind: string }[] = []
    while (bursts.length === 0 && steps < 100) {
      bursts = step(field, undefined, { raiders: lit }).bursts
      steps++
    }
    expect(bursts.map((b) => b.kind)).toEqual(['spiderling'])
    expect(field.shadowmen).toEqual([])
    expect(steps * DT).toBeLessThanOrEqual(
      CFG.spiderling.burnSeconds + DT + 1e-9
    )
  })

  it('rush from further off, faster, and touch closer', () => {
    const far = one({ kind: 'spiderling', z: -35 })
    step(far, undefined, { raiders: [raider({ vulnerable: true })] })
    expect(first(far)?.target).toBe('a')
    expect(first(far)?.speed).toBe(CFG.spiderling.rushSpeed)
    const man = one({ z: -35 })
    step(man, undefined, { raiders: [raider({ vulnerable: true })] })
    expect(first(man)?.target).toBeNull()

    const close = one({ kind: 'spiderling', z: -1.2, speed: 0 })
    step(close, undefined, {
      raiders: [raider({ vulnerable: true })],
      dt: 0.001,
    })
    expect(first(close)?.windup).toBe(0)
  })
})

describe('a burst', () => {
  it('is sized by what burst', () => {
    expect(burstScaleOf('man', CONFIG.shadowmen)).toBe(1)
    expect(burstScaleOf('spider', CONFIG.shadowmen)).toBe(
      CONFIG.shadowmen.spider.burstScale
    )
    expect(burstScaleOf('spiderling', CONFIG.shadowmen)).toBe(
      CONFIG.shadowmen.spiderling.burstScale
    )
  })
})

describe('height', () => {
  // A cliff: the ground 30 m down for z under -10, flat at 0 elsewhere.
  const cliff = (_x: number, z: number) => (z < -10 ? -30 : 0)
  const steps = Math.round(CFG.windupSeconds / DT) + 2

  it('reaches feet near its own height, and no further up or down', () => {
    const man = { kind: 'man' as const, y: 10 }
    expect(reachesUp(man, { y: 10 }, CFG)).toBe(true)
    expect(reachesUp(man, { y: 9.1 }, CFG)).toBe(true)
    expect(reachesUp(man, { y: 8.9 }, CFG)).toBe(false)
    expect(reachesUp(man, { y: 12.1 }, CFG)).toBe(true)
    expect(reachesUp(man, { y: 12.3 }, CFG)).toBe(false)
    // A spider stands taller.
    expect(reachesUp({ kind: 'spider', y: 10 }, { y: 13 }, CFG)).toBe(true)
    // Not knowing either height, it reaches.
    expect(reachesUp({ kind: 'man' }, { y: 99 }, CFG)).toBe(true)
    expect(reachesUp(man, {}, CFG)).toBe(true)
  })

  it('stands every shadowman on the ground it walks', () => {
    const field = one({ z: -100 })
    step(field, undefined, { ground: cliff })
    expect(first(field)?.y).toBe(-30)
    // Without a ground, none has a height.
    const flat = one()
    step(flat)
    expect(first(flat)?.y).toBeUndefined()
  })

  it('never rushes nor strikes a raider over or under its reach', () => {
    // Up a fire escape over the floor it walks.
    const field = one({ z: -12, x: 0 })
    const up = [raider({ x: 0, z: -12.5, y: -20, vulnerable: true })]
    for (let i = 0; i < steps; i++) {
      expect(
        step(field, undefined, { raiders: up, ground: cliff }).struck
      ).toEqual([])
    }
    expect(first(field)?.target).toBeNull()
    // The same raider down on the floor beside it is rushed and struck.
    const floor = one({ z: -12, x: 0 })
    const down = [raider({ x: 0, z: -12.5, y: -30, vulnerable: true })]
    const struck = Array.from(
      { length: steps },
      () => step(floor, undefined, { raiders: down, ground: cliff }).struck
    ).flat()
    expect(struck).toEqual(['a'])
  })

  it('breaks off a raider who climbs out of its reach', () => {
    const field = one({ z: -40, target: 'a', speed: CFG.rushSpeed })
    const raiders = [raider({ x: 0, z: -20, y: -30, vulnerable: true })]
    step(field, undefined, { raiders, ground: cliff })
    expect(first(field)?.target).toBe('a')
    raiders[0] = { ...raiders[0], y: -25 }
    step(field, undefined, { raiders, ground: cliff })
    expect(first(field)?.target).toBeNull()
  })

  it('is found by a beam where it stands, below the holder too', () => {
    // From the rim, aimed down at the floor 20 m out.
    const down: Beam = {
      origin: { x: 0, y: 1.7, z: 0 },
      dir: (() => {
        const dz = -20
        const dy = -30 + CFG.chestHeight - 1.7
        const d = Math.hypot(dz, dy)
        return { x: 0, y: dy / d, z: dz / d }
      })(),
      range: 60,
      halfAngle: 0.3,
      floor: 0,
    }
    const raiders = [raider({ beam: down })]
    const field = one({ z: -20, speed: 0 })
    step(field, undefined, { raiders, ground: cliff })
    expect(first(field)?.burn).toBeGreaterThan(0)
    // Without the ground it stands at the holder's floor, out of the beam.
    const flat = one({ z: -20, speed: 0 })
    step(flat, undefined, { raiders })
    expect(first(flat)?.burn).toBe(0)
  })

  it('never walks up or down a wall, and turns along it instead', () => {
    // On the floor heading straight for the wall, and on top heading
    // straight off it: each keeps to its own level, and walks on.
    for (const [z, dirZ, y] of [
      [-12, 1, -30],
      [-8, -1, 0],
    ] as const) {
      const field = one({ z, dirZ, speed: CFG.speedMax })
      const start = { x: first(field)!.x, z }
      for (let i = 0; i < 40; i++) {
        step(field, undefined, { ground: cliff })
        expect(first(field)?.y).toBe(y)
      }
      const s = first(field)!
      expect(Math.hypot(s.x - start.x, s.z - start.z)).toBeGreaterThan(
        CFG.speedMax * DT * 20
      )
      expect(Math.abs(s.dirX)).toBeGreaterThan(0.5)
    }
  })

  it('never takes a short cut across the moat to a raider', () => {
    // The channel: 30 m down between z -20 and -10, level ground either
    // side. A shadow on the far side rushes a raider on this side and
    // walks the rim, never down and up through the walls.
    const moat = (_x: number, z: number) => (z > -20 && z < -10 ? -30 : 0)
    const field = one({ z: -24, target: 'a', speed: CFG.rushSpeed })
    const raiders = [raider({ x: 0, z: -6, y: 0, vulnerable: true })]
    for (let i = 0; i < 60; i++) {
      expect(step(field, undefined, { raiders, ground: moat }).struck).toEqual(
        []
      )
      expect(first(field)?.y).toBe(0)
      expect(first(field)!.z).toBeLessThanOrEqual(-20)
    }
  })

  it('breaks a spider at the rim into spiderlings on its own side', () => {
    const lit = [raider({ beam: BEAM })]
    for (let seed = 1; seed <= 20; seed++) {
      // Burst a metre from the drop, so half the scatter is over it.
      const edge = (_x: number, z: number) => (z < -21 ? -30 : 0)
      const field = one({ kind: 'spider', z: -20, speed: 0 })
      const rng = mulberry32(seed)
      for (let i = 0; i < 200 && field.shadowmen[0]?.kind === 'spider'; i++) {
        step(field, rng, { raiders: lit, ground: edge })
      }
      expect(field.shadowmen.length).toBeGreaterThan(0)
      for (const s of field.shadowmen) {
        expect(s.kind).toBe('spiderling')
        expect(s.y).toBe(0)
      }
    }
  })

  it('a spider crawls down the face of a wall it meets, and on across the floor', () => {
    for (const [z, dirZ, from, to] of [
      [-5, -1, 0, -30],
      [-20, 1, -30, 0],
    ] as const) {
      const field = one({ kind: 'spider', z, dirZ, speed: 6 })
      let was: number = from
      let clung = false
      for (let i = 0; i < 200; i++) {
        step(field, undefined, { ground: cliff })
        const s = first(field)!
        // Never a jump up or down: a crawl at its pace.
        expect(Math.abs(s.y! - was)).toBeLessThanOrEqual(6 * DT + 1e-9)
        was = s.y!
        if (s.climb) {
          clung = true
          // On the face, over the floor.
          expect(s.z).toBeCloseTo(-10 - CLING, 1)
        }
      }
      expect(clung).toBe(true)
      expect(first(field)?.climb).toBeUndefined()
      expect(first(field)?.y).toBe(to)
    }
  })

  it('a spider goes down the wall after a raider on the floor', () => {
    const field = one({ kind: 'spider', z: -5, dirZ: 1, speed: 6 })
    const raiders = [raider({ x: 0, z: -30, y: -30, vulnerable: true })]
    const struck: string[] = []
    let was = 0
    for (let i = 0; i < 300 && struck.length === 0; i++) {
      struck.push(...step(field, undefined, { raiders, ground: cliff }).struck)
      const y = first(field)!.y!
      expect(Math.abs(y - was)).toBeLessThanOrEqual(
        CFG.spider.rushSpeed * DT + 1e-9
      )
      was = y
    }
    expect(struck).toEqual(['a'])
  })

  // A fire escape down the cliff: along the rim, one long flight down to
  // the floor, and off its foot.
  const escape: StairPath = [
    { x: 5, z: -9.5, y: 0 },
    { x: 5, z: -10.5, y: 0 },
    { x: 5, z: -40, y: -30 },
    { x: 6, z: -40, y: -30 },
  ]

  it('a shadowman takes a fire escape down after a raider on the floor', () => {
    const field = one({ z: -5, dirZ: 1, speed: 8 })
    const raiders = [raider({ x: 0, z: -30, y: -30, vulnerable: true })]
    const struck: string[] = []
    let was = 0
    let stepped = false
    for (let i = 0; i < 400 && struck.length === 0; i++) {
      struck.push(
        ...step(field, undefined, { raiders, ground: cliff, stairs: [escape] })
          .struck
      )
      const s = first(field)!
      // Down the flight a little at a time, never off the rim in one.
      expect(Math.abs(s.y! - was)).toBeLessThanOrEqual(
        CFG.rushSpeed * DT + 1e-9
      )
      if (s.y! < -1 && s.y! > -29) stepped = true
      was = s.y!
    }
    expect(stepped).toBe(true)
    expect(struck).toEqual(['a'])
  })

  it('a shadowman with no stair down stays on the rim', () => {
    const field = one({ z: -5, dirZ: 1, speed: 8 })
    const raiders = [raider({ x: 0, z: -30, y: -30, vulnerable: true })]
    for (let i = 0; i < 400; i++) {
      expect(step(field, undefined, { raiders, ground: cliff }).struck).toEqual(
        []
      )
      expect(first(field)?.y).toBe(0)
    }
  })

  it('a shadowman comes up a fire escape after a raider on the rim', () => {
    const field = one({ z: -30, dirZ: -1, speed: 8 })
    field.shadowmen[0].y = -30
    const raiders = [raider({ x: 0, z: -2, y: 0, vulnerable: true })]
    const struck: string[] = []
    for (let i = 0; i < 400 && struck.length === 0; i++) {
      struck.push(
        ...step(field, undefined, { raiders, ground: cliff, stairs: [escape] })
          .struck
      )
    }
    expect(struck).toEqual(['a'])
  })

  it('says how high it stood when it burst', () => {
    const field = one({ z: -20, speed: 0 })
    const level: Beam = { ...BEAM, origin: { x: 0, y: -28.3, z: 0 } }
    let bursts: { y?: number }[] = []
    for (let i = 0; i < 40 && bursts.length === 0; i++) {
      bursts = step(field, undefined, {
        raiders: [raider({ beam: level })],
        ground: cliff,
      }).bursts
    }
    expect(bursts[0]?.y).toBe(-30)
  })
})
