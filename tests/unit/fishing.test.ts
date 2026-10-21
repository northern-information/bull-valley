import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { dayKey } from '../../src/daily.ts'
import {
  anglerWire,
  arrowOf,
  BAITS,
  bandOf,
  BOX_ROD,
  canDig,
  catchableOf,
  caughtToday,
  counted,
  dugAt,
  dugOf,
  feelingOf,
  fightOf,
  FISH,
  FRESH_ANGLER,
  hookOf,
  inPond,
  isBait,
  isCatch,
  jarRoom,
  landChance,
  landOf,
  lineOutOf,
  nearestLanding,
  pondOf,
  pondsOf,
  pressFight,
  quickestMs,
  reachOf,
  reelInTime,
  rodIn,
  RODS,
  rodStats,
  shoreDistance,
  skillAfter,
  skillLevel,
  skillText,
  skillUpChance,
  spent,
  startFight,
  stepFight,
  tired,
  toAnglerWire,
  toPondPlace,
  warned,
  weightOf,
} from '../../src/fishing.ts'
import { isFish, itemById } from '../../src/items.ts'
import type { Water } from '../../src/interfaces.ts'

// 2026-07-01 at noon and at 22:00 Central (CDT, UTC-5).
const NOON = Date.UTC(2026, 6, 1, 17)
const NIGHT = Date.UTC(2026, 6, 2, 3)

describe('fishing', () => {
  it('knows its baits', () => {
    expect(BAITS).toEqual(['nightcrawlers', 'berries', 'slurm'])
    expect(isBait('berries')).toBe(true)
    expect(isBait('cabbage')).toBe(false)
  })

  it('reads the Central hour as dawn, day, dusk or night', () => {
    expect(bandOf(5)).toBe('dawn')
    expect(bandOf(7)).toBe('dawn')
    expect(bandOf(8)).toBe('day')
    expect(bandOf(16)).toBe('day')
    expect(bandOf(17)).toBe('dusk')
    expect(bandOf(19)).toBe('dusk')
    expect(bandOf(20)).toBe('night')
    expect(bandOf(0)).toBe('night')
    expect(bandOf(4)).toBe('night')
  })

  it('takes every catch off an item, every fish an item of its own', () => {
    for (const fish of FISH) {
      expect(itemById(fish.kind), fish.kind).not.toBeNull()
      expect(isCatch(fish.kind)).toBe(true)
      if (!fish.junk) expect(isFish(fish.kind), fish.kind).toBe(true)
      expect(Object.values(fish.bait).some((tier) => tier > 0)).toBe(true)
    }
    expect(catchableOf('empty-can')?.junk).toBe(true)
    expect(catchableOf('cabbage')).toBeNull()
    expect(isCatch('cabbage')).toBe(false)
  })

  it('weighs a fish by its tier, its hours, its rarity and the skill gap', () => {
    const bluegill = catchableOf('bluegill')!
    const carp = catchableOf('common-carp')!
    const ghost = catchableOf('ghost-catfish')!
    // Bluegill takes worms best, at any hour.
    expect(weightOf(bluegill, 'nightcrawlers', 'night', 10)).toBe(75)
    expect(weightOf(bluegill, 'berries', 'day', 10)).toBe(30)
    // The carp takes no worm at night, and berries best by day.
    expect(weightOf(carp, 'nightcrawlers', 'night', 0)).toBe(0)
    expect(weightOf(carp, 'berries', 'day', 1000)).toBe(75)
    // Far past the skill it is rarer, never below the floor.
    expect(weightOf(carp, 'berries', 'day', 0)).toBeCloseTo(
      75 * CONFIG.fishing.gapFloor
    )
    // The legend: night alone, worms alone, and rare.
    expect(weightOf(ghost, 'berries', 'night', 1000)).toBe(0)
    expect(weightOf(ghost, 'nightcrawlers', 'day', 1000)).toBe(0)
    expect(weightOf(ghost, 'nightcrawlers', 'night', 1000)).toBeCloseTo(3)
  })

  it('draws nothing at the bottom of the roll, a fish above it', () => {
    expect(hookOf('nightcrawlers', NOON, 0, 0)).toBeNull()
    const hook = hookOf('nightcrawlers', NOON, 0, 0.999)
    expect(hook).not.toBeNull()
    // By day on worms the bluegill is the likeliest catch at skill 0.
    const counts = new Map<string, number>()
    for (let i = 0; i < 1000; i++) {
      const h = hookOf('nightcrawlers', NOON, 0, i / 1000)
      const key = h?.kind ?? 'nothing'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const top = [...counts].sort((a, b) => b[1] - a[1])[0][0]
    expect(top).toBe('bluegill')
    // Nothing on worms by day is the bass, the catfish or the legend.
    expect(counts.has('ghost-catfish')).toBe(false)
    expect(counts.has('channel-catfish')).toBe(false)
  })

  it('calls a hook small, large or an item, with a feeling past the skill', () => {
    const night = new Map<string, ReturnType<typeof hookOf>>()
    for (let i = 0; i < 1000; i++) {
      const h = hookOf('nightcrawlers', NIGHT, 0, i / 1000)
      if (h) night.set(h.kind, h)
    }
    expect(night.get('bluegill')).toEqual({
      kind: 'bluegill',
      call: 'small',
      feeling: null,
      epic: false,
    })
    expect(night.get('empty-can')?.call).toBe('item')
    expect(night.get('empty-can')?.feeling).toBeNull()
    expect(night.get('channel-catfish')?.call).toBe('large')
    expect(night.get('channel-catfish')?.feeling).toBe('positive')
    expect(night.get('ghost-catfish')?.epic).toBe(true)
  })

  it('feels a fish only well past the skill, worse the further', () => {
    expect(feelingOf(7, 0)).toBeNull()
    expect(feelingOf(8, 0)).toBe('unsure')
    expect(feelingOf(20, 0)).toBe('fairly')
    expect(feelingOf(35, 0)).toBe('positive')
    expect(feelingOf(35, 300)).toBeNull()
  })

  it('reads the skill in tenths', () => {
    expect(skillLevel(123)).toBe(12)
    expect(skillText(123)).toBe('12.3')
    expect(skillText(0)).toBe('0.0')
  })

  it('fights harder above the skill and gives way below it', () => {
    const easy = fightOf('bluegill', 500)
    const hard = fightOf('channel-catfish', 0)
    expect(easy.silver).toBeGreaterThan(hard.silver)
    expect(easy.gold).toBeCloseTo(easy.silver * CONFIG.fishing.fight.gold)
    expect(easy.regen).toBe(0)
    expect(hard.regen).toBeGreaterThan(0)
    expect(hard.arrowMs).toBeLessThan(easy.arrowMs)
    expect(fightOf('ghost-catfish', 0).limitMs).toBe(
      CONFIG.fishing.fight.limitMs.legend
    )
    // An unknown kind fights as a bluegill would.
    expect(fightOf('nope', 0)).toEqual(fightOf('bluegill', 0))
  })

  it('takes a reel no sooner than the quickest fight and no later than the clock', () => {
    const fight = fightOf('bluegill', 0)
    const quick = quickestMs(fight)
    expect(quick).toBe(Math.ceil(fight.stamina / fight.gold) * fight.arrowMs)
    expect(reelInTime(fight, quick * 0.5)).toBe(false)
    expect(reelInTime(fight, quick)).toBe(true)
    expect(reelInTime(fight, fight.limitMs + CONFIG.fishing.lateMs)).toBe(true)
    expect(reelInTime(fight, fight.limitMs + CONFIG.fishing.lateMs + 1)).toBe(
      false
    )
  })

  it('deals the same arrows for the same seed', () => {
    const fight = fightOf('bluegill', 0)
    expect(arrowOf(7, 3, fight)).toEqual(arrowOf(7, 3, fight))
    const dirs = new Set(
      Array.from({ length: 40 }, (_, i) => arrowOf(7, i, fight).dir)
    )
    expect(dirs).toEqual(new Set(['left', 'right']))
  })

  it('plays a fight: arrows show, the right key drains, the wrong one heals', () => {
    const fight = fightOf('bluegill', 0)
    let state = startFight(fight)
    state = stepFight(fight, state, fight.arrowMs - 1, 9)
    expect(state.arrow).toBeNull()
    state = stepFight(fight, state, 1, 9)
    const arrow = state.arrow!
    expect(arrow).not.toBeNull()
    expect(state.shown).toBe(1)
    const right = pressFight(fight, state, arrow.dir)
    expect(right.stamina).toBe(
      fight.stamina - (arrow.gold ? fight.gold : fight.silver)
    )
    expect(right.arrow).toBeNull()
    expect(right.next).toBe(state.ms + fight.arrowMs)
    const wrong = pressFight(
      fight,
      { ...state, stamina: 50 },
      arrow.dir === 'left' ? 'right' : 'left'
    )
    expect(wrong.stamina).toBe(50 + fight.pull)
    // A key with no arrow showing heals it too, and keeps the next arrow.
    const early = pressFight(fight, { ...right, stamina: 50 }, 'left')
    expect(early.stamina).toBe(50 + fight.pull)
    expect(early.next).toBe(right.next)
  })

  it('counts an arrow left too long against the raider', () => {
    const fight = fightOf('bluegill', 0)
    let state = stepFight(fight, startFight(fight), fight.arrowMs, 1)
    state = { ...state, stamina: 40 }
    state = stepFight(fight, state, fight.windowMs + 1, 1)
    expect(state.arrow).toBeNull()
    expect(state.stamina).toBe(40 + fight.pull)
  })

  it('wins a fight pressed perfectly, inside the clock, never faster than the valley allows', () => {
    const fight = fightOf('bluegill', 0)
    let state = startFight(fight)
    while (!spent(state) && !state.over) {
      state = stepFight(fight, state, 10, 42)
      if (state.arrow) state = pressFight(fight, state, state.arrow.dir)
    }
    expect(spent(state)).toBe(true)
    expect(state.over).toBe(false)
    expect(reelInTime(fight, state.ms)).toBe(true)
    // A spent fish shows no more arrows and takes no more keys.
    const after = stepFight(fight, state, fight.arrowMs * 2, 42)
    expect(after.arrow).toBeNull()
    expect(pressFight(fight, after, 'left')).toBe(after)
  })

  it('pulls back on its own far past the skill, and runs out the clock', () => {
    const fight = fightOf('channel-catfish', 0)
    let state = { ...startFight(fight), stamina: 50 }
    state = stepFight(fight, state, 1000, 3)
    expect(state.stamina).toBeCloseTo(50 + fight.regen, 5)
    expect(warned(fight, state)).toBe(false)
    state = { ...state, ms: fight.limitMs - CONFIG.fishing.fight.warnMs }
    expect(warned(fight, state)).toBe(true)
    state = stepFight(fight, state, CONFIG.fishing.fight.warnMs, 3)
    expect(state.over).toBe(true)
    expect(warned(fight, state)).toBe(false)
    expect(stepFight(fight, state, 10, 3)).toBe(state)
    expect(pressFight(fight, state, 'left')).toBe(state)
  })

  it('fishes with the best rod in the pack, each better than the last', () => {
    expect(rodIn({})).toBeNull()
    expect(rodIn({ 'fishing-rod': 1 })).toBe(BOX_ROD)
    expect(rodIn({ 'fishing-rod': 1, 'ugly-stik': 1, 'zebco-33': 2 })).toBe(
      'ugly-stik'
    )
    expect(rodIn({ 'g-loomis': 0, 'zebco-33': 1 })).toBe('zebco-33')
    // Every rod on the rack is an item on a shelf, dearer as it is better.
    const racked = Object.keys(RODS).filter((rod) => rod !== BOX_ROD)
    const prices = racked.map((rod) => itemById(rod)?.price ?? 0)
    expect(prices).toEqual([5000, 10000, 100000])
    for (let i = 1; i < racked.length; i++) {
      expect(rodStats(racked[i]).power).toBeGreaterThan(
        rodStats(racked[i - 1]).power
      )
    }
    expect(rodStats('nope')).toEqual(RODS[BOX_ROD])
    expect(reachOf(30, 'ugly-stik')).toBe(30 + RODS['ugly-stik'].power * 10)
  })

  it('fights and lands as if the skill were higher with a better rod', () => {
    const plain = fightOf('channel-catfish', 0)
    const loomis = fightOf('channel-catfish', 0, 'g-loomis')
    expect(loomis.silver).toBeGreaterThan(plain.silver)
    expect(loomis.regen).toBeLessThan(plain.regen)
    expect(loomis.limitMs).toBe(
      Math.round(plain.limitMs * RODS['g-loomis'].clock)
    )
    expect(loomis.goldChance).toBeGreaterThan(plain.goldChance)
    // A bass 40 levels up is lost on the box's rod and landed on the
    // Loomis, on the same roll.
    expect(landOf('largemouth-bass', 0, 0.5)).toBe('snap')
    expect(landOf('largemouth-bass', 0, 0.5, 'g-loomis')).toBe('landed')
  })

  it('hooks the shadow carp on a slurm, and nothing else on one', () => {
    const kinds = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const h = hookOf('slurm', NOON, 1000, i / 1000)
      kinds.add(h?.kind ?? 'nothing')
    }
    expect(kinds).toEqual(new Set(['nothing', 'shadow-carp']))
    // And never on any other bait.
    for (let i = 0; i < 1000; i++) {
      expect(hookOf('nightcrawlers', NIGHT, 1000, i / 1000)?.kind).not.toBe(
        'shadow-carp'
      )
    }
  })

  it('has room in the jar for each one carried', () => {
    const { holds } = CONFIG.fishing.jar
    expect(jarRoom({})).toBe(false)
    expect(jarRoom({ slurm: 1 })).toBe(false)
    expect(jarRoom({ 'slurm-jar': 1, slurm: holds - 1 })).toBe(true)
    expect(jarRoom({ 'slurm-jar': 1, slurm: holds })).toBe(false)
    expect(jarRoom({ 'slurm-jar': 2, slurm: holds })).toBe(true)
  })

  it('lands a fish within ten levels, loses one past fifty', () => {
    expect(landChance(10, 0)).toBe(1)
    expect(landChance(30, 0)).toBeCloseTo(0.5)
    expect(landChance(60, 0)).toBe(0)
    expect(landOf('bluegill', 0, 0.999)).toBe('landed')
    expect(landOf('yellow-perch', 0, 0.99)).toBe('skill')
    expect(landOf('channel-catfish', 0, 0)).toBe('snap')
    expect(landOf('nope', 0, 0.5)).toBe('landed')
  })

  it('raises the skill most often about eleven levels up, never at or below it', () => {
    expect(skillUpChance(5, 50)).toBe(0)
    expect(skillUpChance(4, 50)).toBe(0)
    expect(skillUpChance(60, 0)).toBe(0)
    const at11 = skillUpChance(41, 300)
    expect(at11).toBeCloseTo(0.6)
    expect(skillUpChance(35, 300)).toBeLessThan(at11)
    expect(skillUpChance(47, 300)).toBeLessThan(at11)
    // Never under 4%, and a beginner's comes a little more often.
    expect(skillUpChance(80, 300)).toBeCloseTo(0.04)
    expect(skillUpChance(11, 0)).toBeCloseTo(0.7)
  })

  it('raises the skill a tenth, more ten levels up, and holds the cap', () => {
    expect(skillAfter('bluegill', 0, 1, 0)).toBe(0)
    expect(skillAfter('pumpkinseed', 0, 0, 0.99)).toBe(1)
    expect(skillAfter('yellow-perch', 0, 0, 0.99)).toBe(3)
    expect(skillAfter('yellow-perch', 0, 0, 0)).toBe(1)
    expect(skillAfter('empty-can', 0, 0, 0.99)).toBe(0)
    expect(skillAfter('nope', 5, 0, 0)).toBe(5)
    expect(skillAfter('ghost-catfish', 940, 0, 0)).toBe(941)
    const capped = { ...CONFIG.fishing, skillCap: 940 }
    expect(skillAfter('ghost-catfish', 940, 0, 0, capped)).toBe(940)
  })

  it('counts the day and tires at its limit', () => {
    const angler = counted(FRESH_ANGLER, NOON)
    expect(angler.day).toBe(dayKey(NOON))
    expect(caughtToday(angler, NOON)).toBe(1)
    expect(caughtToday(angler, NOON + 24 * 3600_000)).toBe(0)
    const worn = { ...angler, caught: CONFIG.fishing.perDay }
    expect(tired(worn, NOON)).toBe(true)
    expect(tired(worn, NOON + 24 * 3600_000)).toBe(false)
    expect(counted(worn, NOON + 24 * 3600_000).caught).toBe(1)
  })

  it('digs a few nightcrawlers, once a cooldown', () => {
    const { min, max, cooldownSeconds } = CONFIG.fishing.dig
    expect(dugOf(0)).toBe(min)
    expect(dugOf(0.999)).toBe(max)
    expect(canDig(FRESH_ANGLER, 0)).toBe(true)
    const dug = dugAt(FRESH_ANGLER, 1000)
    expect(canDig(dug, 1000)).toBe(false)
    expect(canDig(dug, 1000 + cooldownSeconds * 1000)).toBe(true)
  })

  it('puts the angler on the wire and reads it back', () => {
    const angler = { skill: 42, day: dayKey(NOON), caught: 3, digAt: 9 }
    const wire = anglerWire(angler, NOON)
    expect(wire).toEqual({
      skill: 42,
      caught: 3,
      perDay: CONFIG.fishing.perDay,
      digAt: 9,
    })
    expect(toAnglerWire(wire)).toEqual(wire)
    expect(toAnglerWire(null)).toBeNull()
    expect(toAnglerWire({ ...wire, skill: -1 })).toBeNull()
    expect(toAnglerWire({ ...wire, caught: 1.5 })).toBeNull()
    expect(toAnglerWire({ ...wire, digAt: 'soon' })).toBeNull()
  })

  it('holds a line from when it was heard', () => {
    expect(lineOutOf({ bitesIn: 500, hook: null }, 100)).toEqual({
      hook: null,
      bitesAt: 600,
    })
    expect(lineOutOf({ bitesIn: -5, hook: null }, 100).bitesAt).toBe(100)
  })

  describe('the pond', () => {
    // A square pond 100 m across round (500, 0), and a far one.
    const square: Water = {
      k: 'area',
      n: '',
      p: [
        [450, -50],
        [550, -50],
        [550, 50],
        [450, 50],
      ],
    }
    const far: Water = { ...square, p: square.p.map(([u, v]) => [u + 5000, v]) }
    const stream: Water = {
      k: 'line',
      n: '',
      p: [
        [0, 10],
        [10, 10],
        [20, 10],
      ],
    }
    const toWorld = (u: number, v: number) => ({ x: u, z: v })

    it('is the nearest water area in reach, its landing on the near shore', () => {
      const pond = pondOf([stream, far, square], toWorld, { x: 0, z: 0 })!
      expect(pond.x).toBe(500)
      expect(pond.z).toBe(0)
      expect(pond.radius).toBeCloseTo(
        Math.hypot(50, 50) + CONFIG.fishing.pond.margin
      )
      expect(pond.landing.x).toBeCloseTo(450 - CONFIG.fishing.pond.landingBack)
      expect(pond.landing.z).toBeCloseTo(0)
      expect(pond.shore).toHaveLength(4)
      expect(shoreDistance(pond.shore, { x: 440, z: 0 })).toBeCloseTo(10)
    })

    it('is none with no water area in reach', () => {
      expect(pondOf([far, stream], toWorld, { x: 0, z: 0 })).toBeNull()
    })

    it('holds a raider inside any haven, and finds the nearest landing', () => {
      const pond = pondOf([square], toWorld, { x: 0, z: 0 })!
      const other = pondOf([far], toWorld, { x: 5000, z: 0 }, { x: 0, z: 0 })!
      expect(inPond([pond, other], { x: 500, z: 0 })).toBe(true)
      expect(inPond([pond, other], { x: 5500, z: 0 })).toBe(true)
      expect(inPond([pond], pond.landing)).toBe(true)
      expect(inPond([pond, other], { x: 0, z: 0 })).toBe(false)
      expect(inPond([], { x: 500, z: 0 })).toBe(false)
      // The far pond's landing faces the Citgo, on its near shore.
      expect(other.landing.x).toBeLessThan(5450)
      expect(nearestLanding([pond, other], { x: 5600, z: 0 })).toBe(
        other.landing
      )
      expect(nearestLanding([pond, other], { x: 0, z: 0 })).toBe(pond.landing)
      expect(nearestLanding([], { x: 0, z: 0 })).toBeNull()
    })

    it('finds every firefly pond from the spawn Citgo, each once', () => {
      // A Citgo at the origin facing +x: the first find is at it, the
      // second out past the maze, station-local.
      const cfg = {
        ...CONFIG.fishing,
        ponds: [
          { find: { x: 0, z: 0 } },
          { find: { x: 5000, z: 0 } },
          { find: { x: 10, z: 0 } },
        ],
      }
      const station = { x: 0, z: 0, yaw: 0 }
      const ponds = pondsOf([square, far], toWorld, station, cfg)
      expect(ponds.map((p) => p.x)).toEqual([500, 5500])
      // Turned a quarter, the second find falls on no water.
      const turned = pondsOf(
        [square, far],
        toWorld,
        { ...station, yaw: 1.5 },
        cfg
      )
      expect(turned.map((p) => p.x)).toEqual([500])
    })

    it('reads a place off the wire', () => {
      const place = { x: 1, z: 2, radius: 3, landing: { x: 4, z: 5 } }
      expect(toPondPlace(place)).toEqual(place)
      expect(toPondPlace({ ...place, extra: true })).toEqual(place)
      expect(toPondPlace({ ...place, radius: 0 })).toBeNull()
      expect(toPondPlace({ ...place, landing: null })).toBeNull()
      expect(toPondPlace({ ...place, landing: { x: 'a', z: 1 } })).toBeNull()
      expect(toPondPlace({ ...place, x: Infinity })).toBeNull()
      expect(toPondPlace('pond')).toBeNull()
    })
  })
})
