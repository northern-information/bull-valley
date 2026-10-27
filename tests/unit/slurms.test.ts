import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import { mulberry32 } from '../../src/rng.ts'
import {
  afterTrodden,
  AT_COUNTER,
  curseOf,
  DRIPLINES,
  eventAt,
  lineOf,
  mayJar,
  nextStart,
  slotOf,
  slotStart,
  slurmEvent,
  slurmKey,
  slurmScene,
  treads,
  underfoot,
} from '../../src/slurms.ts'
import { PUMP_ISLANDS, STORE_LAYOUT } from '../../src/store.ts'
import type { Slurm, SlurmEvent } from '../../src/slurms.ts'

const STATIONS = [0, 1, 7, 14]

// Whether `at` stands on one of the pump islands under the canopy.
const underIsland = (at: { x: number; z: number }): boolean =>
  PUMP_ISLANDS.some((z) => Math.abs(at.x) < 0.8 && Math.abs(at.z - z) < 2.2)

// The same pose: equal, but for the last bit of a float (a walk cut short
// lands where the whole one passes by a different product).
function expectSamePlace(a: object, b: object): void {
  const bv = b as Record<string, unknown>
  expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
  for (const [key, value] of Object.entries(a)) {
    if (typeof value === 'number')
      expect(value).toBeCloseTo(bv[key] as number, 9)
    else expect(value).toEqual(bv[key])
  }
}
const SLOTS = Array.from({ length: 400 }, (_, i) => 29_000_000 + i)

function* events(): Generator<SlurmEvent> {
  for (const station of STATIONS) {
    for (const slot of SLOTS) yield slurmEvent(station, slot)
  }
}

describe('the schedule', () => {
  it('drops 30 to 90 seconds apart at every station', () => {
    for (const station of STATIONS) {
      for (const slot of SLOTS) {
        const gap = slotStart(station, slot + 1) - slotStart(station, slot)
        expect(gap).toBeGreaterThanOrEqual(30)
        expect(gap).toBeLessThanOrEqual(90)
      }
    }
  })

  it('is over before the next starts', () => {
    for (const event of events()) {
      const next = slotStart(event.station, event.slot + 1)
      expect(event.start + event.end).toBeLessThan(next)
    }
  })

  it('draws the same drop for everyone, and a different one elsewhere', () => {
    expect(slurmEvent(3, 29_000_123)).toEqual(slurmEvent(3, 29_000_123))
    expect(slurmEvent(3, 29_000_123).start).toBe(slotStart(3, 29_000_123))
    expect(slurmEvent(3, 29_000_123)).not.toEqual(slurmEvent(4, 29_000_123))
  })

  it('finds the drop under way, and nothing between drops', () => {
    const event = slurmEvent(2, 29_000_050)
    const during = eventAt(2, event.start + 3)
    expect(during?.event.slot).toBe(event.slot)
    expect(during?.t).toBeCloseTo(3)
    expect(eventAt(2, event.start - 0.01)?.event.slot).not.toBe(event.slot)
    expect(eventAt(2, event.start + event.end + 0.01)).toBeNull()
  })

  it('says when the next starts', () => {
    const event = slurmEvent(5, 29_000_010)
    expect(nextStart(5, event.start - 1)).toBe(event.start)
    expect(nextStart(5, event.start + 1)).toBe(slotStart(5, event.slot + 1))
  })
})

describe('a drop', () => {
  it('is one slurm mostly, sometimes several, never past the most', () => {
    const counts = [...events()].map((e) => e.slurms.length)
    expect(Math.min(...counts)).toBe(1)
    expect(Math.max(...counts)).toBeGreaterThan(1)
    expect(Math.max(...counts)).toBeLessThanOrEqual(CONFIG.slurms.maxCount)
    const singles = counts.filter((n) => n === 1).length
    expect(singles / counts.length).toBeGreaterThan(0.5)
  })

  it('falls from every dripline, on its stretches', () => {
    const seen = new Set<string>()
    for (const event of events()) {
      seen.add(event.dripline)
      const spec = DRIPLINES[event.dripline]
      for (const slurm of event.slurms) {
        const fixed = spec.along === 'z' ? slurm.drip.x : slurm.drip.z
        const along = spec.along === 'z' ? slurm.drip.z : slurm.drip.x
        expect(fixed).toBeCloseTo(spec.at)
        expect(
          spec.spans.some(([a, b]) => along >= a - 1e-9 && along <= b + 1e-9)
        ).toBe(true)
      }
    }
    expect(seen.size).toBe(Object.keys(DRIPLINES).length)
  })

  it('has Carlsten smash every slurm after it stops crawling, then curse', () => {
    const { crawlSeconds } = CONFIG.slurms
    for (const event of events()) {
      for (const slurm of event.slurms) {
        expect(slurm.smashAt).toBeGreaterThan(slurm.landAt + crawlSeconds)
        expect(slurm.smashAt).toBeLessThan(event.sayAt)
      }
      expect(event.sayAt).toBeLessThan(event.back)
    }
  })
})

describe('the drop at a moment', () => {
  const event = slurmEvent(1, 29_000_077)

  it('lets each go, lands it, and leaves a splat that fades', () => {
    const slurm = event.slurms[0]
    expect(slurmScene(event, slurm.dropAt - 0.01).slurms[0].phase).toBe(
      'waiting'
    )
    const falling = slurmScene(event, (slurm.dropAt + slurm.landAt) / 2)
    expect(falling.slurms[0].phase).toBe('falling')
    expect(falling.slurms[0].progress).toBeCloseTo(0.25)
    const crawling = slurmScene(event, slurm.landAt + 1)
    expect(crawling.slurms[0].phase).toBe('crawling')
    const rested = slurmScene(event, slurm.smashAt - 0.01).slurms[0]
    expect(rested.x).toBeCloseTo(slurm.rest.x)
    expect(rested.z).toBeCloseTo(slurm.rest.z)
    expect(rested.tooth).toBe(1)
    const squashed = slurmScene(event, slurm.smashAt + 1).slurms[0]
    expect(squashed.phase).toBe('squashed')
    expect(squashed.progress).toBeCloseTo(1 / CONFIG.slurms.splatSeconds)
    const gone = slurmScene(event, slurm.smashAt + CONFIG.slurms.splatSeconds)
    expect(gone.slurms[0].phase).toBe('gone')
  })

  it('bares the tooth now and then while it crawls', () => {
    const slurm = event.slurms[0]
    const teeth: number[] = []
    for (let t = slurm.landAt; t < slurm.landAt + 4; t += 0.05) {
      teeth.push(slurmScene(event, t).slurms[0].tooth)
    }
    expect(Math.min(...teeth)).toBe(0)
    expect(Math.max(...teeth)).toBe(1)
  })

  it('keeps Carlsten at his counter but while he is out', () => {
    expect(slurmScene(event, 0).carlsten).toEqual(AT_COUNTER)
    expect(slurmScene(event, event.back + 0.01).carlsten).toEqual(AT_COUNTER)
    const out = slurmScene(event, event.out + 0.5).carlsten
    expect(out.away).toBe(true)
    expect(out.action).toBe('walk')
  })

  it('walks him out the door, swings at each, and back the way he came', () => {
    for (const each of [...events()].slice(0, 300)) {
      const actions = new Set<string>()
      let outside = false
      for (let t = each.out; t < each.back; t += 0.05) {
        const at = slurmScene(each, t).carlsten
        actions.add(at.action)
        // He leaves the store only by the door.
        if (at.x > STORE_LAYOUT.front && !outside) {
          expect(Math.abs(at.z)).toBeLessThan(STORE_LAYOUT.doorWidth / 2)
          outside = true
        }
        // Never through a pump island under the canopy.
        if (each.dripline !== 'eave') expect(underIsland(at)).toBe(false)
      }
      expect(outside).toBe(true)
      expect([...actions].sort()).toEqual(
        ['recover', 'smash', 'stand', 'walk', 'windup'].sort()
      )
    }
  })

  it('stands him beside each slurm, facing it, as the bat comes down', () => {
    for (const each of [...events()].slice(0, 300)) {
      for (const slurm of each.slurms) {
        const at = slurmScene(each, slurm.smashAt - 0.01).carlsten
        expect(at.action).toBe('smash')
        expect(
          Math.hypot(at.x - slurm.rest.x, at.z - slurm.rest.z)
        ).toBeCloseTo(CONFIG.slurms.standOff)
        const facing = Math.atan2(slurm.rest.x - at.x, slurm.rest.z - at.z)
        expect(Math.cos(facing - at.yaw)).toBeCloseTo(1)
      }
    }
  })
})

describe('the curse', () => {
  it('comes round every line', () => {
    const lines = new Set([...events()].map(curseOf))
    expect(lines.size).toBe(8)
    expect(lines.has(copy('slurms.curse_1'))).toBe(true)
  })

  it('is the line he says, with nothing trodden on', () => {
    for (const event of [...events()].slice(0, 50)) {
      expect(lineOf(event)).toBe(curseOf(event))
    }
  })
})

describe('trodden on before Carlsten gets there', () => {
  const all = [...events()]
  const singles = all.filter((e) => e.slurms.length === 1).slice(0, 200)
  const several = all.filter((e) => e.slurms.length > 1).slice(0, 200)
  const { windupSeconds, smashSeconds, recoverSeconds, thanksDelay } =
    CONFIG.slurms
  // When he would have raised the bat at `slurm`.
  const swingAt = (slurm: Slurm) => slurm.smashAt - smashSeconds - windupSeconds
  const none = (event: SlurmEvent) => event.slurms.map(() => Infinity)

  it('is the same drop with nothing trodden on', () => {
    const event = singles[0]
    expect(afterTrodden(event, none(event))).toBe(event)
  })

  it('is the same drop up to the first one trodden on', () => {
    for (const event of several) {
      const trodden = none(event)
      const d = (event.out + swingAt(event.slurms[0])) / 2
      trodden[0] = d
      const after = afterTrodden(event, trodden)
      for (let t = 0; t < d; t += 0.1) {
        expectSamePlace(
          slurmScene(after, t).carlsten,
          slurmScene(event, t).carlsten
        )
      }
    }
  })

  it('stops him on his way out, thanks them, and turns him back', () => {
    for (const event of singles) {
      const d = (event.out + swingAt(event.slurms[0])) / 2
      const after = afterTrodden(event, [d])
      expect(after.thanks).toBe(true)
      expect(lineOf(after)).toBe(copy('slurms.thanks'))
      expect(after.sayAt).toBeCloseTo(d + thanksDelay)
      expect(after.slurms[0].smashAt).toBe(Infinity)
      // Stood where he was when it went, facing the way he was going.
      const going = slurmScene(after, d - 1e-6).carlsten
      expect(going.action).toBe('walk')
      const stood = slurmScene(after, after.sayAt).carlsten
      expect(stood.action).toBe('stand')
      expect(stood.away).toBe(true)
      expect(Math.hypot(stood.x - going.x, stood.z - going.z)).toBeLessThan(
        0.05
      )
      expect(stood.yaw).toBeCloseTo(going.yaw)
      // Never a swing; back behind the counter, and before the drop is over.
      const actions = new Set<string>()
      for (let t = after.out; t < after.back; t += 0.05) {
        actions.add(slurmScene(after, t).carlsten.action)
      }
      expect([...actions].sort()).toEqual(['stand', 'walk'])
      expect(after.back).toBeLessThan(event.back)
      expect(slurmScene(after, after.back).carlsten).toEqual(AT_COUNTER)
      // He turns round: his first step back goes the other way.
      const turned = after.legs.find((leg) => leg.t0 >= after.sayAt)
      expect(turned?.kind).toBe('walk')
      const back = slurmScene(after, (turned!.t0 + turned!.t1) / 2).carlsten
      expect(Math.cos(back.yaw - going.yaw)).toBeLessThan(0)
    }
  })

  it('never brings him out for one gone before he leaves', () => {
    for (const event of singles) {
      const after = afterTrodden(event, [event.out - 0.1])
      for (let t = 0; t < event.end; t += 0.1) {
        expect(slurmScene(after, t).carlsten).toEqual(AT_COUNTER)
      }
    }
  })

  it('sends him after the rest, and curses, while any are left', () => {
    for (const event of several) {
      const first = [...event.slurms].sort((a, b) => a.smashAt - b.smashAt)[0]
      const i = event.slurms.indexOf(first)
      const trodden = none(event)
      trodden[i] = (event.out + swingAt(first)) / 2
      const after = afterTrodden(event, trodden)
      expect(after.thanks).toBe(false)
      expect(lineOf(after)).toBe(curseOf(event))
      after.slurms.forEach((slurm, k) => {
        if (k === i) expect(slurm.smashAt).toBe(Infinity)
        else expect(slurm.smashAt).toBeLessThan(after.sayAt)
      })
    }
  })

  it('thanks them for the last one, after smashing the rest', () => {
    let thanked = 0
    for (const event of several) {
      const order = [...event.slurms].sort((a, b) => a.smashAt - b.smashAt)
      const lastOne = order[order.length - 1]
      const before = order[order.length - 2]
      // On his way to it, past the beat to recover from the one before.
      const setOff = before.smashAt + recoverSeconds
      const d = (setOff + swingAt(lastOne)) / 2
      const trodden = none(event)
      trodden[event.slurms.indexOf(lastOne)] = d
      const after = afterTrodden(event, trodden)
      expect(after.thanks).toBe(true)
      expect(after.sayAt).toBeCloseTo(d + thanksDelay)
      expect(after.slurms[event.slurms.indexOf(before)].smashAt).toBeCloseTo(
        before.smashAt
      )
      thanked++
    }
    expect(thanked).toBeGreaterThan(0)
  })

  it('keeps him on his way, and back within the drop, however they go', () => {
    const rng = mulberry32(7)
    for (const event of all.slice(0, 600)) {
      const trodden = event.slurms.map((slurm) =>
        rng() < 0.5
          ? slurm.landAt + rng() * (event.back - slurm.landAt)
          : Infinity
      )
      const after = afterTrodden(event, trodden)
      expect(after.back).toBeLessThanOrEqual(event.end)
      let outside = false
      for (let t = after.out; t < after.back; t += 0.05) {
        const at = slurmScene(after, t).carlsten
        if (at.x > STORE_LAYOUT.front && !outside) {
          expect(Math.abs(at.z)).toBeLessThan(STORE_LAYOUT.doorWidth / 2)
          outside = true
        }
        if (after.dripline !== 'eave') expect(underIsland(at)).toBe(false)
      }
      expect(slurmScene(after, after.back).carlsten).toEqual(AT_COUNTER)
    }
  })
})

describe('underfoot', () => {
  const at = { x: 3, y: 10, z: -2 }

  it('treads on a slurm only with feet close and level with it', () => {
    const { treadReach, treadHeight } = CONFIG.slurms
    expect(treads(at, [])).toBe(false)
    expect(treads(at, [{ x: 3.1, y: 10, z: -2 }])).toBe(true)
    expect(treads(at, [{ x: 3 + treadReach * 1.5, y: 10, z: -2 }])).toBe(false)
    // On a deck over it, or down a level, misses.
    expect(treads(at, [{ x: 3, y: 10 + treadHeight * 2, z: -2 }])).toBe(false)
    expect(
      treads(at, [
        { x: 50, y: 10, z: 50 },
        { x: 3, y: 10.2, z: -2.2 },
      ])
    ).toBe(true)
  })

  it('leaves a splat that fades and goes where it was trodden', () => {
    const crawling = {
      phase: 'crawling' as const,
      x: 1,
      z: 2,
      progress: 0,
      yaw: 0.5,
      stretch: 0.4,
      tooth: 1,
    }
    const fresh = underfoot(crawling, 0)
    expect(fresh).toMatchObject({ phase: 'squashed', x: 1, z: 2, progress: 0 })
    expect(fresh.tooth).toBe(0)
    const half = underfoot(crawling, CONFIG.slurms.splatSeconds / 2)
    expect(half.progress).toBeCloseTo(0.5)
    expect(underfoot(crawling, CONFIG.slurms.splatSeconds).phase).toBe('gone')
  })
})

describe('the jar', () => {
  const { slotSeconds } = CONFIG.slurms

  it('keys one slurm of one drop at one station', () => {
    expect(slurmKey(3, 120, 1)).toBe('3:120:1')
    expect(slotOf(slotSeconds * 7.5)).toBe(7)
  })

  it('lets a slurm of a drop near now in, and none past its count', () => {
    const slot = 1000
    const seconds = slot * slotSeconds + 10
    const count = slurmEvent(2, slot).slurms.length
    expect(mayJar(2, slot, 0, seconds)).toBe(true)
    expect(mayJar(2, slot, count - 1, seconds)).toBe(true)
    expect(mayJar(2, slot, count, seconds)).toBe(false)
    expect(mayJar(2, slot + 2, 0, seconds)).toBe(true)
    expect(mayJar(2, slot - 3, 0, seconds)).toBe(false)
    expect(mayJar(2, slot, -1, seconds)).toBe(false)
    expect(mayJar(2, slot + 0.5, 0, seconds)).toBe(false)
  })
})
