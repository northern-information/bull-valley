import { describe, expect, it } from 'vitest'
import { heartPoint, theMaze } from '../../src/caretaker.ts'
import { CONFIG } from '../../src/config.ts'
import { dayKey, nextMidnight } from '../../src/daily.ts'
import { costIn, freshDealerStock, goodOf } from '../../src/dealer.ts'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { contentsOf, getItem } from '../../src/items.ts'
import { LADDER_FOOT, LADDER_TOP, lookoutToWorld } from '../../src/lookout.ts'
import { nextChange } from '../../src/marx.ts'
import { mazeToWorld } from '../../src/maze.ts'
import { PROTOCOL_VERSION } from '../../src/protocol.ts'
import { mulberry32 } from '../../src/rng.ts'
import {
  citgoVisits,
  createShadows,
  forecourtMends,
  headlightsAt,
  placeCaretaker,
  placeShadowman,
  seeHeadlights,
  shadowmenNear,
  shadowRaiders,
  stepShadows,
} from '../../src/shadowstep.ts'
import {
  BUSHES,
  citgosFor,
  corpsesOf,
  createValley,
  creditedWith,
  dailyFor,
  geometrieFor,
  healthFor,
  placeOf,
  reduce,
  restoreValley,
  toWire,
  wakeAt,
} from '../../src/sharedworld.ts'
import { FRESH_STAND, standXp } from '../../src/stand.ts'
import { UNDERCROFT } from '../../src/undercroft.ts'
import { dryMap } from '../../src/waterside.ts'
import { unitsLeft } from './stock.ts'
import type { CosmeticId } from '../../src/cosmetics.ts'
import type { Inventory } from '../../src/interfaces.ts'
import type { PickupKind } from '../../src/items.ts'
import type {
  DailyMessage,
  PeerStateWire,
  PickupSpec,
  WorldMessage,
} from '../../src/protocol.ts'
import type { QuestStage } from '../../src/quests.ts'
import type { Placed } from '../../src/shadowstep.ts'
import type { Valley, ValleyAction } from '../../src/sharedworld.ts'
import type { StandLedger } from '../../src/stand.ts'

// What a build placed: a pack of Marlboros, two joints, then cabbages.
// Everything a test reaches for stands at the origin, and every raider is
// heard there (HERE) unless a test says otherwise.
const HERE = { x: 0, z: 0 }
const PICKUPS: PickupSpec[] = [
  { kind: 'marlboro', count: 3, ...HERE },
  { kind: 'joints', count: 2, ...HERE },
  ...Array.from({ length: 68 }, () => ({ kind: 'cabbage', count: 1, ...HERE })),
]
// The spawn Citgo's bush and the maze's ring, all at the origin.
const BUSH_SPOTS = Array.from({ length: 7 }, () => HERE)
const STATIONS = 3
const HAVENS = [
  { x: 0, z: 0 },
  { x: 2000, z: 0 },
  { x: 0, z: 2000 },
]
// The middle of each station's Citgo portal ring (rule 28).
const RINGS = HAVENS.map(({ x, z }) => ({ x: x + 2, z: z + 14 }))
const METRES = { width: 15059, height: 15038 }
// Where a build with a corn maze puts it (rule 13). The default join's
// build has none, so the shadowmen's tests step only shadowmen.
const MAZE = { x: 3000, z: 3000, yaw: 0 }
// Where the truck parks, and its joyride: ten minutes out and home.
const ROUTES = { home: { x: 10, z: 10 }, joyrideMs: 600_000 }
// Where the Cabbage Stand stands (rule 23).
const STAND = { x: 5, z: -20 }
const DEALER = { x: -30, z: -60 }
// Noon, Central time, so a test has the afternoon before the day turns.
const T0 = Date.UTC(2026, 9, 7, 17, 0, 0)
const SEC = 1000

// A little harness: applies actions in order, remembering who is present.
function valleyWith(...actions: ValleyAction[]) {
  let valley = createValley()
  const present: string[] = []
  let now = T0
  // Every buyer's wallet, as the valley would read it, and their pack
  // when a test says what it holds.
  let cash = 100_00
  let pack: Inventory | null = null
  let quest: { stage: QuestStage; pack: Inventory } | null = null
  const out: ReturnType<typeof reduce>[] = []
  const step = (action: ValleyAction) => {
    const ctx = {
      now,
      present: [...present],
      cash,
      ...(pack ? { holdings: { pack, cosmetics: [] } } : {}),
      ...(quest ? { quest } : {}),
    }
    const reduced = reduce(valley, action, ctx)
    valley = reduced.valley
    if (action.type === 'join' && !reduced.reject) present.push(action.id)
    if (action.type === 'leave') {
      const i = present.indexOf(action.id)
      if (i >= 0) present.splice(i, 1)
    }
    out.push(reduced)
    return reduced
  }
  for (const action of actions) step(action)
  return {
    get valley() {
      return valley
    },
    step,
    tick(ms: number) {
      now += ms
    },
    setCash(cents: number) {
      cash = cents
    },
    setPack(held: Inventory) {
      pack = held
    },
    setQuest(stage: QuestStage, held: Inventory) {
      quest = { stage, pack: held }
    },
    get now() {
      return now
    },
    last: () => out[out.length - 1],
  }
}

// Each socket id signs in as its own account unless a test says otherwise.
const join = (id: string): ValleyAction => ({
  type: 'join',
  id,
  account: `acct-${id}`,
  name: id.toUpperCase(),
  outfit: 'coleman',
  pickups: PICKUPS,
  stations: STATIONS,
  havens: HAVENS,
  metres: METRES,
  water: dryMap(METRES),
  maze: null,
  routes: ROUTES,
  stand: STAND,
  bushes: BUSH_SPOTS,
  dealer: DEALER,
  undercroft: null,
  rings: RINGS,
})

// A join as its own action shape, so a test can sign it in elsewhere.
const joinAs = (id: string) =>
  join(id) as Extract<ValleyAction, { type: 'join' }>

const leaveAs = (
  id: string,
  at: PeerStateWire | null = null
): ValleyAction => ({
  type: 'leave',
  id,
  at,
})

const reasons = (reduced: { broadcast: WorldMessage[] }) =>
  reduced.broadcast.map((m) => m.reason)

describe('rule 1: the world is persistent', () => {
  it('is opened by the first arrival, with the build it came with', () => {
    const v = valleyWith(join('a'))
    const world = v.valley.world
    expect(world).toMatchObject({
      version: PROTOCOL_VERSION,
      day: dayKey(T0),
      taken: [],
      drops: [],
      pickups: PICKUPS,
      stations: STATIONS,
      routes: ROUTES,
    })
    expect(world?.truck).toEqual({
      leg: { kind: 'parked', at: T0, from: null, leavesAt: null },
      riders: [],
    })
    expect(reasons(v.last())).toEqual(['joined'])
    expect(v.last().broadcast[0]).toMatchObject({ by: 'a' })
  })

  it('outlasts everyone leaving: the next arrival finds it as it was', () => {
    const v = valleyWith(join('a'), {
      type: 'take',
      id: 'a',
      index: 2,
      at: HERE,
    })
    v.step(leaveAs('a'))
    expect(v.valley.members).toEqual({})
    expect(v.valley.world?.taken).toEqual([2])
    v.tick(60 * SEC)
    v.step(join('b'))
    expect(v.valley.world?.taken).toEqual([2])
    expect(toWire(v.valley)?.members).toEqual([{ id: 'b', name: 'B' }])
  })

  it('turns away a build that placed something else', () => {
    const v = valleyWith(join('a'))
    const before = v.valley
    const r = v.step({
      ...join('b'),
      pickups: PICKUPS.slice(1),
    } as ValleyAction)
    expect(r.reject).toBe('stale-build')
    expect(r.valley).toBe(before)
    expect(
      v.step({ ...join('c'), stations: STATIONS + 1 } as ValleyAction).reject
    ).toBe('stale-build')
  })

  it('drops members whose sockets went without a word', () => {
    const v = valleyWith(join('a'))
    // 'a' is not among those present any more.
    const r = reduce(v.valley, join('b'), { now: T0, present: [] })
    expect(Object.keys(r.valley.members)).toEqual(['b'])
  })

  it('opens afresh only for a world stored on another protocol', () => {
    const v = valleyWith(join('a'))
    const stored = { ...v.valley, members: {} }
    expect(restoreValley(stored)).toEqual(stored)
    const older = {
      ...stored,
      dailies: { acct: '2026-10-05' },
      world: { ...stored.world, version: PROTOCOL_VERSION - 1 },
    } as Valley
    expect(restoreValley(older)).toMatchObject({
      world: null,
      dailies: { acct: '2026-10-05' },
    })
    // An older build's raid, its berries kept.
    const raid = { epoch: 3, raid: { phase: 'OUT' }, dailies: { b: 'x' } }
    expect(restoreValley(raid as unknown as Valley)).toMatchObject({
      world: null,
      dailies: { b: 'x' },
      places: {},
    })
  })

  it('wakes for the truck or the day, and not with nobody here', () => {
    const v = valleyWith(join('a'))
    expect(wakeAt(v.valley, v.now)).toBe(T0 + CONFIG.truck.readSeconds * SEC)
    expect(v.last().alarm).toBe(T0 + CONFIG.truck.readSeconds * SEC)
    v.step(leaveAs('a'))
    expect(v.last().alarm).toBeNull()
    expect(wakeAt(createValley(), T0)).toBeNull()
  })
})

describe('rule 2: a raider comes back where they stood', () => {
  const at = (over: Partial<PeerStateWire> = {}): PeerStateWire => ({
    x: 120,
    y: 3,
    z: -40,
    yaw: 1.5,
    pitch: 0,
    pose: 'stand',
    riding: false,
    light: false,
    ...over,
  })

  it('keeps where the account last stood on foot', () => {
    const v = valleyWith(join('a'))
    expect(placeOf(v.valley, 'acct-a')).toBeNull()
    v.step(leaveAs('a', at()))
    expect(placeOf(v.valley, 'acct-a')).toEqual({ x: 120, z: -40, yaw: 1.5 })
  })

  it('keeps nothing new for a raider who left riding, or unheard', () => {
    const v = valleyWith(join('a'), leaveAs('a', at()))
    v.step(join('a'))
    v.step(leaveAs('a', at({ x: 0, riding: true })))
    expect(placeOf(v.valley, 'acct-a')).toEqual({ x: 120, z: -40, yaw: 1.5 })
    v.step(join('a'))
    v.step({ type: 'board', id: 'a', at: HERE })
    v.step(leaveAs('a', at({ x: 5 })))
    expect(placeOf(v.valley, 'acct-a')?.x).toBe(120)
    v.step(join('a'))
    v.step(leaveAs('a', null))
    expect(placeOf(v.valley, 'acct-a')?.x).toBe(120)
  })
})

describe("rule 3: Marx's truck is the valley's", () => {
  const read = CONFIG.truck.readSeconds * SEC
  const donuts = CONFIG.truck.donutSeconds * SEC

  it('goes to his donuts on the clock, and says so', () => {
    const v = valleyWith(join('a'))
    v.tick(read)
    const r = v.step({ type: 'clock' })
    expect(reasons(r)).toEqual(['donuts'])
    expect(v.valley.world?.truck.leg).toEqual({ kind: 'donuts', at: T0 + read })
    expect(r.alarm).toBe(T0 + read + donuts)
  })

  it('comes home from his donuts for an arrival', () => {
    const v = valleyWith(join('a'))
    v.tick(read + 30 * SEC)
    v.step(join('b'))
    expect(reasons(v.last())).toEqual(['donuts', 'joined'])
    expect(v.valley.world?.truck.leg).toEqual({
      kind: 'parked',
      at: v.now,
      from: { kind: 'donuts', at: T0 + read, cut: v.now },
      leavesAt: null,
    })
  })

  it('counts down once someone is in the bed, then takes them on the joyride', () => {
    const v = valleyWith(join('a'), join('b'))
    const r = v.step({ type: 'board', id: 'a', at: HERE })
    expect(reasons(r)).toEqual(['boarded'])
    const leaves = T0 + CONFIG.truck.countdownSeconds * SEC
    expect(r.broadcast[0].world?.truck).toEqual({
      leg: { kind: 'parked', at: T0, from: null, leavesAt: leaves },
      riders: ['a'],
    })
    expect(r.alarm).toBe(leaves)
    v.tick(CONFIG.truck.countdownSeconds * SEC)
    expect(reasons(v.step({ type: 'clock' }))).toEqual(['depart'])
    expect(v.valley.world?.truck).toEqual({
      leg: { kind: 'joyride', at: leaves },
      riders: ['a'],
    })
    v.tick(ROUTES.joyrideMs)
    expect(reasons(v.step({ type: 'clock' }))).toEqual(['home'])
    expect(v.valley.world?.truck.riders).toEqual([])
  })

  it('drives the bed where the first one in picked once the countdown runs out', () => {
    const to = { x: 800, z: -600 }
    const v = valleyWith(
      join('a'),
      join('b'),
      { type: 'board', id: 'a', at: HERE },
      { type: 'board', id: 'b', at: HERE }
    )
    expect(v.step({ type: 'charter', id: 'b', to }).reply?.reason).toBe(
      'not-first'
    )
    const r = v.step({ type: 'charter', id: 'a', to })
    expect(reasons(r)).toEqual(['charted'])
    const leaves = T0 + CONFIG.truck.countdownSeconds * SEC
    expect(v.valley.world?.truck.leg).toMatchObject({
      kind: 'parked',
      leavesAt: leaves,
      dest: to,
    })
    v.tick(CONFIG.truck.countdownSeconds * SEC)
    expect(reasons(v.step({ type: 'clock' }))).toEqual(['depart'])
    expect(v.valley.world?.truck.leg).toEqual({
      kind: 'charter',
      at: leaves,
      to,
    })
    // Let off there, both earn the ride.
    const truck = v.valley.world?.truck
    const due = truck ? nextChange(truck, ROUTES) : null
    v.tick((due ?? v.now) - v.now)
    const there = v.step({ type: 'clock' })
    expect(reasons(there)).toEqual(['dropoff'])
    expect(v.valley.world?.truck.riders).toEqual([])
    expect(there.xp).toEqual([
      { account: 'acct-a', source: 'ride' },
      { account: 'acct-b', source: 'ride' },
    ])
  })

  it('leaves as soon as the pick is made with no one else in the valley', () => {
    const v = valleyWith(join('a'), { type: 'board', id: 'a', at: HERE })
    const r = v.step({ type: 'charter', id: 'a', to: null })
    expect(reasons(r)).toEqual(['charted', 'depart'])
    expect(v.valley.world?.truck.leg).toEqual({ kind: 'joyride', at: T0 })
    expect(r.alarm).toBe(T0 + ROUTES.joyrideMs)
  })

  it('refuses a charter off the map, or from anyone not in the bed', () => {
    const v = valleyWith(join('a'), join('b'), {
      type: 'board',
      id: 'a',
      at: HERE,
    })
    const off = { x: METRES.width, z: 0 }
    expect(v.step({ type: 'charter', id: 'a', to: off }).reply?.reason).toBe(
      'off-map'
    )
    expect(v.step({ type: 'charter', id: 'b', to: null }).reply?.reason).toBe(
      'not-first'
    )
    expect(
      v.step({ type: 'charter', id: 'nobody', to: null }).reply?.reason
    ).toBe('not-in-valley')
  })

  it('lets a raider out of the bed, and says why it will not let them in', () => {
    const v = valleyWith(join('a'), { type: 'board', id: 'a', at: HERE })
    expect(v.step({ type: 'board', id: 'a', at: HERE }).reply).toEqual({
      type: 'nack',
      re: 'board',
      reason: 'aboard',
    })
    expect(reasons(v.step({ type: 'hop-out', id: 'a' }))).toEqual([
      'hopped-out',
    ])
    expect(v.valley.world?.truck.leg).toMatchObject({ leavesAt: null })
    expect(v.step({ type: 'hop-out', id: 'a' }).reply?.reason).toBe(
      'not-aboard'
    )
    expect(
      v.step({ type: 'board', id: 'nobody', at: HERE }).reply?.reason
    ).toBe('not-in-valley')
  })

  it('takes a raider who leaves out of the bed', () => {
    const v = valleyWith(join('a'), { type: 'board', id: 'a', at: HERE })
    v.step(leaveAs('a'))
    expect(v.valley.world?.truck.riders).toEqual([])
  })

  it('hurries the next change for a dev', () => {
    const v = valleyWith(join('a'), { type: 'board', id: 'a', at: HERE })
    const r = v.step({ type: 'hurry', seconds: 0 })
    expect(reasons(r)).toEqual(['hurry', 'depart'])
    expect(v.valley.world?.truck.leg.kind).toBe('joyride')
    expect(
      reduce(
        createValley(),
        { type: 'hurry', seconds: 1 },
        {
          now: T0,
          present: [],
        }
      ).reply?.reason
    ).toBe('no-world')
  })

  it('opens the world afresh on a dev reset', () => {
    const v = valleyWith(join('a'), {
      type: 'take',
      id: 'a',
      index: 0,
      at: HERE,
    })
    const r = v.step({ type: 'reset' })
    expect(reasons(r)).toEqual(['reset'])
    expect(r.broadcast[0].world).toBeNull()
    v.step(join('b'))
    expect(v.valley.world?.taken).toEqual([])
  })
})

describe('rule 4: pickups go to the first to ask', () => {
  it('gives a pickup in a walled room only to a raider standing in it', () => {
    // A room four metres square round the origin, its door no matter.
    const within = [
      { x: -2, z: -2 },
      { x: 2, z: -2 },
      { x: 2, z: 2 },
      { x: -2, z: 2 },
    ]
    const v = valleyWith({
      ...joinAs('a'),
      pickups: PICKUPS.map((spec, i) => (i === 0 ? { ...spec, within } : spec)),
    })
    // A step through the wall, well in reach.
    const outside = { x: 3, z: 0 }
    expect(
      v.step({ type: 'take', id: 'a', index: 0, at: outside }).reply?.reason
    ).toBe('too-far')
    expect(
      v.step({ type: 'take', id: 'a', index: 0, at: null }).reply?.reason
    ).toBe('no-position')
    // Anything not in a room is held to reach alone.
    expect(
      v.step({ type: 'take', id: 'a', index: 1, at: outside }).broadcast[0]
    ).toMatchObject({ reason: 'taken', index: 1 })
    const inside = { x: 1, z: 0.5 }
    expect(
      v.step({ type: 'take', id: 'a', index: 0, at: inside }).broadcast[0]
    ).toMatchObject({ reason: 'taken', index: 0 })
  })

  it('gives the pickup to the first and refuses the rest', () => {
    const v = valleyWith(join('a'), join('b'))
    const r = v.step({ type: 'take', id: 'a', index: 0, at: HERE })
    expect(r.broadcast[0]).toMatchObject({ reason: 'taken', by: 'a', index: 0 })
    expect(v.step({ type: 'take', id: 'b', index: 0, at: HERE }).reply).toEqual(
      {
        type: 'nack',
        re: 'take',
        reason: 'gone',
        index: 0,
      }
    )
    expect(
      v.step({ type: 'take', id: 'b', index: 999, at: HERE }).reply?.reason
    ).toBe('no-such-pickup')
    expect(
      v.step({ type: 'take', id: 'z', index: 1, at: HERE }).reply?.reason
    ).toBe('not-in-valley')
  })
})

describe("the valley's reach", () => {
  // Further than any reach from the origin, where everything stands.
  const far = { x: 500, z: 500 }
  const reach = CONFIG.valleyReach

  it('gives a pickup, a drop, a berry or a body only to a raider in reach', () => {
    const v = valleyWith(join('a'), join('b'), {
      type: 'drop',
      id: 'b',
      kind: 'joints',
      count: 1,
      at: { x: 0, z: 0, yaw: 0 },
    })
    v.step({
      type: 'fall',
      id: 'a',
      items: { marlboro: 1 },
      at: { x: 0, z: 0, yaw: 0 },
    })
    const refusals = (at: { x: number; z: number } | null) => [
      v.step({ type: 'take', id: 'a', index: 0, at }).reply?.reason,
      v.step({ type: 'take-drop', id: 'a', drop: 0, at }).reply?.reason,
      v.step({ type: 'collect', id: 'a', bush: 0, at }).reply?.reason,
      v.step({ type: 'loot', id: 'a', corpse: 0, at }).reply?.reason,
    ]
    expect(refusals(far)).toEqual(['too-far', 'too-far', 'too-far', 'too-far'])
    expect(refusals(null)).toEqual([
      'no-position',
      'no-position',
      'no-position',
      'no-position',
    ])
    // Just inside the reach is fine.
    const near = { x: reach.item - 0.5, z: 0 }
    expect(refusals(near)).toEqual([undefined, undefined, undefined, undefined])
    expect(v.valley.world?.taken).toEqual([0])
    expect(v.valley.corpses).toEqual([])
  })

  it("sells only on the station's lot", () => {
    const v = valleyWith(join('a'))
    const buy = (station: number, at: { x: number; z: number } | null) =>
      v.step({ type: 'buy', id: 'a', station, kind: 'pbr', unit: 0, at }).reply
        ?.reason
    expect(buy(1, HERE)).toBe('too-far')
    expect(buy(0, far)).toBe('too-far')
    expect(buy(0, null)).toBe('no-position')
    expect(
      buy(1, { x: HAVENS[1].x + CONFIG.stash.stationReach - 1, z: 0 })
    ).toBe(undefined)
  })

  it('lets a raider into the bed only beside the truck, and whistles only from where they stand', () => {
    const v = valleyWith(join('a'), join('b'))
    expect(v.step({ type: 'board', id: 'a', at: far }).reply?.reason).toBe(
      'too-far'
    )
    expect(v.step({ type: 'board', id: 'a', at: null }).reply?.reason).toBe(
      'no-position'
    )
    // Parked at home: in reach of the lot.
    expect(
      v.step({ type: 'board', id: 'a', at: { x: ROUTES.home.x + 5, z: 0 } })
        .reply
    ).toBeUndefined()
    v.step({ type: 'hop-out', id: 'a' })
    expect(
      v.step({ type: 'call', id: 'b', from: ROUTES.home, at: null }).reply
        ?.reason
    ).toBe('no-position')
    // The whistle comes to where the valley heard the whistler, and the
    // drive is reckoned from where the client says the truck is, unless
    // that is too far from home to believe.
    const beyond = { x: ROUTES.home.x + reach.callFrom + 1, z: ROUTES.home.z }
    v.step({ type: 'call', id: 'b', from: beyond, at: far })
    expect(v.valley.world?.truck.leg).toMatchObject({
      kind: 'called',
      from: ROUTES.home,
      to: far,
    })
  })
})

describe('rule 5: the whistle', () => {
  const from = { x: 10, z: 10 }
  const to = { x: 400, z: 900 }

  it('brings the empty truck to the whistler, and takes them home', () => {
    const v = valleyWith(join('a'), join('b'))
    const r = v.step({ type: 'call', id: 'a', from, at: to })
    expect(r.broadcast[0]).toMatchObject({ reason: 'called', by: 'a' })
    expect(v.step({ type: 'call', id: 'b', from, at: to }).reply?.reason).toBe(
      'busy'
    )
    expect(v.step({ type: 'board', id: 'b', at: to }).reply?.reason).toBe(
      'not-yours'
    )
    v.tick(90 * SEC)
    // The bed is where the truck came, not at the Citgo.
    expect(v.step({ type: 'board', id: 'a', at: HERE }).reply?.reason).toBe(
      'too-far'
    )
    expect(reasons(v.step({ type: 'board', id: 'a', at: to }))).toEqual([
      'ferry',
    ])
    expect(v.valley.world?.truck.leg).toMatchObject({ kind: 'ferry', from, to })
  })

  it('sends the truck home when its whistler leaves', () => {
    const v = valleyWith(join('a'), { type: 'call', id: 'a', from, at: to })
    v.step(leaveAs('a'))
    expect(v.valley.world?.truck.leg).toMatchObject({
      kind: 'parked',
      from: { kind: 'called', from, to },
    })
  })
})

describe('rule 6: the day turns', () => {
  it('brings every pickup back, fills the shelves, and clears the drops', () => {
    const at = { x: 1, z: 2, yaw: 0 }
    const v = valleyWith(
      join('a'),
      { type: 'take', id: 'a', index: 3, at: HERE },
      { type: 'buy', id: 'a', station: 0, kind: 'pbr', unit: 0, at: HERE },
      { type: 'drop', id: 'a', kind: 'joints', count: 1, at }
    )
    v.tick(nextMidnight(v.now) - v.now - 1)
    expect(
      v.step({ type: 'clock' }).broadcast.map((m) => m.reason)
    ).not.toContain('refill')
    v.tick(1)
    const r = v.step({ type: 'clock' })
    expect(reasons(r)).toContain('refill')
    const world = v.valley.world
    expect(world?.day).toBe(dayKey(v.now))
    expect(world?.taken).toEqual([])
    expect(world?.drops).toEqual([])
    expect(unitsLeft(world?.shelves[0], 'pbr')).toBe(CONFIG.store.perItem)
    // Drop ids are never handed out twice.
    expect(world?.nextDrop).toBe(1)
  })

  it('wakes for the turn of the day when nothing else comes sooner', () => {
    const v = valleyWith(join('a'))
    v.tick(nextMidnight(v.now) - v.now - 60 * SEC)
    const r = v.step({ type: 'board', id: 'a', at: HERE })
    v.step({ type: 'hop-out', id: 'a' })
    expect(r.alarm).toBeLessThanOrEqual(nextMidnight(v.now))
  })
})

describe('rule 7: the shelves are shared', () => {
  const buy = (
    id: string,
    station = 0,
    kind = 'pbr',
    unit = 0,
    at: { x: number; z: number } | null = HERE
  ): ValleyAction => ({ type: 'buy', id, station, kind, unit, at })

  it("takes the unit picked off that station's shelf and tells everyone who bought it", () => {
    const v = valleyWith(join('a'), join('b'))
    const r = v.step(buy('a', 1, 'marlboro', 2, HAVENS[1]))
    expect(r.broadcast).toHaveLength(1)
    expect(r.broadcast[0]).toMatchObject({
      reason: 'bought',
      by: 'a',
      station: 1,
      item: 'marlboro',
    })
    expect(v.valley.world?.shelves[1].marlboro).toEqual([true, true, false])
    expect(unitsLeft(v.valley.world?.shelves[0], 'marlboro')).toBe(
      CONFIG.store.perItem
    )
    expect(r.spend).toEqual({
      account: 'acct-a',
      amount: getItem('marlboro').price,
    })
    expect(r.pack).toEqual({
      account: 'acct-a',
      kind: 'marlboro',
      delta: contentsOf('marlboro'),
    })
  })

  it('says sold out, short, or no such shelf', () => {
    const v = valleyWith(join('a'), join('b'))
    v.step(buy('a'))
    expect(v.step(buy('b')).reply).toEqual({
      type: 'nack',
      re: 'buy',
      reason: 'sold-out',
      station: 0,
      item: 'pbr',
    })
    expect(v.step(buy('a', STATIONS)).reply?.reason).toBe('no-such-shelf')
    expect(v.step(buy('a', 0, 'cabbage')).reply?.reason).toBe('no-such-shelf')
    expect(v.step(buy('z')).reply?.reason).toBe('not-in-valley')
    v.setCash(0)
    expect(v.step(buy('a', 0, 'pbr', 1)).reply?.reason).toBe('short')
  })
})

describe('rule 4, cash: a pickup of cash goes into the wallet', () => {
  it('pays the quarters in, never the pack', () => {
    const v = valleyWith({
      ...join('a'),
      pickups: [...PICKUPS, { kind: 'quarters', count: 8, ...HERE }],
    } as ValleyAction)
    const r = v.step({
      type: 'take',
      id: 'a',
      index: PICKUPS.length,
      at: HERE,
    })
    expect(r.broadcast[0]).toMatchObject({ reason: 'taken', by: 'a' })
    expect(r.earn).toEqual({ account: 'acct-a', amount: 8 * 25 })
    expect(r.pack).toBeUndefined()
    expect(r.xp).toEqual([{ account: 'acct-a', source: 'pickup' }])
  })
})

describe('rule 25: Erwin von Dutch barters', () => {
  const near = { x: DEALER.x + 1, z: DEALER.z }
  const dealAs = (
    id: string,
    kind = 'mushrooms',
    pay = 'marlboro',
    at: { x: number; z: number } | null = near
  ): ValleyAction => ({ type: 'deal', id, kind, pay, at })
  const mushrooms = goodOf('mushrooms')
  const cost = mushrooms ? (costIn(mushrooms, 'marlboro') ?? 0) : 0

  it('trades one out of his stock for the whole valley, out of the pack', () => {
    const v = valleyWith(join('a'), join('b'))
    v.setPack({ marlboro: 200 })
    expect(v.valley.world?.dealerStock).toEqual(freshDealerStock())
    const r = v.step(dealAs('a'))
    expect(r.broadcast).toHaveLength(1)
    expect(r.broadcast[0]).toMatchObject({
      reason: 'dealt',
      by: 'a',
      item: 'mushrooms',
    })
    expect(r.broadcast[0].world?.dealer.mushrooms).toBe(
      (mushrooms?.perDay ?? 0) - 1
    )
    expect(r.barter).toEqual({
      account: 'acct-a',
      give: { kind: 'marlboro', count: cost },
      take: { kind: 'mushrooms', count: 1 },
    })
    // No cash changes hands.
    expect(r.spend).toBeUndefined()
    expect(r.pack).toBeUndefined()
    expect(r.xp).toEqual([{ account: 'acct-a', source: 'purchase' }])
  })

  it('refuses from afar, aboard, sold out, short, or for what he will not take', () => {
    const v = valleyWith(join('a'), join('b'))
    v.setPack({ marlboro: 1000, cabbage: 5 })
    const reason = (r: ReturnType<typeof reduce>) => r.reply?.reason
    expect(v.step(dealAs('a', 'mushrooms', 'marlboro', null)).reply).toEqual({
      type: 'nack',
      re: 'deal',
      reason: 'too-far',
      item: 'mushrooms',
    })
    expect(
      reason(v.step(dealAs('a', 'mushrooms', 'marlboro', { x: 0, z: 0 })))
    ).toBe('too-far')
    expect(reason(v.step(dealAs('a', 'mushrooms', 'cabbage')))).toBe(
      'worthless'
    )
    expect(reason(v.step(dealAs('a', 'marlboro')))).toBe('no-such-good')
    expect(reason(v.step(dealAs('z')))).toBe('not-in-valley')
    const left = goodOf('lsd')?.perDay ?? 0
    for (let i = 0; i < left; i++) v.step(dealAs('b', 'lsd'))
    expect(reason(v.step(dealAs('a', 'lsd')))).toBe('sold-out')
    v.setPack({ marlboro: 1 })
    expect(reason(v.step(dealAs('a')))).toBe('short')
    v.step({ type: 'board', id: 'a', at: HERE })
    expect(reason(v.step(dealAs('a')))).toBe('aboard')
  })

  it('has a day of everything again when the day turns', () => {
    const v = valleyWith(join('a'))
    v.setPack({ marlboro: 200 })
    v.step(dealAs('a'))
    v.tick(24 * 60 * 60 * SEC)
    v.step({ type: 'clock' })
    expect(v.valley.world?.dealerStock).toEqual(freshDealerStock())
  })

  it('has no one to deal with in a world opened without him', () => {
    const v = valleyWith({ ...join('a'), dealer: null } as ValleyAction)
    expect(v.step(dealAs('a')).reply?.reason).toBe('no-dealer')
  })
})

describe('rule 26: the rose quest', () => {
  const heart = mazeToWorld(MAZE, heartPoint(theMaze()))
  const step = (
    id: string,
    s: 'accept' | 'lay' | 'reward',
    at: { x: number; z: number } | null
  ): ValleyAction => ({ type: 'quest', id, quest: 'rose', step: s, at })
  const near = { x: DEALER.x + 1, z: DEALER.z }

  it('takes each step where the valley last heard the raider, stage and pack together', () => {
    const v = valleyWith({ ...join('a'), maze: MAZE } as ValleyAction)
    v.setQuest('none', {})
    expect(v.step(step('a', 'accept', near)).quest).toEqual({
      account: 'acct-a',
      quest: 'rose',
      step: 'accept',
      from: 'none',
      to: 'given',
      change: { kind: 'rose', delta: 1 },
    })
    v.setQuest('given', { rose: 1 })
    expect(v.step(step('a', 'lay', near)).reply?.reason).toBe('too-far')
    expect(v.step(step('a', 'lay', heart)).quest).toMatchObject({
      from: 'given',
      to: 'laid',
      change: { kind: 'rose', delta: -1 },
    })
    v.setQuest('laid', {})
    const r = v.step(step('a', 'reward', near))
    expect(r.quest).toMatchObject({
      from: 'laid',
      to: 'done',
      change: { kind: 'vault-key', delta: 1 },
    })
    // Rule 22: the key earns quest XP.
    expect(r.xp).toEqual([{ account: 'acct-a', source: 'quest' }])
  })

  it('refuses a quest there is not, one not read, one out of turn, and from the bed', () => {
    const v = valleyWith({ ...join('a'), maze: MAZE } as ValleyAction)
    expect(v.step(step('a', 'accept', near)).reply?.reason).toBe('unavailable')
    v.setQuest('done', {})
    expect(v.step(step('a', 'accept', near)).reply?.reason).toBe('not-now')
    expect(
      v.step({
        type: 'quest',
        id: 'a',
        quest: 'lily',
        step: 'accept',
        at: near,
      }).reply?.reason
    ).toBe('no-such-quest')
    expect(v.step(step('z', 'accept', near)).reply?.reason).toBe(
      'not-in-valley'
    )
    v.setQuest('none', {})
    v.step({ type: 'board', id: 'a', at: HERE })
    expect(v.step(step('a', 'accept', near)).reply?.reason).toBe('aboard')
  })

  it('has no heart to lay it at in a world opened without the maze', () => {
    const v = valleyWith(join('a'))
    v.setQuest('given', { rose: 1 })
    expect(v.step(step('a', 'lay', heart)).reply?.reason).toBe('too-far')
  })
})

describe('rule 8: one berry a day per account, at each bush', () => {
  const collect = (
    id: string,
    bush = 0,
    at: { x: number; z: number } | null = HERE
  ): ValleyAction => ({ type: 'collect', id, bush, at })
  const daily = (r: ReturnType<typeof reduce>) => r.daily as DailyMessage

  it('gives the first ask of the day a berry, to the asker alone', () => {
    const v = valleyWith(join('a'))
    const r = v.step(collect('a'))
    expect(r.broadcast).toEqual([])
    expect(daily(r)).toEqual({
      type: 'daily',
      bush: 0,
      picked: true,
      daily: { collected: [0], resetsAt: nextMidnight(v.now) },
    })
    expect(r.pack).toEqual({ account: 'acct-a', kind: 'berries', delta: 1 })
    expect(v.valley.dailies).toEqual({ 'acct-a': dayKey(v.now) })
    const again = v.step(collect('a'))
    expect(daily(again).picked).toBe(false)
    expect(again.pack).toBeUndefined()
  })

  it('shares the berry between sockets on one account, not across accounts', () => {
    const v = valleyWith(join('a'), collect('a'))
    v.step({ ...join('a2'), account: 'acct-a' } as ValleyAction)
    expect(daily(v.step(collect('a2'))).picked).toBe(false)
    v.step(join('b'))
    expect(daily(v.step(collect('b'))).picked).toBe(true)
  })

  it("gives a berry off each of the maze's bushes too, each once a day", () => {
    const v = valleyWith(join('a'))
    for (let bush = 0; bush < BUSHES; bush++) {
      expect(daily(v.step(collect('a', bush))).picked).toBe(true)
    }
    expect(dailyFor(v.valley, 'acct-a', v.now).collected).toEqual(
      Array.from({ length: BUSHES }, (_, i) => i)
    )
    expect(daily(v.step(collect('a', 2))).picked).toBe(false)
  })

  it('has the berries back at midnight Central, and forgets yesterday', () => {
    const v = valleyWith(join('a'), collect('a'), join('b'))
    v.tick(nextMidnight(v.now) - v.now)
    expect(dailyFor(v.valley, 'acct-a', v.now).collected).toEqual([])
    expect(daily(v.step(collect('b'))).picked).toBe(true)
    expect(v.valley.dailies).toEqual({ 'acct-b': dayKey(v.now) })
  })

  it('refuses a bush that does not grow, and a stranger', () => {
    const v = valleyWith(join('a'))
    for (const bush of [BUSHES, -1, 1.5]) {
      expect(v.step(collect('a', bush)).reply?.reason).toBe('no-such-bush')
    }
    expect(v.step(collect('nobody')).reply?.reason).toBe('not-in-valley')
  })
})

describe('rule 9: Gron changes how a raider is shown', () => {
  it('renames and restyles a member, and ignores a stranger', () => {
    const v = valleyWith(join('a'))
    v.step({ type: 'appearance', id: 'a', name: 'Renamed' })
    v.step({ type: 'appearance', id: 'a', outfit: 'church' })
    expect(v.valley.members.a).toMatchObject({
      name: 'Renamed',
      outfit: 'church',
    })
    expect(toWire(v.valley)?.members).toEqual([{ id: 'a', name: 'Renamed' }])
    const before = v.valley
    expect(v.step({ type: 'appearance', id: 'z', name: 'X' }).valley).toBe(
      before
    )
  })
})

describe("rule 10: the pack is the account's", () => {
  it('puts a pickup in the pack, a cabbage included', () => {
    const v = valleyWith(join('a'))
    expect(v.step({ type: 'take', id: 'a', index: 0, at: HERE }).pack).toEqual({
      account: 'acct-a',
      kind: 'marlboro',
      delta: 3,
    })
    expect(v.step({ type: 'take', id: 'a', index: 5, at: HERE }).pack).toEqual({
      account: 'acct-a',
      kind: 'cabbage',
      delta: 1,
    })
  })

  it('takes a used unit out of the pack, and refuses what is not an item', () => {
    const v = valleyWith(join('a'))
    expect(v.step({ type: 'use', id: 'a', kind: 'joints' }).pack).toEqual({
      account: 'acct-a',
      kind: 'joints',
      delta: -1,
    })
    expect(v.step({ type: 'use', id: 'a', kind: 'sack' }).reply?.reason).toBe(
      'not-an-item'
    )
    expect(v.step({ type: 'use', id: 'z', kind: 'joints' }).reply?.reason).toBe(
      'not-in-valley'
    )
  })
})

describe('rule 14: Moab trades cosmetics for gold', () => {
  const trade = (id: string, offer = 'flaming-halo'): ValleyAction => ({
    type: 'trade',
    id,
    offer,
  })
  const carrying = (gold: number, cosmetics: CosmeticId[] = []) => ({
    pack: { ...STARTING_INVENTORY, 'gold-bullion': gold },
    cosmetics,
  })
  const tradeWith = (
    v: ReturnType<typeof valleyWith>,
    action: ValleyAction,
    holdings?: ReturnType<typeof carrying>
  ) => reduce(v.valley, action, { now: v.now, present: ['a'], holdings })

  it('trades the Flaming Halo for one troy ounce of gold, and tells no one', () => {
    const v = valleyWith(join('a'))
    const r = tradeWith(v, trade('a'), carrying(1))
    expect(r.reply).toBeUndefined()
    expect(r.broadcast).toEqual([])
    expect(r.trade).toEqual({
      account: 'acct-a',
      cosmetic: 'flaming-halo',
      price: { kind: 'gold-bullion', count: 1 },
    })
    expect(r.valley).toEqual(v.valley)
  })

  it('says short, owned, no such offer, or not in the valley', () => {
    const v = valleyWith(join('a'))
    const reason = (action: ValleyAction, holdings = carrying(1)) =>
      tradeWith(v, action, holdings).reply?.reason
    expect(reason(trade('a'), carrying(0))).toBe('short')
    expect(reason(trade('a'), carrying(3, ['flaming-halo']))).toBe('owned')
    expect(reason(trade('a', 'golden-crown'))).toBe('no-such-offer')
    expect(reason(trade('z'))).toBe('not-in-valley')
    expect(tradeWith(v, trade('a')).reply).toEqual({
      type: 'nack',
      re: 'trade',
      reason: 'unavailable',
    })
    expect(tradeWith(v, trade('a'), carrying(0)).trade).toBeUndefined()
  })
})

describe('rule 28: Citgos, and Citgo portals', () => {
  // Far out in the valley, facing -z.
  const far = { x: 500, z: 500, yaw: 0 }
  const open = (id: string, where: typeof far | null = far): ValleyAction => ({
    type: 'open-portal',
    id,
    at: where,
  })
  const at = (station: number) => ({ id: '', ...HAVENS[station] })
  const life = CONFIG.portal.lifeSeconds * SEC
  const standing = (x: number, z: number, riding = false): PeerStateWire => ({
    x,
    y: 0,
    z,
    yaw: 0,
    pitch: 0,
    pose: 'stand',
    riding,
    light: false,
  })

  it('says who stands at a Citgo not yet their last', () => {
    const v = valleyWith(join('a'), join('b'), join('c'), join('d'))
    const placed: Placed[] = [
      { id: 'a', at: standing(HAVENS[1].x + 5, HAVENS[1].z) },
      { id: 'b', at: standing(HAVENS[1].x, HAVENS[1].z, true) },
      { id: 'c', at: standing(900, 900) },
      { id: 'd', at: null },
    ]
    expect(citgoVisits(v.valley, placed)).toEqual([{ id: 'a', station: 1 }])
    v.step({ type: 'visit', id: 'a', station: 1 })
    expect(citgoVisits(v.valley, placed)).toEqual([])
  })

  it('pays a bounty and XP the first time an account stands at each Citgo past its first', () => {
    const v = valleyWith(join('a'))
    // The first, where every raider starts, pays nothing.
    const spawn = v.step({ type: 'visit', id: 'a', station: 2 })
    expect(spawn.earn).toBeUndefined()
    expect(spawn.xp).toBeUndefined()
    const first = v.step({ type: 'visit', id: 'a', station: 1 })
    expect(first.earn).toEqual({
      account: 'acct-a',
      amount: CONFIG.bounties.citgo,
    })
    expect(first.xp).toEqual([{ account: 'acct-a', source: 'citgo' }])
    v.step({ type: 'visit', id: 'a', station: 0 })
    // Back at one already found: the last moves, nothing is paid.
    const again = v.step({ type: 'visit', id: 'a', station: 1 })
    expect(again.citgos?.log.last).toBe(1)
    expect(again.earn).toBeUndefined()
    expect(again.xp).toBeUndefined()
  })

  it("writes the Citgo in the account's log once, and the last", () => {
    const v = valleyWith(join('a'))
    const r = v.step({ type: 'visit', id: 'a', station: 2 })
    expect(r.citgos).toEqual({
      account: 'acct-a',
      log: { last: 2, visited: [2] },
    })
    expect(v.step({ type: 'visit', id: 'a', station: 2 }).citgos).toBe(
      undefined
    )
    v.step({ type: 'visit', id: 'a', station: 0 })
    expect(citgosFor(v.valley, 'acct-a')).toEqual({
      last: 0,
      visited: [2, 0],
    })
    // No such station is no visit.
    expect(v.step({ type: 'visit', id: 'a', station: 9 }).citgos).toBe(
      undefined
    )
  })

  it('opens a portal ahead of the raider, its twin at their last Citgo', () => {
    const v = valleyWith(join('a'), { type: 'visit', id: 'a', station: 1 })
    const r = v.step(open('a'))
    expect(r.reply).toBeUndefined()
    expect(r.broadcast[0]).toMatchObject({
      reason: 'portal-opened',
      by: 'a',
      portal: 0,
    })
    const [portal] = r.broadcast[0].world?.portals ?? []
    expect(portal).toMatchObject({
      id: 0,
      name: 'A',
      station: 1,
      slot: 0,
      closes: T0 + life,
    })
    expect(portal.field.x).toBeCloseTo(far.x, 9)
    expect(portal.field.z).toBeCloseTo(far.z - CONFIG.portal.ahead, 9)
    expect(
      Math.hypot(portal.citgo.x - RINGS[1].x, portal.citgo.z - RINGS[1].z)
    ).toBeCloseTo(CONFIG.portal.ringRadius, 9)
    // The wire never names the account.
    expect(portal).not.toHaveProperty('account')
  })

  it('keeps one an account: a second closes the first', () => {
    const v = valleyWith(
      join('a'),
      join('b'),
      { type: 'visit', id: 'a', station: 0 },
      { type: 'visit', id: 'b', station: 0 },
      open('a'),
      open('b')
    )
    expect(v.valley.world?.portals.map((p) => [p.id, p.slot])).toEqual([
      [0, 0],
      [1, 1],
    ])
    v.step(open('a', { x: 600, z: 600, yaw: 1 }))
    expect(v.valley.world?.portals.map((p) => [p.id, p.slot])).toEqual([
      [1, 1],
      [2, 0],
    ])
  })

  it('refuses with no Citgo, at it, with no place, from the bed, or with its ring full', () => {
    const v = valleyWith(join('a'))
    expect(v.step(open('a')).reply).toEqual({
      type: 'nack',
      re: 'portal',
      reason: 'no-citgo',
    })
    v.step({ type: 'visit', id: 'a', station: 0 })
    expect(v.step(open('a', null)).reply?.reason).toBe('no-position')
    expect(v.step(open('a', { ...at(0), yaw: 0 })).reply?.reason).toBe(
      'at-citgo'
    )
    expect(v.step(open('z')).reply?.reason).toBe('not-in-valley')
    v.step({ type: 'board', id: 'a', at: HERE })
    expect(v.step(open('a')).reply?.reason).toBe('aboard')

    const ids = Array.from({ length: CONFIG.portal.slots + 1 }, (_, i) =>
      String.fromCharCode(98 + i)
    )
    const full = valleyWith(
      ...ids.flatMap((id): ValleyAction[] => [
        join(id),
        { type: 'visit', id, station: 2 },
      ])
    )
    for (const id of ids.slice(0, -1)) {
      expect(full.step(open(id)).reply).toBeUndefined()
    }
    expect(full.step(open(ids[ids.length - 1])).reply?.reason).toBe('busy')
  })

  it('wakes the valley to close it when its time is up', () => {
    const v = valleyWith(
      join('a'),
      { type: 'visit', id: 'a', station: 0 },
      open('a')
    )
    expect(wakeAt(v.valley, v.now)).toBe(T0 + life)
    v.tick(life - 1)
    expect(reasons(v.step({ type: 'clock' }))).toEqual([])
    v.tick(1)
    const r = v.step({ type: 'clock' })
    expect(reasons(r)).toEqual(['portal-closed'])
    expect(r.broadcast[0].world?.portals).toEqual([])
  })

  it('lets the portals go with a world opened afresh, but keeps the log', () => {
    const v = valleyWith(
      join('a'),
      { type: 'visit', id: 'a', station: 0 },
      open('a'),
      { type: 'reset' },
      join('b')
    )
    expect(v.valley.world?.portals).toEqual([])
    expect(citgosFor(v.valley, 'acct-a').last).toBe(0)
  })
})

describe('rule 12: raiders drop what they carry', () => {
  const at = { x: 0, z: 0, yaw: 0 }
  const drop = (
    id: string,
    kind = 'joints',
    count = 1,
    where: typeof at | null = at
  ): ValleyAction => ({ type: 'drop', id, kind, count, at: where })

  it('sets a drop down ahead of the raider, out of the pack', () => {
    const v = valleyWith(join('a'))
    const r = v.step(drop('a', 'cabbage', 2))
    expect(r.broadcast[0]).toMatchObject({
      reason: 'dropped',
      by: 'a',
      item: 'cabbage',
      drop: 0,
      count: 2,
    })
    expect(r.pack).toEqual({ account: 'acct-a', kind: 'cabbage', delta: -2 })
    const [lying] = v.valley.world?.drops ?? []
    expect(lying).toMatchObject({ id: 0, kind: 'cabbage', count: 2 })
    // Ahead of them: yaw 0 faces -z.
    expect(lying.z).toBeLessThan(at.z)
  })

  it('refuses a drop from the bed, with no place, of no item, or of nothing', () => {
    const v = valleyWith(join('a'))
    expect(v.step(drop('a', 'joints', 1, null)).reply?.reason).toBe(
      'no-position'
    )
    expect(v.step(drop('a', 'sack')).reply?.reason).toBe('not-an-item')
    expect(v.step(drop('a', 'joints', 0)).reply?.reason).toBe('nothing')
    expect(v.step(drop('z')).reply?.reason).toBe('not-in-valley')
    v.step({ type: 'board', id: 'a', at: HERE })
    expect(v.step(drop('a')).reply?.reason).toBe('aboard')
  })

  it('lets anyone take a drop up, first to ask', () => {
    const v = valleyWith(join('a'), join('b'), drop('a', 'cabbage', 3))
    const r = v.step({ type: 'take-drop', id: 'b', drop: 0, at: HERE })
    expect(r.broadcast[0]).toMatchObject({
      reason: 'drop-taken',
      by: 'b',
      item: 'cabbage',
      drop: 0,
      count: 3,
    })
    expect(r.pack).toEqual({ account: 'acct-b', kind: 'cabbage', delta: 3 })
    expect(v.valley.world?.drops).toEqual([])
    expect(
      v.step({ type: 'take-drop', id: 'a', drop: 0, at: HERE }).reply
    ).toEqual({
      type: 'nack',
      re: 'take-drop',
      reason: 'gone',
      drop: 0,
    })
  })
})

describe('rule 17: a burst shadowman leaves its tombstone', () => {
  it('stands a named tombstone a step from where each one burst', () => {
    const v = valleyWith(join('a'))
    const r = v.step({
      type: 'spill',
      spills: [{ x: 10, z: 20, kind: 'dimes', count: 7 }],
      burials: [
        { x: 10, z: 20, name: 'Mother Ostend' },
        { x: 30, z: 40, name: '' },
        { x: 50, z: 60, name: 'The Boone Creek Sexton' },
      ],
    })
    expect(reasons(r)).toEqual(['spilled'])
    const graves = v.valley.world?.graves ?? []
    expect(graves.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 0, name: 'Mother Ostend' },
      { id: 1, name: 'The Boone Creek Sexton' },
    ])
    expect(Math.hypot(graves[0].x - 10, graves[0].z - 20)).toBeCloseTo(
      CONFIG.graves.offset
    )
    expect(v.valley.world?.nextGrave).toBe(2)
    expect(r.broadcast[0].world?.graves).toEqual(graves)
  })

  it('buries without dimes, and does nothing with neither', () => {
    const v = valleyWith(join('a'))
    expect(
      reasons(
        v.step({
          type: 'spill',
          spills: [],
          burials: [{ x: 1, z: 2, name: 'Pale Draper' }],
        })
      )
    ).toEqual(['spilled'])
    expect(v.valley.world?.graves).toHaveLength(1)
    expect(
      v.step({ type: 'spill', spills: [], burials: [] }).broadcast
    ).toEqual([])
  })

  it('keeps the tombstones when the day turns', () => {
    const v = valleyWith(join('a'))
    v.step({
      type: 'spill',
      spills: [{ x: 1, z: 2, kind: 'dimes', count: 3 }],
      burials: [{ x: 1, z: 2, name: 'Widow Mason' }],
    })
    v.tick(25 * 60 * 60 * 1000)
    const r = v.step({ type: 'clock' })
    expect(reasons(r)).toContain('refill')
    expect(v.valley.world?.drops).toEqual([])
    expect(v.valley.world?.graves.map((g) => g.name)).toEqual(['Widow Mason'])
  })
})

describe('rule 18: corpse runs', () => {
  const fell = (id: string, at: { x: number; z: number; yaw: number } | null) =>
    ({
      type: 'fall',
      id,
      items: { marlboro: 12, 'gold-bullion': 1 },
      at,
    }) satisfies ValleyAction

  it('lays a body where the raider fell, with everything the pack held', () => {
    const v = valleyWith(join('a'), join('b'))
    const r = v.step(fell('a', { x: 40, z: -12, yaw: 1 }))
    expect(r.corpse).toBe(0)
    expect(v.valley.corpses).toEqual([
      {
        id: 0,
        x: 40,
        z: -12,
        yaw: 1,
        name: 'A',
        outfit: 'coleman',
        items: { marlboro: 12, 'gold-bullion': 1 },
        account: 'acct-a',
      },
    ])
    expect(r.broadcast[0]).toMatchObject({ reason: 'fell', by: 'a', corpse: 0 })
    // Everyone sees the body; no one sees what it holds, or whose it is.
    expect(r.broadcast[0].world?.corpses).toEqual([
      { id: 0, x: 40, z: -12, yaw: 1, name: 'A', outfit: 'coleman' },
    ])
    expect(corpsesOf(v.valley, 'acct-a')).toEqual([0])
    expect(corpsesOf(v.valley, 'acct-b')).toEqual([])
    // A second fall lays one body, with what the first still held.
    const again = v.step({
      type: 'fall',
      id: 'a',
      items: { marlboro: 2, cabbage: 1 },
      at: { x: 0, z: 0, yaw: 0 },
    })
    expect(again.corpse).toBe(1)
    expect(corpsesOf(v.valley, 'acct-a')).toEqual([1])
    expect(v.valley.corpses[0].items).toEqual({
      marlboro: 14,
      'gold-bullion': 1,
      cabbage: 1,
    })
    // Another account's body lies on.
    v.step(fell('b', { x: 1, z: 1, yaw: 0 }))
    expect(v.valley.corpses.map((c) => c.id)).toEqual([1, 2])
  })

  it('lays none with nothing on it, nowhere heard, or for a stranger', () => {
    const v = valleyWith(join('a'))
    expect(v.step(fell('a', null)).corpse).toBeUndefined()
    expect(
      v.step({ type: 'fall', id: 'a', items: {}, at: { x: 0, z: 0, yaw: 0 } })
        .corpse
    ).toBeUndefined()
    expect(
      v.step({
        type: 'fall',
        id: 'a',
        items: { joints: 0 },
        at: { x: 0, z: 0, yaw: 0 },
      }).corpse
    ).toBeUndefined()
    expect(v.step(fell('nobody', { x: 0, z: 0, yaw: 0 })).corpse).toBe(
      undefined
    )
    expect(v.valley.corpses).toEqual([])
  })

  it('gives the things back to the account that fell, and no one else', () => {
    const v = valleyWith(join('a'), join('b'))
    v.step(fell('a', { x: 40, z: -12, yaw: 1 }))
    const stranger = v.step({
      type: 'loot',
      id: 'b',
      corpse: 0,
      at: { x: 40, z: -12 },
    })
    expect(stranger.reply).toMatchObject({
      re: 'loot',
      reason: 'not-yours',
      corpse: 0,
    })
    expect(stranger.give).toBeUndefined()
    expect(
      v.step({ type: 'loot', id: 'a', corpse: 7, at: { x: 40, z: -12 } }).reply
    ).toMatchObject({
      reason: 'gone',
    })
    const mine = v.step({
      type: 'loot',
      id: 'a',
      corpse: 0,
      at: { x: 40, z: -12 },
    })
    expect(mine.give).toEqual({
      account: 'acct-a',
      items: { marlboro: 12, 'gold-bullion': 1 },
    })
    expect(mine.broadcast[0]).toMatchObject({
      reason: 'looted',
      by: 'a',
      corpse: 0,
    })
    expect(v.valley.corpses).toEqual([])
    expect(
      v.step({ type: 'loot', id: 'a', corpse: 0, at: { x: 40, z: -12 } }).reply
    ).toMatchObject({
      reason: 'gone',
    })
  })

  it('lets another socket on the account take it back, but not from the bed', () => {
    const v = valleyWith(join('a'), {
      ...join('a2'),
      account: 'acct-a',
    } as ValleyAction)
    v.step(fell('a', { x: 40, z: -12, yaw: 1 }))
    v.step({ type: 'board', id: 'a2', at: HERE })
    expect(
      v.step({ type: 'loot', id: 'a2', corpse: 0, at: { x: 40, z: -12 } }).reply
    ).toMatchObject({
      reason: 'aboard',
    })
    v.step({ type: 'hop-out', id: 'a2' })
    expect(
      v.step({ type: 'loot', id: 'a2', corpse: 0, at: { x: 40, z: -12 } }).give
    ).toMatchObject({
      account: 'acct-a',
    })
  })

  it('keeps the bodies through the day and a world opened afresh', () => {
    const v = valleyWith(join('a'))
    v.step(fell('a', { x: 40, z: -12, yaw: 1 }))
    v.tick(nextMidnight(T0) - T0 + SEC)
    v.step({ type: 'clock' })
    expect(v.valley.corpses).toHaveLength(1)
    const stored = { ...v.valley, world: { ...v.valley.world, version: 1 } }
    const restored = restoreValley(stored as Valley)
    expect(restored.world).toBeNull()
    expect(restored.corpses).toHaveLength(1)
    expect(restored.nextCorpse).toBe(1)
    // A valley stored before the bodies wakes with none.
    const older = restoreValley({ world: null, members: {} })
    expect(older.corpses).toEqual([])
    expect(older.nextCorpse).toBe(0)
  })

  it('refuses a loot from someone not in the valley', () => {
    const v = valleyWith(join('a'))
    v.step(fell('a', { x: 40, z: -12, yaw: 1 }))
    expect(
      v.step({ type: 'loot', id: 'nobody', corpse: 0, at: { x: 40, z: -12 } })
        .reply
    ).toMatchObject({ reason: 'not-in-valley' })
  })
})

describe('rule 19: the stash', () => {
  const at = (x: number, z: number) => ({ x, z })
  const stow = (
    id: string,
    where: { x: number; z: number } | null,
    type: 'stow' | 'unstow' = 'stow',
    kind = 'marlboro',
    count = 2
  ): ValleyAction => ({ type, id, kind, count, at: where })

  it('moves units into the locker and back at any Citgo', () => {
    const v = valleyWith(join('a'))
    // The back room of the second station.
    const r = v.step(stow('a', at(2000 - 17, 3)))
    expect(r.reply).toBeUndefined()
    expect(r.stash).toEqual({ account: 'acct-a', kind: 'marlboro', delta: 2 })
    expect(r.broadcast).toEqual([])
    expect(v.step(stow('a', at(-17, 0), 'unstow')).stash).toEqual({
      account: 'acct-a',
      kind: 'marlboro',
      delta: -2,
    })
  })

  it('opens no locker away from a Citgo, from the bed, or for a stranger', () => {
    const v = valleyWith(join('a'))
    const far = CONFIG.stash.stationReach + 1
    expect(v.step(stow('a', at(far, 0))).reply).toMatchObject({
      re: 'stow',
      reason: 'no-locker',
    })
    expect(v.step(stow('a', null, 'unstow')).reply).toMatchObject({
      re: 'unstow',
      reason: 'no-locker',
    })
    expect(v.step(stow('a', at(0, 0), 'stow', 'pebbles')).reply).toMatchObject({
      reason: 'not-an-item',
    })
    expect(
      v.step(stow('a', at(0, 0), 'stow', 'marlboro', 0)).reply
    ).toMatchObject({ reason: 'nothing' })
    expect(v.step(stow('nobody', at(0, 0))).reply).toMatchObject({
      reason: 'not-in-valley',
    })
    v.step({ type: 'board', id: 'a', at: HERE })
    expect(v.step(stow('a', at(0, 0))).reply).toMatchObject({
      reason: 'aboard',
    })
  })
})

describe('rule 23: the Cabbage Stand', () => {
  const HOUR = 60 * 60 * 1000
  const [one, two] = CONFIG.stand.levels
  const beside = { x: STAND.x + 1, z: STAND.z }
  // Tends with the account's ledger, pack and wallet as the valley read
  // them.
  const tend = (
    valley: Valley,
    action: ValleyAction,
    stand: { ledger: StandLedger; pack: Inventory; cash: number },
    now = T0
  ) => reduce(valley, action, { now, present: ['a'], stand })
  const fresh = {
    ledger: FRESH_STAND,
    pack: { cabbage: 9, berries: 2 },
    cash: 0,
  }

  it('keeps where the stand stands with the world', () => {
    expect(valleyWith(join('a')).valley.world?.stand).toEqual(STAND)
  })

  it('puts goods out of the pack on the table', () => {
    const v = valleyWith(join('a'))
    const r = tend(
      v.valley,
      { type: 'stand-stock', id: 'a', kind: 'cabbage', count: 4, at: beside },
      fresh
    )
    expect(r.reply).toBeUndefined()
    expect(r.broadcast).toEqual([])
    expect(r.stand).toEqual({
      account: 'acct-a',
      re: 'stock',
      ledger: { ...FRESH_STAND, stock: { cabbage: 4 }, since: T0 },
      items: { cabbage: 4 },
      cash: 0,
    })
  })

  it('refuses goods the pack lacks, the table has no room for, or that are not goods', () => {
    const v = valleyWith(join('a'))
    const stock = (kind: string, count: number) =>
      tend(
        v.valley,
        { type: 'stand-stock', id: 'a', kind, count, at: beside },
        fresh
      ).reply
    expect(stock('berries', 3)).toMatchObject({
      re: 'stand-stock',
      reason: 'none-left',
    })
    expect(stock('cabbage', 10)).toMatchObject({ reason: 'none-left' })
    const crowded = { ...fresh, pack: { cabbage: 99 } }
    expect(
      tend(
        v.valley,
        {
          type: 'stand-stock',
          id: 'a',
          kind: 'cabbage',
          count: one.shelf + 1,
          at: beside,
        },
        crowded
      ).reply
    ).toMatchObject({ reason: 'no-room' })
    expect(
      tend(
        v.valley,
        { type: 'stand-stock', id: 'a', kind: 'joints', count: 1, at: beside },
        { ...fresh, pack: { joints: 2 } }
      ).reply
    ).toMatchObject({ reason: 'no-room' })
  })

  it('collects what it banked on the clock into the wallet', () => {
    const v = valleyWith(join('a'))
    const ledger = { ...FRESH_STAND, stock: { cabbage: one.shelf }, since: T0 }
    const r = tend(
      v.valley,
      { type: 'stand-collect', id: 'a', at: beside },
      { ...fresh, ledger },
      T0 + 2 * HOUR
    )
    expect(r.stand).toMatchObject({
      re: 'collect',
      items: {},
      cash: 2 * one.rate,
      ledger: { since: T0 + 2 * HOUR },
    })
    // Rule 22: XP by the cents it paid.
    expect(r.xp).toEqual([
      { account: 'acct-a', source: 'stand', times: standXp(2 * one.rate) },
    ])
    // A collect worth less than a whole step of XP earns none.
    const little = tend(
      v.valley,
      { type: 'stand-collect', id: 'a', at: beside },
      { ...fresh, ledger },
      T0 + HOUR / one.rate
    )
    expect(little.stand?.cash).toBe(1)
    expect(little.xp).toBeUndefined()
    // A day later it has stopped at its cap.
    expect(
      tend(
        v.valley,
        { type: 'stand-collect', id: 'a', at: beside },
        { ...fresh, ledger },
        T0 + 24 * HOUR
      ).stand?.cash
    ).toBe(one.rate * one.capHours)
    expect(
      tend(v.valley, { type: 'stand-collect', id: 'a', at: beside }, fresh)
        .reply
    ).toMatchObject({ re: 'stand-collect', reason: 'empty' })
  })

  it('sells the next level for its price, and none past the top', () => {
    const v = valleyWith(join('a'))
    const price = two.price
    if (!price) throw new Error('priced')
    const rich = { ...fresh, pack: { ...price.items }, cash: price.cash }
    const r = tend(
      v.valley,
      { type: 'stand-upgrade', id: 'a', at: beside },
      rich
    )
    expect(r.stand).toMatchObject({
      re: 'upgrade',
      ledger: { level: 2 },
      items: price.items,
      cash: -price.cash,
    })
    expect(
      tend(
        v.valley,
        { type: 'stand-upgrade', id: 'a', at: beside },
        { ...rich, cash: price.cash - 1 }
      ).reply
    ).toMatchObject({ reason: 'short' })
    const top = { ...FRESH_STAND, level: CONFIG.stand.levels.length }
    expect(
      tend(
        v.valley,
        { type: 'stand-upgrade', id: 'a', at: beside },
        { ...rich, ledger: top }
      ).reply
    ).toMatchObject({ reason: 'top' })
  })

  it('is tended only beside it, out of the bed, by a raider in the valley', () => {
    const v = valleyWith(join('a'))
    const collect = (id: string, at: { x: number; z: number } | null) =>
      tend(v.valley, { type: 'stand-collect', id, at }, fresh).reply
    const far = { x: STAND.x + CONFIG.stand.tendReach + 1, z: STAND.z }
    expect(collect('a', far)).toMatchObject({ reason: 'no-stand' })
    expect(collect('a', null)).toMatchObject({ reason: 'no-stand' })
    expect(collect('nobody', beside)).toMatchObject({
      reason: 'not-in-valley',
    })
    // The valley that could not read the ledger tends nothing.
    expect(
      reduce(
        v.valley,
        { type: 'stand-collect', id: 'a', at: beside },
        { now: T0, present: ['a'] }
      ).reply
    ).toMatchObject({ reason: 'unavailable' })
    v.step({ type: 'board', id: 'a', at: HERE })
    expect(collect('a', beside)).toMatchObject({ reason: 'aboard' })
  })

  it('opens no stand in a world built without one', () => {
    const v = valleyWith({ ...join('a'), stand: null } as ValleyAction)
    expect(
      tend(v.valley, { type: 'stand-collect', id: 'a', at: beside }, fresh)
        .reply
    ).toMatchObject({ reason: 'no-stand' })
  })
})

describe('rule 22: XP for what a raider does', () => {
  it('earns XP for a pickup, a unit bought and the day’s berry', () => {
    const v = valleyWith(join('a'))
    expect(v.step({ type: 'take', id: 'a', index: 2, at: HERE }).xp).toEqual([
      { account: 'acct-a', source: 'pickup' },
    ])
    expect(
      v.step({
        type: 'buy',
        id: 'a',
        station: 0,
        kind: 'pbr',
        unit: 0,
        at: HERE,
      }).xp
    ).toEqual([{ account: 'acct-a', source: 'purchase' }])
    expect(v.step({ type: 'collect', id: 'a', bush: 0, at: HERE }).xp).toEqual([
      { account: 'acct-a', source: 'berry' },
    ])
  })

  it('earns nothing for what is refused, a used item, or a second berry', () => {
    const v = valleyWith(join('a'), join('b'), {
      type: 'take',
      id: 'a',
      index: 2,
      at: HERE,
    })
    expect(
      v.step({ type: 'take', id: 'b', index: 2, at: HERE }).xp
    ).toBeUndefined()
    v.setCash(0)
    expect(
      v.step({
        type: 'buy',
        id: 'a',
        station: 0,
        kind: 'pbr',
        unit: 0,
        at: HERE,
      }).xp
    ).toBeUndefined()
    v.step({ type: 'collect', id: 'a', bush: 0, at: HERE })
    expect(
      v.step({ type: 'collect', id: 'a', bush: 0, at: HERE }).xp
    ).toBeUndefined()
    expect(v.step({ type: 'use', id: 'a', kind: 'joints' }).xp).toBeUndefined()
  })

  it('earns XP for a drop the valley left, never a raider’s own', () => {
    const at = { x: 0, z: 0, yaw: 0 }
    const v = valleyWith(join('a'), join('b'))
    v.step({
      type: 'spill',
      spills: [{ x: 1, z: 2, kind: 'gold-bullion', count: 1 }],
    })
    expect(
      v.step({ type: 'take-drop', id: 'b', drop: 0, at: HERE }).xp
    ).toEqual([{ account: 'acct-b', source: 'drop' }])
    v.step({ type: 'drop', id: 'b', kind: 'gold-bullion', count: 1, at })
    expect(
      v.step({ type: 'take-drop', id: 'a', drop: 1, at: HERE }).xp
    ).toBeUndefined()
  })

  it('earns each rider XP when Marx gets home, never one who hopped out', () => {
    const v = valleyWith(
      join('a'),
      join('b'),
      join('c'),
      { type: 'board', id: 'a', at: HERE },
      { type: 'board', id: 'b', at: HERE },
      { type: 'board', id: 'c', at: HERE }
    )
    v.tick(CONFIG.truck.countdownSeconds * SEC)
    expect(v.step({ type: 'clock' }).xp).toBeUndefined()
    v.step({ type: 'hop-out', id: 'c' })
    v.tick(ROUTES.joyrideMs)
    // Whatever wakes the valley when he is home, a stranger's berry here.
    const r = v.step({ type: 'collect', id: 'c', bush: 0, at: HERE })
    expect(reasons(r)).toEqual(['home'])
    expect(r.xp).toEqual([
      { account: 'acct-a', source: 'ride' },
      { account: 'acct-b', source: 'ride' },
      { account: 'acct-c', source: 'berry' },
    ])
    expect(v.step({ type: 'clock' }).xp).toBeUndefined()
  })

  it('earns one ride for an account however many of its sockets rode', () => {
    const v = valleyWith(
      join('a'),
      { ...join('a2'), account: 'acct-a' } as ValleyAction,
      { type: 'board', id: 'a', at: HERE },
      { type: 'board', id: 'a2', at: HERE }
    )
    v.tick(CONFIG.truck.countdownSeconds * SEC + ROUTES.joyrideMs)
    expect(v.step({ type: 'clock' }).xp).toEqual([
      { account: 'acct-a', source: 'ride' },
    ])
  })
})

describe('rule 11: a burst shadowman leaves dimes', () => {
  it('spills a drop of dimes where each one burst', () => {
    const v = valleyWith(join('a'))
    const r = v.step({
      type: 'spill',
      spills: [
        { x: 10, z: 20, kind: 'dimes', count: 7 },
        { x: 30, z: 40, kind: 'dimes', count: 0 },
        { x: 50, z: 60, kind: 'dimes', count: 3 },
        // Off the wire a kind is any string; one that is neither cash nor
        // a pack kind is left out.
        { x: 70, z: 80, kind: 'not-a-thing' as PickupKind, count: 1 },
      ],
    })
    expect(reasons(r)).toEqual(['spilled'])
    expect(v.valley.world?.drops).toEqual([
      { id: 0, kind: 'dimes', count: 7, x: 10, z: 20, spilled: true },
      { id: 1, kind: 'dimes', count: 3, x: 50, z: 60, spilled: true },
    ])
    expect(v.valley.world?.nextDrop).toBe(2)
  })

  it('lets the oldest of what it spilled go past the cap, never a drop', () => {
    const v = valleyWith(join('a'), {
      type: 'drop',
      id: 'a',
      kind: 'joints',
      count: 1,
      at: { x: 0, z: 0, yaw: 0 },
    })
    const max = CONFIG.drops.spilledMax
    for (let i = 0; i < max + 2; i++) {
      v.step({
        type: 'spill',
        spills: [{ x: i, z: 0, kind: 'dimes', count: 1 }],
      })
    }
    const drops = v.valley.world?.drops ?? []
    expect(drops).toHaveLength(max + 1)
    expect(drops[0]).toMatchObject({ id: 0, kind: 'joints' })
    // Ids 1 and 2 were the first spilled, and are gone.
    expect(drops[1].id).toBe(3)
    expect(drops.at(-1)?.id).toBe(max + 2)
  })

  it('spills nothing with no world, or no dimes', () => {
    const v = valleyWith()
    expect(
      v.step({
        type: 'spill',
        spills: [{ x: 0, z: 0, kind: 'dimes', count: 5 }],
      }).broadcast
    ).toEqual([])
    expect(v.valley.world).toBeNull()
    const w = valleyWith(join('a'))
    expect(w.step({ type: 'spill', spills: [] }).broadcast).toEqual([])
  })

  it('pays dimes taken up into the wallet, never the pack', () => {
    const v = valleyWith(join('a'), join('b'))
    v.step({
      type: 'spill',
      spills: [{ x: 1, z: 2, kind: 'dimes', count: 12 }],
    })
    const r = v.step({ type: 'take-drop', id: 'b', drop: 0, at: HERE })
    expect(r.broadcast[0]).toMatchObject({
      reason: 'drop-taken',
      by: 'b',
      item: 'dimes',
      count: 12,
    })
    expect(r.earn).toEqual({ account: 'acct-b', amount: 120 })
    expect(r.pack).toBeUndefined()
    expect(v.valley.world?.drops).toEqual([])
  })

  it("pays a spider's $20 taken up into the wallet", () => {
    const v = valleyWith(join('a'))
    v.step({
      type: 'spill',
      spills: [{ x: 1, z: 2, kind: 'twenty', count: 1 }],
    })
    const r = v.step({ type: 'take-drop', id: 'a', drop: 0, at: HERE })
    expect(r.earn).toEqual({ account: 'acct-a', amount: 2000 })
    expect(r.pack).toBeUndefined()
  })

  it('puts the gold bullion the Caretaker leaves into the taker’s pack', () => {
    const v = valleyWith(join('a'))
    v.step({
      type: 'spill',
      spills: [
        { x: 1, z: 2, kind: 'gold-bullion', count: 1 },
        { x: 1.5, z: 2, kind: 'gold-bullion', count: 1 },
      ],
    })
    expect(v.valley.world?.drops).toEqual([
      { id: 0, kind: 'gold-bullion', count: 1, x: 1, z: 2, spilled: true },
      { id: 1, kind: 'gold-bullion', count: 1, x: 1.5, z: 2, spilled: true },
    ])
    const r = v.step({ type: 'take-drop', id: 'a', drop: 0, at: HERE })
    expect(r.pack).toEqual({
      account: 'acct-a',
      kind: 'gold-bullion',
      delta: 1,
    })
    expect(r.earn).toBeUndefined()
  })

  it('never lets dimes be dropped from a pack', () => {
    const v = valleyWith(join('a'))
    const at = { x: 0, z: 0, yaw: 0 }
    expect(
      v.step({ type: 'drop', id: 'a', kind: 'dimes', count: 3, at }).reply
        ?.reason
    ).toBe('not-an-item')
  })
})

describe("rule 11: the shadowmen are the valley's", () => {
  // Out past every haven, on foot, looking north with nothing in hand.
  const state = (over: Partial<PeerStateWire> = {}): PeerStateWire => ({
    x: 500,
    y: 0,
    z: 500,
    yaw: 0,
    pitch: 0,
    pose: 'stand',
    riding: false,
    light: false,
    ...over,
  })
  // 'a' and 'b' both in the valley, on foot.
  const valley = () => valleyWith(join('a'), join('b')).valley

  it('is in the world it opened: the havens and the survey, never on the wire', () => {
    const world = valleyWith(join('a')).valley.world
    expect(world?.havens).toEqual(HAVENS)
    expect(world?.metres).toEqual(METRES)
    const wire = toWire(valleyWith(join('a')).valley)
    expect(wire && ('havens' in wire || 'metres' in wire)).toBe(false)
  })

  it('cuts a frame down to the shadowmen round one raider', () => {
    const man = (id: number, x: number) => ({
      id,
      x,
      z: 0,
      burn: 0,
      target: null,
    })
    const frame = {
      type: 'shadowmen' as const,
      shadowmen: [man(1, 10), man(2, 500), man(3, 20)],
      lunges: [1, 2],
      bursts: [],
      caretaker: null,
      burned: null,
      tunnel: [],
      tunnelBursts: [],
      tunnelWounds: [],
    }
    const near = shadowmenNear(frame, { x: 0, z: 0 }, 100)
    expect(near.shadowmen.map((m) => m.id)).toEqual([1, 3])
    expect(near.lunges).toEqual([1])
    // Whole when all are near, and for a raider nowhere yet.
    expect(shadowmenNear(frame, { x: 0, z: 0 }, 1000)).toBe(frame)
    expect(shadowmenNear(frame, null, 1)).toBe(frame)
  })

  it('crosses round every placed raider in the valley', () => {
    const v = valley()
    const placed: Placed[] = [
      { id: 'a', at: state() },
      { id: 'b', at: state({ x: 900 }) },
      { id: 'c', at: state() },
      { id: 'd', at: null },
    ]
    const raiders = shadowRaiders(v, createShadows(), placed, T0)
    expect(raiders.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('rushes only a raider on foot, out of the bed, not coming to', () => {
    const v = valley()
    const shadows = createShadows()
    const vulnerable = (at: PeerStateWire, id = 'b') =>
      shadowRaiders(v, shadows, [{ id, at }], T0)[0].vulnerable
    expect(vulnerable(state())).toBe(true)
    // In the bed of the parked truck.
    const aboard = valleyWith(join('a'), {
      type: 'board',
      id: 'a',
      at: HERE,
    }).valley
    expect(
      shadowRaiders(aboard, shadows, [{ id: 'a', at: state() }], T0)[0]
        .vulnerable
    ).toBe(false)
    expect(vulnerable(state({ riding: true }))).toBe(false)
    shadows.recovering['acct-b'] = T0 + 1
    expect(vulnerable(state())).toBe(false)
  })

  it('reaches no raider up on the lookout, whose beam still burns', () => {
    const maze = { x: 120, z: -40, yaw: 0.6 }
    const v = valleyWith({ ...join('a'), maze } as ValleyAction).valley
    const shadows = createShadows()
    const at = (p: { x: number; z: number }, light = false) =>
      shadowRaiders(
        v,
        shadows,
        [{ id: 'a', at: state({ ...lookoutToWorld(maze, p), light }) }],
        T0
      )[0]
    const up = at(LADDER_TOP, true)
    expect(up.vulnerable).toBe(false)
    expect(up.beam).not.toBeNull()
    expect(at({ x: 0, z: 0 }).vulnerable).toBe(false)
    // At the ladder's foot they are back within reach.
    expect(at(LADDER_FOOT).vulnerable).toBe(true)
  })

  it('aims a beam only for a raider whose light is on', () => {
    const v = valley()
    const [dark, lit] = shadowRaiders(
      v,
      createShadows(),
      [
        { id: 'a', at: state() },
        { id: 'b', at: state({ light: true, pose: 'crouch' }) },
      ],
      T0
    )
    expect(dark.beam).toBeNull()
    expect(lit.beam?.origin.y).toBe(CONFIG.player.crouchEyeHeight)
    expect(lit.beam?.floor).toBe(0)
  })

  it('steps the field and sends all of it, rounded', () => {
    const v = valley()
    const shadows = createShadows()
    const out = stepShadows(
      v,
      shadows,
      [{ id: 'b', at: state() }],
      mulberry32(1),
      {
        now: T0,
        dt: 0.1,
      }
    )
    expect(out?.message.type).toBe('shadowmen')
    expect(out?.message.shadowmen.length).toBe(CONFIG.shadowmen.count)
    for (const s of out?.message.shadowmen ?? []) {
      expect(Math.round(s.x * 100) / 100).toBe(s.x)
      expect(s.burn).toBe(0)
    }
    expect(out?.struck).toEqual([])
  })

  it('strikes the raider touched, then leaves them alone for the grace', () => {
    const v = valley()
    const shadows = createShadows()
    const placed = [{ id: 'b', at: state() }]
    stepShadows(v, shadows, placed, mulberry32(1), { now: T0, dt: 0 })
    shadows.field.shadowmen = []
    placeShadowman(shadows, 500, 501)
    const id = shadows.field.shadowmen[0].id
    let out = stepShadows(v, shadows, placed, mulberry32(1), {
      now: T0,
      dt: 0.1,
    })
    // It winds up first, and the frame says how far.
    expect(out?.struck).toEqual([])
    expect(out?.message.shadowmen[0].windup).toBeGreaterThan(0)
    for (let i = 0; i < 10 && !out?.struck.length; i++) {
      out = stepShadows(v, shadows, placed, mulberry32(1), {
        now: T0,
        dt: 0.1,
      })
    }
    expect(out?.struck).toEqual(['b'])
    expect(out?.message.lunges).toEqual([id])
    // The one that struck stays.
    expect(out?.message.shadowmen.map((s) => s.id)).toContain(id)
    const until = T0 + CONFIG.health.graceSeconds * 1000
    expect(shadows.recovering).toEqual({ 'acct-b': until })
    // Still coming to: not rushed.
    placeShadowman(shadows, 500, 501)
    expect(
      stepShadows(v, shadows, placed, mulberry32(1), { now: T0 + 1, dt: 0.1 })
        ?.struck
    ).toEqual([])
    // Come to.
    shadows.field.shadowmen = []
    stepShadows(v, shadows, placed, mulberry32(1), { now: until, dt: 0 })
    expect(shadows.recovering).toEqual({})
  })

  it('bursts in a beam, and sends where', () => {
    const v = valley()
    const shadows = createShadows()
    // From the bed, so it stands still to burn rather than rushing.
    const placed = [{ id: 'b', at: state({ light: true, riding: true }) }]
    stepShadows(v, shadows, placed, mulberry32(1), { now: T0, dt: 0 })
    shadows.field.shadowmen = []
    const id = shadows.field.nextId
    placeShadowman(shadows, 500, 490)
    const out = stepShadows(v, shadows, placed, mulberry32(1), {
      now: T0,
      dt: CONFIG.shadowmen.burnSeconds,
    })
    // Who burned it stays off the wire, and their account is credited with
    // the burn (rule 16).
    expect(out?.message.bursts).toEqual([{ id, kind: 'man', x: 500, z: 490 }])
    expect(out?.burned).toEqual(['acct-b'])
    // And earns it XP (rule 22).
    expect(out?.xp).toEqual([{ account: 'acct-b', source: 'burn' }])
  })

  it("burns in Marx's headlights while a raider near says where they are", () => {
    const v = valley()
    const shadows = createShadows()
    // From the bed, light down, so the one placed stands still to burn.
    const placed = [{ id: 'b', at: state({ riding: true }) }]
    stepShadows(v, shadows, placed, mulberry32(1), { now: T0, dt: 0 })
    shadows.field.shadowmen = []
    // The truck 20 m east of the raider, facing north (-Z), on the one placed.
    const pose = { x: 520, y: 0, z: 500, heading: Math.PI }
    expect(seeHeadlights(shadows, state(), pose, T0)).toBe(true)
    const id = shadows.field.nextId
    placeShadowman(shadows, 520, 485)
    const out = stepShadows(v, shadows, placed, mulberry32(1), {
      now: T0,
      dt: CONFIG.shadowmen.burnSeconds,
    })
    // It bursts, and no one is credited with it.
    expect(out?.message.bursts).toEqual([{ id, kind: 'man', x: 520, z: 485 }])
    expect(out?.burned).toEqual([])
  })

  it('takes the headlights only fresh, and only from a raider near them', () => {
    const shadows = createShadows()
    const pose = { x: 520, y: 0, z: 500, heading: Math.PI }
    const { reach, staleMs } = CONFIG.truck.headlights
    expect(seeHeadlights(shadows, null, pose, T0)).toBe(false)
    expect(
      seeHeadlights(shadows, state({ x: 520 + reach + 1 }), pose, T0)
    ).toBe(false)
    expect(headlightsAt(shadows, T0)).toEqual([])
    expect(seeHeadlights(shadows, state(), pose, T0)).toBe(true)
    expect(headlightsAt(shadows, T0 + staleMs)).toHaveLength(1)
    expect(headlightsAt(shadows, T0 + staleMs + 1)).toEqual([])
  })

  it('sends a spider as one, its burn against its own longer time', () => {
    const v = valley()
    const shadows = createShadows()
    const placed = [{ id: 'b', at: state({ light: true, riding: true }) }]
    stepShadows(v, shadows, placed, mulberry32(1), { now: T0, dt: 0 })
    shadows.field.shadowmen = []
    placeShadowman(shadows, 500, 490, 'spider')
    const half = CONFIG.shadowmen.burnSeconds
    const out = stepShadows(v, shadows, placed, mulberry32(1), {
      now: T0,
      dt: half,
    })
    // Held a shadowman's whole burn: a spider is only half way.
    expect(out?.message.bursts).toEqual([])
    const [wire] = out?.message.shadowmen ?? []
    expect(wire).toMatchObject({ kind: 'spider', burn: 0.5 })
    const after = stepShadows(v, shadows, placed, mulberry32(1), {
      now: T0,
      dt: half,
    })
    expect(after?.message.bursts).toMatchObject([{ kind: 'spider' }])
    expect(out?.xp).toEqual([])
    expect(after?.xp).toEqual([{ account: 'acct-b', source: 'spider' }])
  })

  it('places a still shadowman with a new id', () => {
    const shadows = createShadows()
    placeShadowman(shadows, 3, 4)
    placeShadowman(shadows, 5, 6)
    expect(
      shadows.field.shadowmen.map((s) => [s.id, s.x, s.z, s.speed])
    ).toEqual([
      [1, 3, 4, 0],
      [2, 5, 6, 0],
    ])
  })

  it('empties, and stops, with no world or no one placed in it', () => {
    const v = valley()
    const shadows = createShadows()
    placeShadowman(shadows, 3, 4)
    shadows.recovering['acct-b'] = T0 + 5
    expect(
      stepShadows(v, shadows, [], mulberry32(1), { now: T0, dt: 0.1 })
    ).toBeNull()
    expect(shadows).toEqual(createShadows())
    expect(
      stepShadows(
        createValley(),
        shadows,
        [{ id: 'b', at: state() }],
        mulberry32(1),
        {
          now: T0,
          dt: 0.1,
        }
      )
    ).toBeNull()
  })
})

describe('rule 15: the season', () => {
  it('credits each account behind the beams once, and no stranger', () => {
    const v = valleyWith(join('a'), join('b'), {
      ...join('c'),
      account: 'acct-a',
    } as ValleyAction).valley
    expect(creditedWith(v, ['a', 'c', 'b', 'gone'])).toEqual([
      'acct-a',
      'acct-b',
    ])
    expect(creditedWith(v, [])).toEqual([])
  })
})

describe('rule 11, below: the tunnel shades walk the Undercroft', () => {
  const CROFT = { x: -7000, z: -7000, yaw: 0 }
  // A spot in the Undercroft, in its own metres, in the world.
  const below = (p: { x: number; z: number }) => ({
    x: CROFT.x + p.x,
    z: CROFT.z + p.z,
  })
  const state = (at: { x: number; z: number }): PeerStateWire => ({
    ...at,
    y: 0,
    yaw: 0,
    pitch: 0,
    pose: 'stand',
    riding: false,
    light: false,
  })
  const valley = () =>
    valleyWith({ ...join('a'), undercroft: CROFT } as ValleyAction).valley

  it('keeps where the Undercroft lies, and sends its shades every step', () => {
    const v = valley()
    expect(v.world?.undercroft).toEqual(CROFT)
    const shadows = createShadows()
    const placed = [{ id: 'a', at: state({ x: 0, z: 0 }) }]
    const out = stepShadows(v, shadows, placed, mulberry32(1), {
      now: T0,
      dt: 0,
    })
    expect(out?.message.tunnel).toHaveLength(UNDERCROFT.lairs.length + 1)
    expect(out?.message.tunnel.at(-1)).toMatchObject({
      kind: 'warden',
      ...below(UNDERCROFT.warden),
    })
  })

  it('keeps a raider below out of the shadowmen, and strikes them itself', () => {
    const v = valley()
    const shadows = createShadows()
    const lair = UNDERCROFT.lairs[0]
    const placed = [{ id: 'a', at: state(below({ x: lair.x + 3, z: lair.z })) }]
    let struck: string[] = []
    let tunneled: string[] = []
    for (let i = 0; i < 100 && struck.length === 0; i++) {
      const out = stepShadows(v, shadows, placed, mulberry32(i), {
        now: T0 + i * 100,
        dt: 0.1,
      })
      expect(out?.message.shadowmen).toEqual([])
      struck = out?.struck ?? []
      tunneled = out?.tunneled ?? []
    }
    expect(struck).toEqual(['a'])
    expect(tunneled).toEqual(['a'])
  })

  it("credits a burn and XP for a shade burst in a raider's beam", () => {
    const v = valley()
    const shadows = createShadows()
    let bursts: { kind: string }[] = []
    let burned: string[] = []
    let xp: { account: string; source: string }[] = []
    const first = stepShadows(
      v,
      shadows,
      [{ id: 'a', at: state(below({ x: 0, z: 0 })) }],
      mulberry32(1),
      { now: T0, dt: 0 }
    )
    let shade = first?.message.tunnel[0]
    if (!shade) throw new Error('no shade')
    for (let i = 1; i < 100 && bursts.length === 0; i++) {
      // A step off the shade, its light on it.
      const from = { x: shade.x + 1.5, z: shade.z }
      const yaw = Math.atan2(shade.x - from.x, shade.z - from.z) + Math.PI
      const at = { ...state(from), yaw, pitch: -0.15, light: true }
      const out = stepShadows(v, shadows, [{ id: 'a', at }], mulberry32(i), {
        now: T0 + i * 100,
        dt: 0.1,
        calm: true,
      })
      const id: number = shade.id
      shade = out?.message.tunnel.find((t) => t.id === id) ?? shade
      bursts = out?.message.tunnelBursts ?? []
      burned = out?.burned ?? []
      xp = out?.xp ?? []
    }
    expect(bursts).toHaveLength(1)
    expect(burned).toEqual(['acct-a'])
    expect(xp).toContainEqual({ account: 'acct-a', source: 'burn' })
  })

  it('leaves the shades still in a world opened without the Undercroft', () => {
    const v = valleyWith(join('a')).valley
    const out = stepShadows(
      v,
      createShadows(),
      [{ id: 'a', at: state({ x: 0, z: 0 }) }],
      mulberry32(1),
      { now: T0, dt: 0.1 }
    )
    expect(out?.message.tunnel).toEqual([])
    expect(out?.message.tunnelBursts).toEqual([])
  })
})

describe('rule 13: the Caretaker keeps the maze', () => {
  const heart = heartPoint(theMaze())
  // The heart of the maze in the world, MAZE turned by nothing.
  const at = (dx = 0, dz = 0) => ({
    x: MAZE.x + heart.x + dx,
    z: MAZE.z + heart.z + dz,
  })
  const state = (over: Partial<PeerStateWire> = {}): PeerStateWire => ({
    ...at(),
    y: 0,
    yaw: 0,
    pitch: 0,
    pose: 'stand',
    riding: false,
    light: false,
    ...over,
  })
  // 'a' and 'b' in a world opened by a build with a maze.
  const valley = () =>
    valleyWith(
      { ...join('a'), maze: MAZE } as ValleyAction,
      { ...join('b'), maze: MAZE } as ValleyAction
    ).valley

  it('keeps where the maze lies in the world it opened, never on the wire', () => {
    const v = valley()
    expect(v.world?.maze).toEqual(MAZE)
    expect(JSON.stringify(toWire(v))).not.toContain('maze')
  })

  it('floats in every frame, and catches a raider on foot in the maze', () => {
    const v = valley()
    const shadows = createShadows()
    placeCaretaker(v, shadows, at().x, at().z)
    const placed = [{ id: 'b', at: state({ ...at(0, 2) }) }]
    let out = stepShadows(v, shadows, placed, mulberry32(1), {
      now: T0,
      dt: 0,
    })
    expect(out?.message.caretaker).toEqual({
      ...at(),
      burn: 0,
      target: 'b',
    })
    let wound = false
    for (let i = 0; i < 20 && !out?.caught.length; i++) {
      shadows.field.shadowmen = []
      out = stepShadows(v, shadows, placed, mulberry32(1), {
        now: T0,
        dt: 0.1,
      })
      wound ||= (out?.message.caretaker?.windup ?? 0) > 0
    }
    expect(wound).toBe(true)
    expect(out?.caught).toEqual(['b'])
    expect(out?.struck).toEqual(['b'])
    expect(out?.message.caretaker?.lunge).toBe(true)
    expect(shadows.recovering['acct-b']).toBe(
      T0 + CONFIG.health.graceSeconds * 1000
    )
    // Coming to, they are let be.
    expect(shadows.caretaker.target).toBeNull()
  })

  it('never hunts a raider riding, or outside the corn', () => {
    const v = valley()
    for (const where of [
      state({ ...at(0, 2), riding: true }),
      state({ x: MAZE.x - 5, z: MAZE.z - 5 }),
    ]) {
      const shadows = createShadows()
      placeCaretaker(v, shadows, at().x, at().z)
      const out = stepShadows(
        v,
        shadows,
        [{ id: 'b', at: where }],
        mulberry32(1),
        {
          now: T0,
          dt: 0.1,
        }
      )
      expect(out?.caught).toEqual([])
      expect(shadows.caretaker.target).toBeNull()
    }
  })

  it('shrugs off one beam, is burned by two, and forms again at the heart', () => {
    const v = valley()
    const shadows = createShadows()
    placeCaretaker(v, shadows, at().x, at().z)
    // Down the court from it, looking at it (+z is yaw pi), from the bed so
    // it never comes for them.
    const lit = (dx: number) =>
      state({ ...at(dx, -8), yaw: Math.PI, light: true, riding: true })
    const step = (placed: Placed[], dt: number) => {
      shadows.field.shadowmen = []
      return stepShadows(v, shadows, placed, mulberry32(1), { now: T0, dt })
    }
    const one = [
      { id: 'a', at: lit(0) },
      { id: 'b', at: lit(0.5) },
    ]
    // One alone, however long.
    let out = step([{ id: 'a', at: lit(0) }], CONFIG.caretaker.burnSeconds * 2)
    expect(out?.message.caretaker?.burn).toBe(0)
    // Two at once, halfway.
    out = step(one, CONFIG.caretaker.burnSeconds / 2)
    expect(out?.message.caretaker?.burn).toBe(0.5)
    expect(out?.message.burned).toBeNull()
    expect(out?.credited).toEqual([])
    // Burned where it floated, wandering as it was, and both accounts
    // credited with it (rule 15).
    const last = out?.message.caretaker
    out = step(one, CONFIG.caretaker.burnSeconds / 2)
    expect(out?.message.burned).toEqual({ x: last?.x, z: last?.z })
    expect(out?.credited).toEqual(['acct-a', 'acct-b'])
    // Each earns the big jump (rule 22).
    expect(out?.xp).toEqual([
      { account: 'acct-a', source: 'caretaker' },
      { account: 'acct-b', source: 'caretaker' },
    ])
    expect(out?.message.caretaker).toBeNull()
    out = step(one, CONFIG.caretaker.respawnSeconds - 1)
    expect(out?.message.caretaker).toBeNull()
    out = step(one, 1)
    expect(out?.message.caretaker).toMatchObject({ ...at(), burn: 0 })
  })

  it('is not there in a world without a maze', () => {
    const v = valleyWith(join('a'))
    const shadows = createShadows()
    placeCaretaker(v.valley, shadows, 0, 0)
    expect(shadows.caretaker).toEqual(createShadows().caretaker)
    const out = stepShadows(
      v.valley,
      shadows,
      [{ id: 'a', at: state() }],
      mulberry32(1),
      { now: T0, dt: 0.1 }
    )
    expect(out?.message.caretaker).toBeNull()
    expect(out?.message.burned).toBeNull()
  })
})

describe('rule 24: health', () => {
  const MAX = CONFIG.health.max
  const TOUCH = CONFIG.health.touch

  const at = (over: Partial<PeerStateWire> = {}): PeerStateWire => ({
    x: 500,
    y: 0,
    z: 500,
    yaw: 0,
    pitch: 0,
    pose: 'walk',
    riding: false,
    light: false,
    ...over,
  })

  it('starts every account whole, and keeps none that is', () => {
    const v = valleyWith(join('a'))
    expect(healthFor(v.valley, 'acct-a')).toBe(MAX)
    expect(v.valley.health).toEqual({})
  })

  it('takes a block a touch, and the last shatters and makes whole', () => {
    const v = valleyWith(join('a'))
    for (let left = MAX - TOUCH; left > 0; left -= TOUCH) {
      expect(v.step({ type: 'hit', id: 'a' }).health).toEqual({
        account: 'acct-a',
        points: left,
      })
      expect(healthFor(v.valley, 'acct-a')).toBe(left)
    }
    expect(v.step({ type: 'hit', id: 'a' }).health).toEqual({
      account: 'acct-a',
      points: 0,
      fatal: true,
    })
    expect(healthFor(v.valley, 'acct-a')).toBe(MAX)
    expect(v.valley.health).toEqual({})
  })

  it("is the account's: a second socket shares it, and a stranger has none", () => {
    const second = { ...joinAs('b'), account: 'acct-a' }
    const v = valleyWith(join('a'), second)
    v.step({ type: 'hit', id: 'a' })
    expect(v.step({ type: 'hit', id: 'b' }).health?.points).toBe(
      MAX - 2 * TOUCH
    )
    expect(v.step({ type: 'hit', id: 'nobody' }).health).toBeUndefined()
    expect(v.step({ type: 'mend', id: 'nobody', by: 1 }).health).toBeUndefined()
  })

  it('gives points back, never past whole, and says nothing when whole', () => {
    const v = valleyWith(join('a'))
    expect(v.step({ type: 'mend', id: 'a', by: 1 }).health).toBeUndefined()
    v.step({ type: 'set-health', id: 'a', points: 1 })
    expect(v.step({ type: 'mend', id: 'a', by: 1 }).health?.points).toBe(2)
    expect(v.step({ type: 'mend', id: 'a', by: MAX }).health?.points).toBe(MAX)
    v.step({ type: 'set-health', id: 'a', points: 1 })
    // A forecourt: whole at once.
    expect(v.step({ type: 'mend', id: 'a' }).health?.points).toBe(MAX)
  })

  it('outlasts a reconnect and a world opened afresh', () => {
    const v = valleyWith(join('a'))
    v.step({ type: 'hit', id: 'a' })
    v.step(leaveAs('a'))
    v.step({ type: 'reset' })
    const restored = restoreValley({ ...v.valley, world: null })
    expect(healthFor(restored, 'acct-a')).toBe(MAX - TOUCH)
    // An older build's valley, kept before health was, is whole.
    const { health: _, healthMax: __, ...older } = createValley()
    expect(healthFor(restoreValley(older), 'acct-a')).toBe(MAX)
    // One kept in three points comes back at the same share of whole.
    const points = restoreValley({ ...older, health: { 'acct-a': 2 } })
    expect(healthFor(points, 'acct-a')).toBe(Math.round((MAX * 2) / 3))
    expect(points.healthMax).toBe(MAX)
  })

  it('makes whole on a forecourt, on foot, one socket an account', () => {
    const second = { ...joinAs('b'), account: 'acct-a' }
    const v = valleyWith(join('a'), second, join('c'))
    const yard = at({ x: 10, z: 10 })
    // Whole: nothing to mend.
    expect(forecourtMends(v.valley, [{ id: 'a', at: yard }])).toEqual([])
    v.step({ type: 'set-health', id: 'a', points: 1 })
    v.step({ type: 'set-health', id: 'c', points: 1 })
    expect(
      forecourtMends(v.valley, [
        { id: 'a', at: yard },
        { id: 'b', at: yard },
        { id: 'c', at: at() },
      ])
    ).toEqual(['a'])
    expect(
      forecourtMends(v.valley, [{ id: 'a', at: { ...yard, riding: true } }])
    ).toEqual([])
    expect(forecourtMends(v.valley, [{ id: 'a', at: null }])).toEqual([])
  })

  it('counts no spiderling toward the daily task or XP', () => {
    const v = valleyWith(join('a'))
    const shadows = createShadows()
    // From the bed, lit, so the brood holds still to burn.
    const placed = [{ id: 'a', at: at({ light: true, riding: true }) }]
    stepShadows(v.valley, shadows, placed, mulberry32(1), { now: T0, dt: 0 })
    shadows.field.shadowmen = []
    placeShadowman(shadows, 500, 490, 'spiderling')
    const out = stepShadows(v.valley, shadows, placed, mulberry32(1), {
      now: T0,
      dt: CONFIG.shadowmen.spiderling.burnSeconds,
    })
    expect(out?.message.bursts.map((b) => b.kind)).toEqual(['spiderling'])
    expect(out?.burned).toEqual([])
    expect(out?.xp).toEqual([])
    expect(out?.message.shadowmen.some((s) => s.kind === 'spiderling')).toBe(
      false
    )
  })
})

describe('rule 27: buffs', () => {
  const at = (over: Partial<PeerStateWire> = {}): PeerStateWire => ({
    x: 500,
    y: 0,
    z: 500,
    yaw: 0,
    pitch: 0,
    pose: 'walk',
    riding: false,
    light: false,
    ...over,
  })
  const spot = (x: number, z: number, riding = false) => ({ x, z, riding })
  const pass = (
    over: Partial<Extract<ValleyAction, { type: 'pass' }>> = {}
  ): ValleyAction => ({
    type: 'pass',
    id: 'a',
    to: 'b',
    kind: 'joints',
    from: spot(500, 500),
    at: spot(501, 500),
    ...over,
  })

  it('starts every account sober, and an older valley is too', () => {
    const v = valleyWith(join('a'))
    expect(geometrieFor(v.valley, 'acct-a', v.now)).toEqual({
      high: 0,
      stimulated: 0,
      drunk: 0,
    })
    const { geometrie: _, ...older } = createValley()
    expect(restoreValley(older).geometrie).toEqual({})
  })

  it('doses the user once the unit is out of the pack, fading on its clock', () => {
    const v = valleyWith(join('a'))
    const out = v.step({ type: 'dose', id: 'a', kind: 'joints' })
    const high = getItem('joints').geometrie.high
    expect(out.geometrie).toEqual([
      { account: 'acct-a', levels: { high, stimulated: 0, drunk: 0 } },
    ])
    expect(out.xp).toBeUndefined()
    v.tick(60 * SEC)
    const later = geometrieFor(v.valley, 'acct-a', v.now).high
    expect(later).toBeCloseTo(high - 60 * CONFIG.geometrie.fadePerSecond.high)
    expect(
      v.step({ type: 'dose', id: 'nobody', kind: 'joints' }).geometrie
    ).toBeUndefined()
  })

  it("passes to another raider on foot in reach, out of the giver's pack", () => {
    const v = valleyWith(join('a'), join('b'))
    const out = v.step(pass())
    expect(out.reply).toBeUndefined()
    expect(out.pack).toEqual({ account: 'acct-a', kind: 'joints', delta: -1 })
    expect(out.passed).toEqual({ to: 'b', account: 'acct-b', kind: 'joints' })
  })

  it('refuses a pass too far, from or to the bed, to yourself, or of nothing usable', () => {
    const second = { ...joinAs('c'), account: 'acct-a' }
    const v = valleyWith(join('a'), join('b'), second)
    const reason = (action: ValleyAction) => v.step(action).reply?.reason
    expect(reason(pass({ at: spot(510, 500) }))).toBe('too-far')
    expect(reason(pass({ at: spot(501, 500, true) }))).toBe('not-on-foot')
    expect(reason(pass({ from: null }))).toBe('not-on-foot')
    expect(reason(pass({ at: null }))).toBe('not-on-foot')
    expect(reason(pass({ to: 'c' }))).toBe('no-one')
    expect(reason(pass({ to: 'nobody' }))).toBe('no-one')
    expect(reason(pass({ id: 'nobody' }))).toBe('not-in-valley')
    expect(reason(pass({ kind: 'cabbage' }))).toBe('not-an-item')
    expect(reason(pass({ kind: 'nope' }))).toBe('not-an-item')
    expect(v.step(pass({ at: spot(510, 500) })).pack).toBeUndefined()
  })

  it('doses the taker in full and the giver a share, and pays the giver XP', () => {
    const v = valleyWith(join('a'), join('b'))
    const out = v.step({
      type: 'dose',
      id: 'a',
      kind: 'four-loko-blue',
      to: 'b',
    })
    const { stimulated, drunk } = getItem('four-loko-blue').geometrie
    const share = CONFIG.buffs.shareScale
    expect(out.geometrie).toEqual([
      { account: 'acct-b', levels: { high: 0, stimulated, drunk } },
      {
        account: 'acct-a',
        levels: {
          high: 0,
          stimulated: stimulated * share,
          drunk: drunk * share,
        },
      },
    ])
    expect(out.xp).toEqual([{ account: 'acct-a', source: 'share' }])
    // A taker gone by then is dosed nothing.
    expect(
      v.step({ type: 'dose', id: 'a', kind: 'pbr', to: 'nobody' }).geometrie
    ).toBeUndefined()
  })

  it("shrugs a touch off by the drunk's chance, and a shattering sobers", () => {
    const v = valleyWith(join('a'))
    // Sober, no roll shrugs it off.
    expect(
      v.step({ type: 'hit', id: 'a', roll: 0 }).health?.shrugged
    ).toBeUndefined()
    v.step({ type: 'set-health', id: 'a', points: CONFIG.health.max })
    v.step({ type: 'dose', id: 'a', kind: 'wild-turkey' })
    v.step({ type: 'dose', id: 'a', kind: 'wild-turkey' })
    const shrugged = v.step({ type: 'hit', id: 'a', roll: 0 }).health
    expect(shrugged).toEqual({
      account: 'acct-a',
      points: CONFIG.health.max,
      shrugged: true,
    })
    expect(healthFor(v.valley, 'acct-a')).toBe(CONFIG.health.max)
    // A roll past the chance lands.
    expect(v.step({ type: 'hit', id: 'a', roll: 0.99 }).health?.points).toBe(
      CONFIG.health.max - CONFIG.health.touch
    )
    v.step({ type: 'set-health', id: 'a', points: 1 })
    const fatal = v.step({ type: 'hit', id: 'a', roll: 0.99 })
    expect(fatal.health?.fatal).toBe(true)
    expect(fatal.geometrie).toEqual([
      { account: 'acct-a', levels: { high: 0, stimulated: 0, drunk: 0 } },
    ])
    expect(v.valley.geometrie).toEqual({})
  })

  it("reaches a high raider's beam further for the shadowmen", () => {
    const v = valleyWith(join('a'))
    const placed: Placed[] = [{ id: 'a', at: at({ light: true }) }]
    const sober = shadowRaiders(v.valley, createShadows(), placed, v.now)[0]
    v.step({ type: 'dose', id: 'a', kind: 'joints' })
    const high = shadowRaiders(v.valley, createShadows(), placed, v.now)[0]
    expect(high.beam!.range).toBeGreaterThan(sober.beam!.range)
    expect(high.beam!.halfAngle).toBeGreaterThan(sober.beam!.halfAngle)
  })
})
