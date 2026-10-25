import { describe, expect, it } from 'vitest'
import { heartPoint, theMaze } from '../../src/caretaker.ts'
import { CONFIG } from '../../src/config.ts'
import { campfireOf } from '../../src/cooking.ts'
import { dayKey, nextMidnight } from '../../src/daily.ts'
import {
  costIn,
  DEALER_GOODS,
  evenUp,
  freshDealerStock,
  goodOf,
} from '../../src/dealer.ts'
import { projectorOf } from '../../src/drivein.ts'
import { DIME_CENTS } from '../../src/drops.ts'
import { embark, outcomeOf } from '../../src/expeditions.ts'
import { fightOf, quickestMs } from '../../src/fishing.ts'
import { BASE_GEOMETRIE, maxGeometrie } from '../../src/health.ts'
import { STARTING_INVENTORY } from '../../src/inventory.ts'
import { contentsOf, getItem, healsOf } from '../../src/items.ts'
import {
  LADDER_FOOT,
  LADDER_TOP,
  lookoutToWorld,
  toolboxOf,
} from '../../src/lookout.ts'
import { nextChange } from '../../src/marx.ts'
import { mazeToWorld } from '../../src/maze.ts'
import { inChannel } from '../../src/moat.ts'
import { MOAT_STATION } from '../../src/moatslurms.ts'
import { partyOf } from '../../src/party.ts'
import { PROTOCOL_VERSION } from '../../src/protocol.ts'
import { FRESH_RESEARCH, priceOf } from '../../src/recycling.ts'
import { mulberry32 } from '../../src/rng.ts'
import {
  citgoVisits,
  createShadows,
  forecourtMends,
  headlightsAt,
  phoneVisits,
  placeCaretaker,
  placeShadowman,
  seeHeadlights,
  shadeHavens,
  shadowmenNear,
  shadowRaiders,
  stepShadows,
} from '../../src/shadowstep.ts'
import {
  anglerFor,
  BUSHES,
  citgosFor,
  corpsesOf,
  createValley,
  creditedWith,
  creditedWithParty,
  dailyFor,
  findsPay,
  giftsOwed,
  healthFor,
  levelFor,
  maxFor,
  placeOf,
  reduce,
  restoreValley,
  toWire,
  wakeAt,
  wardsFor,
  waypointsFor,
} from '../../src/sharedworld.ts'
import { FRESH_STAND, standXp, upgradePrice } from '../../src/stand.ts'
import { STORE_LAYOUT } from '../../src/store.ts'
import {
  freshTopiaries,
  theTopiaries,
  TOPIARIES,
  torchDamage,
} from '../../src/topiaries.ts'
import { UNDERCROFT } from '../../src/undercroft.ts'
import { damageOf } from '../../src/wards.ts'
import { WAYPOINT_MAX } from '../../src/waypoints.ts'
import { unitsLeft } from './stock.ts'
import type { CosmeticId } from '../../src/cosmetics.ts'
import type { Facing } from '../../src/drops.ts'
import type { ExpeditionRun } from '../../src/expeditions.ts'
import type { Inventory, XZ } from '../../src/interfaces.ts'
import type { PickupKind } from '../../src/items.ts'
import type {
  DailyMessage,
  LineMessage,
  PeerStateWire,
  PickupSpec,
  WorldMessage,
} from '../../src/protocol.ts'
import type { QuestStage } from '../../src/quests.ts'
import type { Research } from '../../src/recycling.ts'
import type { Placed } from '../../src/shadowstep.ts'
import type {
  LaptopRe,
  Reduced,
  Valley,
  ValleyAction,
} from '../../src/sharedworld.ts'
import type { StandLedger } from '../../src/stand.ts'
import type { ShadowHit } from '../../src/wards.ts'

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
const PAYPHONES = [{ x: 700, z: -300 }]
const METRES = { width: 15059, height: 15038 }
// Where a build with a corn maze puts it (rule 13). The default join's
// build has none, so the shadowmen's tests step only shadowmen.
const MAZE = { x: 3000, z: 3000, yaw: 0 }
// Where the truck parks, and its joyride: ten minutes out and home.
const ROUTES = { home: { x: 10, z: 10 }, joyrideMs: 600_000 }
// Where the Cabbage Stand stands (rule 23).
const STAND = { x: 5, z: -20 }
const RECYCLERS = HAVENS.map(({ x, z }) => ({ x: x + 30, z: z + 40 }))
const DEALER = { x: -30, z: -60 }
// The firefly ponds (rule 36), away from every station.
const POND = { x: 800, z: 0, radius: 100, landing: { x: 720, z: 0 } }
const FAR_POND = { x: -800, z: 900, radius: 60, landing: { x: -760, z: 860 } }
// Noon, Central time, so a test has the afternoon before the day turns.
const T0 = Date.UTC(2026, 9, 7, 17, 0, 0)
const SEC = 1000

// Raiders `ids` in Marx's bed, as the valley's own truck has them (rule 3).
// A state frame's `riding` puts no one there.
function seated(valley: Valley, ...ids: string[]): Valley {
  const world = valley.world
  if (!world) throw new Error('no world to sit in')
  const riders = [...world.truck.riders, ...ids]
  return { ...valley, world: { ...world, truck: { ...world.truck, riders } } }
}

// What a whistle or a portal reads the pack for (rule 38), when a test
// says nothing of the pack: the kit every raider carries.
const KITTED: ReadonlySet<string> = new Set(['call', 'open-portal'])
const KIT_PACK: Inventory = {
  flashlight: 1,
  'citgo-phone': 1,
  'marx-whistle': 1,
}

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
      ...(pack
        ? { holdings: { pack, cosmetics: [] } }
        : KITTED.has(action.type)
          ? { holdings: { pack: KIT_PACK, cosmetics: [] } }
          : {}),
      ...(quest ? { quest } : {}),
    }
    const reduced = reduce(valley, action, ctx)
    valley = reduced.valley
    if ((action.type === 'join' || action.type === 'dial') && !reduced.reject) {
      present.push(action.id)
    }
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
  lairs: [],
  maze: null,
  routes: ROUTES,
  stand: STAND,
  recyclers: RECYCLERS,
  ponds: [POND, FAR_POND],
  bushes: BUSH_SPOTS,
  dealer: DEALER,
  undercroft: null,
  moat: null,
  rings: RINGS,
  payphones: PAYPHONES,
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
      carried: { day: dayKey(T0), drops: [], graves: [] },
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

  // A world an older protocol opened at T0 and kept: two tombstones, a
  // drop of dimes, a unit off a shelf, a pickup taken and Marx at his
  // donuts, stored with `over` laid on it.
  const olderWorld = (over: Record<string, unknown> = {}): Valley => {
    const v = valleyWith(join('a'), {
      type: 'take',
      id: 'a',
      index: 2,
      at: HERE,
    })
    v.step(leaveAs('a'))
    const world = v.valley.world!
    const kind = STORE_LAYOUT.facings[0].kind
    const shelves = world.shelves.map((shelf) => ({ ...shelf }))
    shelves[1][kind] = shelves[1][kind].map((unit, i) => i !== 0 && unit)
    return {
      ...v.valley,
      world: {
        ...world,
        version: PROTOCOL_VERSION - 1,
        graves: [
          { id: 3, name: 'Hollis', x: 10, z: -4 },
          { id: 7, name: 'Wren', x: -2, z: 8 },
        ],
        nextGrave: 8,
        drops: [{ id: 5, kind: 'dimes', count: 3, x: 1, z: 2, spilled: true }],
        nextDrop: 6,
        shelves,
        dealerStock: {},
        truck: { ...world.truck, riders: ['gone'] },
        ...over,
      },
    }
  }
  const reopen = (stored: Valley, now = T0 + 60 * SEC) =>
    reduce(restoreValley(stored), join('b'), { now, present: [] }).valley

  it("carries an older protocol's tombstones and drops into the next world", () => {
    const world = reopen(olderWorld()).world!
    expect(world.version).toBe(PROTOCOL_VERSION)
    expect(world.graves.map((g) => g.name)).toEqual(['Hollis', 'Wren'])
    expect(world.nextGrave).toBe(8)
    expect(world.drops).toEqual([
      { id: 5, kind: 'dimes', count: 3, x: 1, z: 2, spilled: true },
    ])
    expect(world.nextDrop).toBe(6)
    const kind = STORE_LAYOUT.facings[0].kind
    expect(world.shelves[1][kind][0]).toBe(false)
    expect(world.shelves[0][kind][0]).toBe(true)
  })

  it('takes its places from the hello, and resets what indexed the old ones', () => {
    const stored = olderWorld()
    const valley = reopen(stored)
    const world = valley.world!
    expect(world.taken).toEqual([])
    expect(world.truck.riders).toEqual([])
    expect(world.portals).toEqual([])
    expect(world.dealerStock).toEqual(freshDealerStock())
    expect(world.recyclers).toEqual(RECYCLERS)
    expect(world.pickups).toEqual(PICKUPS)
    expect(valley.carried).toBeNull()
    expect(toWire(valley)?.graves).toHaveLength(2)
  })

  it('carries only the tombstones once the day has turned', () => {
    const world = reopen(olderWorld(), nextMidnight(T0) + SEC).world!
    expect(world.graves).toHaveLength(2)
    expect(world.drops).toEqual([])
    expect(world.nextDrop).toBe(6)
    expect(world.shelves).toEqual(reopen(createValley()).world!.shelves)
  })

  it('fills the shelves afresh when the station count moved', () => {
    const shelves = olderWorld().world!.shelves.slice(0, 2)
    const world = reopen(olderWorld({ stations: 2, shelves })).world!
    expect(world.shelves).toEqual(reopen(createValley()).world!.shelves)
  })

  it('keeps only what reads of an older shape', () => {
    const kind = STORE_LAYOUT.facings[0].kind
    const shelves = olderWorld().world!.shelves.map((shelf) => ({
      ...shelf,
      [kind]: [false],
    }))
    const stored = olderWorld({
      graves: [
        { id: 2, name: 'Ok', x: 0, z: 0 },
        { id: 4, name: 'No place' },
        'junk',
        { id: 9, name: 7, x: 0, z: 0 },
      ],
      nextGrave: undefined,
      drops: [
        { id: 1, kind: 'not-an-item', count: 1, x: 0, z: 0 },
        { id: 12, kind: 'dimes', count: 0, x: 0, z: 0 },
        { id: 11, kind: 'dimes', count: 2, x: 0, z: Number.NaN },
        { id: 10, kind: 'dimes', count: 2, x: 0, z: 0 },
      ],
      nextDrop: 3,
      shelves,
    })
    const world = reopen(stored).world!
    expect(world.graves).toEqual([{ id: 2, name: 'Ok', x: 0, z: 0 }])
    expect(world.nextGrave).toBe(3)
    expect(world.drops.map((d) => d.id)).toEqual([10])
    expect(world.nextDrop).toBe(11)
    // A row of another length comes in full.
    expect(world.shelves[0][kind].every(Boolean)).toBe(true)
    // A world with nothing of the sort: no day, no graves, no drops.
    const bare = olderWorld({
      day: undefined,
      graves: undefined,
      drops: null,
      shelves: undefined,
    })
    expect(restoreValley(bare).carried).toMatchObject({
      day: '',
      graves: [],
      drops: [],
      nextGrave: 8,
    })
    expect(reopen(bare).world!.graves).toEqual([])
  })

  it('caps the tombstones it carries', () => {
    const graves = Array.from({ length: CONFIG.graves.max + 5 }, (_, id) => ({
      id,
      name: `G${id}`,
      x: 0,
      z: 0,
    }))
    const world = reopen(olderWorld({ graves })).world!
    expect(world.graves).toHaveLength(CONFIG.graves.max)
    expect(world.graves[0].id).toBe(5)
  })

  it('carries over through a restart before anyone arrives, and not past a reset', () => {
    const once = restoreValley(olderWorld())
    expect(restoreValley(once).carried).toEqual(once.carried)
    const v = reduce(
      once,
      { type: 'reset' },
      {
        now: T0,
        present: [],
      }
    ).valley
    expect(v.carried).toBeNull()
    expect(reopen(v).world!.graves).toEqual([])
  })

  it('reads the wards an older build kept as geometrie', () => {
    const levels = {
      at: 5,
      levels: { high: 0.5, stimulated: 0, drunk: 0, tripping: 0 },
    }
    const { wards: _, ...rest } = createValley()
    const older = { ...rest, geometrie: { acct: levels } }
    expect(restoreValley(older).wards).toEqual({ acct: levels })
    expect(restoreValley(createValley()).wards).toEqual({})
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

  it('keeps nothing new for a raider who left from the bed, or unheard', () => {
    const v = valleyWith(join('a'), leaveAs('a', at()))
    v.step(join('a'))
    v.step({ type: 'board', id: 'a', at: HERE })
    v.step(leaveAs('a', at({ x: 5 })))
    expect(placeOf(v.valley, 'acct-a')?.x).toBe(120)
    v.step(join('a'))
    v.step(leaveAs('a', null))
    expect(placeOf(v.valley, 'acct-a')?.x).toBe(120)
  })

  it('keeps where a raider still here stands, but not from the bed', () => {
    const v = valleyWith(join('a'))
    v.step({ type: 'stand', id: 'a', at: at() })
    expect(placeOf(v.valley, 'acct-a')).toEqual({ x: 120, z: -40, yaw: 1.5 })
    expect(v.last().broadcast).toEqual([])
    v.step({ type: 'board', id: 'a', at: HERE })
    v.step({ type: 'stand', id: 'a', at: at({ x: 5 }) })
    expect(placeOf(v.valley, 'acct-a')?.x).toBe(120)
    // No one by that id: nothing kept.
    v.step({ type: 'stand', id: 'nobody', at: at({ x: 5 }) })
    expect(placeOf(v.valley, 'acct-nobody')).toBeNull()
  })

  it('keeps where they stood when only their frame said they rode', () => {
    const v = valleyWith(join('a'))
    v.step(leaveAs('a', at({ x: 0, riding: true })))
    expect(placeOf(v.valley, 'acct-a')?.x).toBe(0)
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

describe('rule 38: the kit', () => {
  const to = { x: 400, z: 900 }

  it("owes Marx's whistle once the book holds him, until the account has it", () => {
    expect(giftsOwed({}, {}, [])).toEqual({})
    expect(giftsOwed({}, {}, ['citgo', 'marx'])).toEqual({ 'marx-whistle': 1 })
    expect(giftsOwed({ 'marx-whistle': 1 }, {}, ['marx'])).toEqual({})
    // In the locker is still the account's.
    expect(giftsOwed({}, { 'marx-whistle': 1 }, ['marx'])).toEqual({})
    expect(giftsOwed({ 'marx-whistle': 0 }, {}, ['marx'])).toEqual({
      'marx-whistle': 1,
    })
  })

  it('whistles only with the whistle in the pack', () => {
    const v = valleyWith(join('a'))
    v.setPack({ flashlight: 1, 'citgo-phone': 1 })
    const from = { x: 10, z: 10 }
    expect(v.step({ type: 'call', id: 'a', from, at: to }).reply?.reason).toBe(
      'no-whistle'
    )
    expect(v.valley.world?.truck.leg.kind).not.toBe('called')
    v.setPack({ 'marx-whistle': 1 })
    expect(reasons(v.step({ type: 'call', id: 'a', from, at: to }))).toEqual([
      'called',
    ])
  })

  it('opens a portal only with the phone in the pack', () => {
    const v = valleyWith(join('a'))
    v.setPack({ flashlight: 1 })
    expect(
      v.step({ type: 'open-portal', id: 'a', at: { x: 500, z: 500, yaw: 0 } })
        .reply?.reason
    ).toBe('no-phone')
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

describe('rule 40: the campfire cooks the catch', () => {
  const fire = campfireOf(POND)
  const cookAs = (
    id: string,
    kind = 'bluegill',
    count = 2,
    at: XZ | null = fire
  ): ValleyAction => ({ type: 'cook', id, kind, count, at })

  it('cooks raw fish into what they cook into, out of the pack', () => {
    const v = valleyWith(join('a'))
    v.setPack({ bluegill: 3, 'channel-catfish': 1 })
    const r = v.step(cookAs('a'))
    expect(r.reply).toBeUndefined()
    expect(r.broadcast).toEqual([])
    expect(r.barter).toEqual({
      account: 'acct-a',
      give: { bluegill: 2 },
      take: { kind: 'fried-panfish', count: 2 },
    })
    expect(r.cooked).toEqual({
      account: 'acct-a',
      kind: 'bluegill',
      count: 2,
      into: 'fried-panfish',
    })
    // A large fish grills into a fillet, at the other pond's fire too.
    const far = v.step(cookAs('a', 'channel-catfish', 1, campfireOf(FAR_POND)))
    expect(far.barter?.take).toEqual({ kind: 'grilled-fillet', count: 1 })
  })

  it('refuses from afar, aboard, short, or for what does not cook', () => {
    const v = valleyWith(join('a'))
    v.setPack({ bluegill: 1, cabbage: 4 })
    const reason = (r: Reduced) => r.reply?.reason
    expect(v.step(cookAs('a', 'bluegill', 1, null)).reply).toEqual({
      type: 'nack',
      re: 'cook',
      reason: 'no-campfire',
      item: 'bluegill',
    })
    expect(reason(v.step(cookAs('a', 'bluegill', 1, POND.landing)))).toBe(
      undefined
    )
    expect(reason(v.step(cookAs('a', 'bluegill', 1, { x: 0, z: 0 })))).toBe(
      'no-campfire'
    )
    expect(reason(v.step(cookAs('a', 'bluegill', 2)))).toBe('short')
    expect(reason(v.step(cookAs('a', 'cabbage', 1)))).toBe('raw-only')
    expect(reason(v.step(cookAs('a', 'fried-panfish', 1)))).toBe('raw-only')
    expect(reason(v.step(cookAs('z')))).toBe('not-in-valley')
    v.step({ type: 'board', id: 'a', at: HERE })
    expect(reason(v.step(cookAs('a', 'bluegill', 1)))).toBe('aboard')
  })

  it('cooks for a raider dialed in, wherever they are', () => {
    const v = valleyWith({
      type: 'dial',
      id: 'p',
      account: 'acct-p',
      name: 'P',
      outfit: 'coleman',
      level: 3,
    })
    v.setPack({ bluegill: 1 })
    const r = v.step(cookAs('p', 'bluegill', 1, null))
    expect(r.barter?.take).toEqual({ kind: 'fried-panfish', count: 1 })
  })
})

describe('rule 25: Erwin von Dutch barters', () => {
  const near = { x: DEALER.x + 1, z: DEALER.z }
  // Each good, paid for in just enough of `pay`.
  const enough = (kind: string, pay: string) => {
    const good = goodOf(kind)
    return (good && costIn(good, pay)) || 1
  }
  const dealAs = (
    id: string,
    kind = 'mushrooms',
    pay = 'marlboro',
    at: { x: number; z: number } | null = near
  ): ValleyAction => ({
    type: 'deal',
    id,
    kind,
    offer: { [pay]: enough(kind, pay) },
    at,
  })
  const mushrooms = goodOf('mushrooms')
  const cost = enough('mushrooms', 'marlboro')

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
      give: { marlboro: cost },
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

  it('takes a mixed offer, but none with a unit to spare', () => {
    const v = valleyWith(join('a'))
    v.setPack({ marlboro: 200, pbr: 20 })
    const offer = { marlboro: 10, pbr: 1 }
    const good = mushrooms ?? DEALER_GOODS[0]
    const fill = evenUp(good, { marlboro: 200, pbr: 20 }, offer)
    if (!fill) throw new Error('no fill')
    const r = v.step({
      type: 'deal',
      id: 'a',
      kind: good.kind,
      offer: fill,
      at: near,
    })
    expect(r.barter?.give).toEqual(fill)
    const over = { ...fill, pbr: (fill.pbr ?? 0) + 1 }
    expect(
      v.step({ type: 'deal', id: 'a', kind: good.kind, offer: over, at: near })
        .reply?.reason
    ).toBe('over')
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

describe('rule 9: Your Name and Moab change how a raider is shown', () => {
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

  it('leaves the empty of a unit used in the pack it came out of (rule 32)', () => {
    const v = valleyWith(join('a'))
    const empty = (kind: string, left: number) =>
      v.step({ type: 'empty', id: 'a', kind, left })
    expect(empty('pbr', 0).pack).toEqual({
      account: 'acct-a',
      kind: 'empty-can',
      delta: 1,
    })
    expect(empty('high-life', 4).pack?.kind).toBe('empty-bottle')
    expect(empty('marlboro', 20).pack?.kind).toBe('empty-pack')
    expect(empty('marlboro', 19).pack).toBeUndefined()
    expect(empty('joints', 0).pack).toBeUndefined()
    const nobody = v.step({ type: 'empty', id: 'z', kind: 'pbr', left: 0 })
    expect(nobody.pack).toBeUndefined()
    expect(nobody.reply).toBeUndefined()
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
    // In the bed, 'b' visits nothing. The riding flag in their frame does
    // not keep them out: the bed does.
    expect(citgoVisits(seated(v.valley, 'b'), placed)).toEqual([
      { id: 'a', station: 1 },
    ])
    v.step({ type: 'visit', id: 'a', station: 1 })
    expect(citgoVisits(seated(v.valley, 'b'), placed)).toEqual([])
    expect(citgoVisits(v.valley, placed)).toEqual([{ id: 'b', station: 1 }])
  })

  it('says who stands at a payphone their account has not found', () => {
    const v = valleyWith(join('a'), join('b'), join('c'))
    const at = PAYPHONES[0]
    const placed: Placed[] = [
      { id: 'a', at: standing(at.x + 1, at.z) },
      { id: 'b', at: standing(at.x, at.z + 1) },
      { id: 'c', at: standing(at.x + 40, at.z) },
    ]
    expect(phoneVisits(seated(v.valley, 'b'), placed)).toEqual([
      { id: 'a', phone: 0 },
    ])
    const found = v.step({ type: 'find-phone', id: 'a', phone: 0 })
    expect(found.citgos).toEqual({
      account: 'acct-a',
      log: { last: null, visited: [], phones: [0] },
    })
    // Found pays nothing, and is never the last Citgo.
    expect(found.earn).toBeUndefined()
    expect(found.xp).toBeUndefined()
    expect(phoneVisits(v.valley, placed)).toEqual([{ id: 'b', phone: 0 }])
    expect(citgosFor(v.valley, 'acct-a').last).toBeNull()
    // Again, or a payphone the world never placed: nothing.
    expect(v.step({ type: 'find-phone', id: 'a', phone: 0 }).citgos).toBe(
      undefined
    )
    expect(v.step({ type: 'find-phone', id: 'a', phone: 1 }).citgos).toBe(
      undefined
    )
    // A visit after keeps the payphones found.
    v.step({ type: 'visit', id: 'a', station: 1 })
    expect(citgosFor(v.valley, 'acct-a')).toEqual({
      last: 1,
      visited: [1],
      phones: [0],
    })
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

  it('keeps the height of the feet it was set down from', () => {
    const v = valleyWith(join('a'))
    v.step({
      type: 'drop',
      id: 'a',
      kind: 'joints',
      count: 1,
      at: { ...at, y: -30 },
    })
    v.step(drop('a'))
    const [low, unheard] = v.valley.world?.drops ?? []
    expect(low.y).toBe(-30)
    expect(unheard).not.toHaveProperty('y')
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
  const fell = (id: string, at: Facing | null) =>
    ({
      type: 'fall',
      id,
      items: { marlboro: 12, 'gold-bullion': 1 },
      at,
    }) satisfies ValleyAction

  it('gives the key items on an account’s bodies back, and lets an empty body go', () => {
    const v = valleyWith(join('a'), join('b'))
    v.step({
      type: 'fall',
      id: 'a',
      items: { 'vault-key': 1, marlboro: 2 },
      at: { x: 0, z: 0, yaw: 0 },
    })
    v.step({
      type: 'fall',
      id: 'b',
      items: { rose: 1 },
      at: { x: 9, z: 0, yaw: 0 },
    })
    const r = v.step({ type: 'keys-back', account: 'acct-a' })
    expect(r.give).toEqual({ account: 'acct-a', items: { 'vault-key': 1 } })
    expect(r.broadcast).toEqual([])
    expect(v.valley.corpses.find((c) => c.account === 'acct-a')?.items).toEqual(
      { marlboro: 2 }
    )
    const b = v.step({ type: 'keys-back', account: 'acct-b' })
    expect(b.give).toEqual({ account: 'acct-b', items: { rose: 1 } })
    expect(b.broadcast[0]).toMatchObject({ reason: 'looted', corpse: 1 })
    expect(corpsesOf(v.valley, 'acct-b')).toEqual([])
    // Nothing left to give back: nothing to do.
    expect(
      v.step({ type: 'keys-back', account: 'acct-a' }).give
    ).toBeUndefined()
  })

  it('spills a share of the wallet in dimes where the raider fell, for anyone', () => {
    const v = valleyWith(join('a'), join('b'))
    v.setCash(1234)
    const dimes = Math.floor((1234 * CONFIG.corpses.walletShare) / DIME_CENTS)
    const r = v.step(fell('a', { x: 40, z: 50, yaw: 0 }))
    expect(r.spend).toEqual({ account: 'acct-a', amount: dimes * DIME_CENTS })
    const drop = v.valley.world?.drops.at(-1)
    expect(drop).toMatchObject({ kind: 'dimes', count: dimes, x: 40, z: 50 })
    // Whoever gets there first takes them up.
    const taken = v.step({
      type: 'take-drop',
      id: 'b',
      drop: drop?.id ?? -1,
      at: { x: 40, z: 50 },
    })
    expect(taken.earn).toEqual({
      account: 'acct-b',
      amount: dimes * DIME_CENTS,
    })
  })

  it('lays the body and its dimes at the height the raider fell from', () => {
    const v = valleyWith(join('a'), join('b'))
    v.setCash(1234)
    v.step(fell('a', { x: 40, y: -30, z: 50, yaw: 0 }))
    expect(v.valley.world?.drops.at(-1)?.y).toBe(-30)
    const wire = toWire(v.valley)?.corpses
    expect(wire).toEqual([expect.objectContaining({ x: 40, y: -30, z: 50 })])
    // A raider the valley heard no height of: none on the wire.
    v.step(fell('b', { x: 1, z: 1, yaw: 0 }))
    expect(toWire(v.valley)?.corpses.at(-1)).not.toHaveProperty('y')
  })

  it('spills nothing from an empty wallet, or where no one heard the raider', () => {
    const v = valleyWith(join('a'))
    v.setCash(5)
    expect(v.step(fell('a', { x: 0, z: 0, yaw: 0 })).spend).toBeUndefined()
    v.setCash(5000)
    const r = v.step(fell('a', null))
    expect(r.spend).toBeUndefined()
    expect(v.valley.world?.drops).toEqual([])
  })

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
    // A second fall lays one body, and what the first held is lost.
    const again = v.step({
      type: 'fall',
      id: 'a',
      items: { marlboro: 2, cabbage: 1 },
      at: { x: 0, z: 0, yaw: 0 },
    })
    expect(again.corpse).toBe(1)
    expect(corpsesOf(v.valley, 'acct-a')).toEqual([1])
    expect(v.valley.corpses[0].items).toEqual({ marlboro: 2, cabbage: 1 })
    // Another account's body lies on.
    v.step(fell('b', { x: 1, z: 1, yaw: 0 }))
    expect(v.valley.corpses.map((c) => c.id)).toEqual([1, 2])
  })

  it('takes the first body away on a second fall that lays none', () => {
    const v = valleyWith(join('a'), join('b'))
    v.step(fell('a', { x: 40, z: -12, yaw: 1 }))
    v.step(fell('b', { x: 1, z: 1, yaw: 0 }))
    const empty = v.step({
      type: 'fall',
      id: 'a',
      items: {},
      at: { x: 0, z: 0, yaw: 0 },
    })
    expect(empty.corpse).toBeUndefined()
    expect(empty.broadcast[0]).toMatchObject({ reason: 'fell', by: 'a' })
    expect(empty.broadcast[0].world?.corpses.map((c) => c.id)).toEqual([1])
    expect(corpsesOf(v.valley, 'acct-a')).toEqual([])
    // Nowhere heard, the same.
    v.step(fell('a', { x: 40, z: -12, yaw: 1 }))
    expect(v.step(fell('a', null)).corpse).toBeUndefined()
    expect(corpsesOf(v.valley, 'acct-a')).toEqual([])
    expect(corpsesOf(v.valley, 'acct-b')).toEqual([1])
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

  it('never takes a key item into the locker, but lets one out', () => {
    const v = valleyWith(join('a'))
    expect(
      v.step(stow('a', at(-17, 0), 'stow', 'vault-key', 1)).reply
    ).toMatchObject({ re: 'stow', reason: 'key-item' })
    expect(v.step(stow('a', at(-17, 0), 'unstow', 'rose', 1)).stash).toEqual({
      account: 'acct-a',
      kind: 'rose',
      delta: -1,
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

describe('rule 31: the laptop', () => {
  const at = (x: number, z: number) => ({ x, z })
  const dial: ValleyAction = {
    type: 'dial',
    id: 'p',
    account: 'acct-p',
    name: 'P',
    outfit: 'coleman',
    level: 3,
  }
  const laptop = (
    id: string,
    where: { x: number; z: number } | null,
    re: LaptopRe = 'laptop-list'
  ): ValleyAction => ({ type: 'laptop', id, re, at: where })

  it('opens the files to the account at any Citgo, changing nothing', () => {
    const v = valleyWith(join('a'))
    const before = v.valley
    const r = v.step(laptop('a', at(2000 - 15, 4), 'laptop-save'))
    expect(r.reply).toBeUndefined()
    expect(r.laptop).toEqual({ account: 'acct-a' })
    expect(r.broadcast).toEqual([])
    expect(r.valley.world?.pickups).toEqual(before.world?.pickups)
  })

  it('opens no laptop away from a Citgo, from the bed, dialed in or for a stranger', () => {
    const v = valleyWith(join('a'), dial)
    const far = CONFIG.laptop.stationReach + 1
    expect(v.step(laptop('a', at(far, 0), 'laptop-read')).reply).toEqual({
      type: 'nack',
      re: 'laptop-read',
      reason: 'no-laptop',
    })
    expect(v.step(laptop('a', null)).reply).toMatchObject({
      reason: 'no-laptop',
    })
    expect(v.step(laptop('p', at(0, 0), 'laptop-delete')).reply).toEqual({
      type: 'nack',
      re: 'laptop-delete',
      reason: 'dialup',
    })
    expect(v.step(laptop('nobody', at(0, 0))).reply).toMatchObject({
      reason: 'not-in-valley',
    })
    v.step({ type: 'board', id: 'a', at: HERE })
    expect(v.step(laptop('a', at(0, 0))).reply).toMatchObject({
      reason: 'aboard',
    })
  })
})

describe('rule 33: the Recycling Center at the recycling machine', () => {
  const beside = { x: RECYCLERS[0].x + 1, z: RECYCLERS[0].z }
  // Any Citgo's machine takes them.
  const besideThird = { x: RECYCLERS[2].x, z: RECYCLERS[2].z - 1 }
  const [first, second] = CONFIG.recycling.lines.dimes
  const recycle = (
    valley: Valley,
    action: ValleyAction,
    levels: Research,
    pack: Inventory
  ) =>
    reduce(valley, action, {
      now: T0,
      present: ['a'],
      research: { levels, pack },
    })
  const empties = { 'empty-can': 100, 'empty-pack': 100, 'empty-bottle': 100 }

  it('keeps where each recycling machine stands with the world', () => {
    expect(valleyWith(join('a')).valley.world?.recyclers).toEqual(RECYCLERS)
  })

  it("buys a line's next level with its empties, beside the recycling machine", () => {
    const v = valleyWith(join('a'))
    const action: ValleyAction = {
      type: 'recycle',
      id: 'a',
      line: 'dimes',
      at: beside,
    }
    expect(recycle(v.valley, action, FRESH_RESEARCH, empties).research).toEqual(
      {
        account: 'acct-a',
        line: 'dimes',
        level: 1,
        items: first.price,
      }
    )
    expect(
      recycle(v.valley, action, { dimes: 1 }, empties).research
    ).toMatchObject({ level: 2, items: second.price })
    // Past the last listed level there is always a next.
    const listed = CONFIG.recycling.lines.dimes.length
    const past = { dimes: listed }
    const price = priceOf(past, 'dimes')
    expect(recycle(v.valley, action, past, price).research).toMatchObject({
      level: listed + 1,
      items: price,
    })
    // At another Citgo's machine the same.
    expect(
      recycle(v.valley, { ...action, at: besideThird }, FRESH_RESEARCH, empties)
        .research
    ).toMatchObject({ level: 1 })
  })

  it('refuses away from the recycling machine, short of empties, or unread', () => {
    const v = valleyWith(join('a'))
    const at = (where: XZ | null): ValleyAction => ({
      type: 'recycle',
      id: 'a',
      line: 'dimes',
      at: where,
    })
    const reason = (r: Reduced) => r.reply?.reason
    expect(
      reason(recycle(v.valley, at({ x: 900, z: 900 }), FRESH_RESEARCH, empties))
    ).toBe('no-recycler')
    expect(reason(recycle(v.valley, at(null), FRESH_RESEARCH, empties))).toBe(
      'no-recycler'
    )
    expect(
      reason(recycle(v.valley, at(beside), FRESH_RESEARCH, { 'empty-can': 1 }))
    ).toBe('short')
    expect(
      reduce(v.valley, at(beside), { now: T0, present: ['a'] }).reply?.reason
    ).toBe('unavailable')
    expect(
      reason(
        recycle(
          v.valley,
          { type: 'recycle', id: 'z', line: 'dimes', at: beside },
          FRESH_RESEARCH,
          empties
        )
      )
    ).toBe('not-in-valley')
  })

  it('lets a raider dialed in recycle from anywhere (rule 29)', () => {
    const v = valleyWith({
      type: 'dial',
      id: 'a',
      account: 'acct-a',
      name: 'A',
      outfit: 'coleman',
      level: 1,
    })
    const r = recycle(
      v.valley,
      { type: 'recycle', id: 'a', line: 'dimes', at: null },
      FRESH_RESEARCH,
      empties
    )
    expect(r.research?.level).toBe(1)
  })

  it("finds loose change over a burst's dimes, for the taker alone", () => {
    const v = valleyWith(join('a'))
    v.step({ type: 'spill', spills: [{ x: 1, z: 2, kind: 'dimes', count: 6 }] })
    const take = (roll: number, levels: Research) =>
      reduce(
        v.valley,
        { type: 'take-drop', id: 'a', drop: 0, at: HERE, roll },
        { now: T0, present: ['a'], research: { levels } }
      )
    // Under the chance: as many again, into the wallet.
    const lucky = take(first.chance / 2, { dimes: 1 })
    expect(lucky.earn).toEqual({ account: 'acct-a', amount: 120 })
    expect(lucky.found).toEqual({ account: 'acct-a', dimes: 6 })
    // The drop and what everyone sees of it are as they were.
    expect(lucky.broadcast[0]).toMatchObject({ item: 'dimes', count: 6 })
    // Over the chance, or with no research: only what lay there.
    expect(take(first.chance, { dimes: 1 }).earn?.amount).toBe(60)
    expect(take(0, FRESH_RESEARCH).found).toBeUndefined()
    expect(take(0, FRESH_RESEARCH).earn?.amount).toBe(60)
  })

  it("never finds more in a raider's spilled wallet", () => {
    const v = valleyWith(join('a'), join('b'))
    v.step({
      type: 'fall',
      id: 'b',
      items: {},
      at: { x: 1, z: 2, yaw: 0 },
    })
    const drop = v.valley.world?.drops.find((d) => d.kind === 'dimes')
    expect(drop).toBeDefined()
    expect(drop?.burst).toBeUndefined()
    const r = reduce(
      v.valley,
      { type: 'take-drop', id: 'a', drop: drop?.id ?? -1, at: HERE, roll: 0 },
      {
        now: T0,
        present: ['a', 'b'],
        cash: 100_00,
        research: { levels: { dimes: 5 } },
      }
    )
    expect(r.found).toBeUndefined()
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
    // Past the last listed level there is always a next.
    const past = { ...FRESH_STAND, level: CONFIG.stand.levels.length }
    const dear = upgradePrice(past)
    const on = tend(
      v.valley,
      { type: 'stand-upgrade', id: 'a', at: beside },
      { ledger: past, pack: { ...dear.items }, cash: dear.cash }
    )
    expect(on.reply).toBeUndefined()
    expect(on.stand).toMatchObject({
      re: 'upgrade',
      ledger: { level: past.level + 1 },
      items: dear.items,
      cash: -dear.cash,
    })
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

describe('rule 20: what a find pays', () => {
  it('pays the Keep its bounty and XP, and nothing else anything', () => {
    expect(findsPay('acct-a', ['keep', 'marx'])).toEqual({
      cents: CONFIG.bounties.keep,
      xp: [{ account: 'acct-a', source: 'landmark' }],
    })
    expect(findsPay('acct-a', ['marx', 'citgo'])).toEqual({ cents: 0, xp: [] })
    expect(findsPay('acct-a', [])).toEqual({ cents: 0, xp: [] })
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

  it('earns nothing for a charter round the block', () => {
    const near = { x: ROUTES.home.x + 50, z: ROUTES.home.z }
    const v = valleyWith(join('a'), { type: 'board', id: 'a', at: HERE })
    v.step({ type: 'charter', id: 'a', to: near })
    v.step({ type: 'clock' })
    const truck = v.valley.world?.truck
    const due = truck ? nextChange(truck, ROUTES) : null
    v.tick((due ?? v.now) - v.now)
    const there = v.step({ type: 'clock' })
    expect(reasons(there)).toEqual(['dropoff'])
    expect(there.xp).toBeUndefined()
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
      {
        id: 0,
        kind: 'dimes',
        count: 7,
        x: 10,
        z: 20,
        spilled: true,
        burst: true,
      },
      {
        id: 1,
        kind: 'dimes',
        count: 3,
        x: 50,
        z: 60,
        spilled: true,
        burst: true,
      },
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
      {
        id: 0,
        kind: 'gold-bullion',
        count: 1,
        x: 1,
        z: 2,
        spilled: true,
        burst: true,
      },
      {
        id: 1,
        kind: 'gold-bullion',
        count: 1,
        x: 1.5,
        z: 2,
        spilled: true,
        burst: true,
      },
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
    // A frame's word that it rides is not the bed: a client that says so
    // on foot is rushed like anyone.
    expect(vulnerable(state({ riding: true }))).toBe(true)
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

  it('opens the world with where its moat lies', () => {
    const moat = { x: 2000, z: 2000, yaw: 0.35 }
    const v = valleyWith({ ...join('a'), moat } as ValleyAction).valley
    expect(v.world?.moat).toEqual(moat)
  })

  it('gives each raider the height of their feet, for the shadows', () => {
    const v = valley()
    const [r] = shadowRaiders(
      v,
      createShadows(),
      [{ id: 'a', at: state({ y: 12.5 }) }],
      T0
    )
    expect(r.y).toBe(12.5)
  })

  it('lights a raider holding a torch all round, with no beam', () => {
    const v = valley()
    const [torch, bare] = shadowRaiders(
      v,
      createShadows(),
      [
        { id: 'a', at: state({ held: 'torch' }) },
        { id: 'b', at: state({ light: true }) },
      ],
      T0
    )
    expect(torch.torch).toBe(true)
    expect(torch.beam).toBeNull()
    expect(bare.torch).toBe(false)
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

  it('aims no beam for a raider holding a jar or a rod, light or not', () => {
    const v = valley()
    const raiders = shadowRaiders(
      v,
      createShadows(),
      [
        { id: 'a', at: state({ light: true, held: 'jar' }) },
        { id: 'b', at: state({ light: true, held: 'rod' }) },
      ],
      T0
    )
    expect(raiders.map((r) => r.beam)).toEqual([null, null])
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
    const v = seated(valley(), 'b')
    const shadows = createShadows()
    // From the bed, so it stands still to burn rather than rushing.
    const placed = [{ id: 'b', at: state({ light: true }) }]
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
    const v = seated(valley(), 'b')
    const shadows = createShadows()
    // From the bed, light down, so the one placed stands still to burn.
    const placed = [{ id: 'b', at: state() }]
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
    const v = seated(valley(), 'b')
    const shadows = createShadows()
    const placed = [{ id: 'b', at: state({ light: true }) }]
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
    let strikers: Record<string, string> = {}
    for (let i = 0; i < 100 && struck.length === 0; i++) {
      const out = stepShadows(v, shadows, placed, mulberry32(i), {
        now: T0 + i * 100,
        dt: 0.1,
      })
      expect(out?.message.shadowmen).toEqual([])
      struck = out?.struck ?? []
      strikers = out?.strikers ?? {}
    }
    expect(struck).toEqual(['a'])
    expect(strikers).toEqual({ a: 'shade' })
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
    for (let i = 0; i < 20 && !out?.struck.length; i++) {
      shadows.field.shadowmen = []
      out = stepShadows(v, shadows, placed, mulberry32(1), {
        now: T0,
        dt: 0.1,
      })
      wound ||= (out?.message.caretaker?.windup ?? 0) > 0
    }
    expect(wound).toBe(true)
    expect(out?.strikers).toEqual({ b: 'caretaker' })
    expect(out?.struck).toEqual(['b'])
    expect(out?.message.caretaker?.lunge).toBe(true)
    expect(shadows.recovering['acct-b']).toBe(
      T0 + CONFIG.health.graceSeconds * 1000
    )
    // Coming to, they are let be.
    expect(shadows.caretaker.target).toBeNull()
  })

  it('never hunts a raider in the bed, or outside the corn', () => {
    const v = valley()
    for (const [valleyNow, where] of [
      [seated(v, 'b'), state({ ...at(0, 2) })],
      [v, state({ x: MAZE.x - 5, z: MAZE.z - 5 })],
    ] as const) {
      const shadows = createShadows()
      placeCaretaker(valleyNow, shadows, at().x, at().z)
      const out = stepShadows(
        valleyNow,
        shadows,
        [{ id: 'b', at: where }],
        mulberry32(1),
        {
          now: T0,
          dt: 0.1,
        }
      )
      expect(out?.struck).toEqual([])
      expect(shadows.caretaker.target).toBeNull()
    }
  })

  it('shrugs off one beam, is burned by two, and forms again at the heart', () => {
    const v = seated(valley(), 'a', 'b')
    const shadows = createShadows()
    placeCaretaker(v, shadows, at().x, at().z)
    // Down the court from it, looking at it (+z is yaw pi), from the bed so
    // it never comes for them.
    const lit = (dx: number) =>
      state({ ...at(dx, -8), yaw: Math.PI, light: true })
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

describe('rule 24: geometrie', () => {
  const MAX = BASE_GEOMETRIE
  const MAN = CONFIG.damage.man

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
    expect(maxFor(v.valley, 'acct-a')).toBe(MAX)
    expect(v.valley.wounds).toEqual({})
  })

  it("sizes the whole by the account's level, and a new level tops it up", () => {
    const v = valleyWith({ ...joinAs('a'), level: 10 })
    expect(levelFor(v.valley, 'acct-a')).toBe(10)
    expect(healthFor(v.valley, 'acct-a')).toBe(maxGeometrie(10))
    v.step({ type: 'hit', id: 'a', by: 'man', roll: 0.5 })
    expect(healthFor(v.valley, 'acct-a')).toBe(maxGeometrie(10) - MAN)
    const up = v.step({ type: 'level', account: 'acct-a', level: 25 })
    expect(up.health).toEqual({
      account: 'acct-a',
      points: maxGeometrie(25) - MAN,
      max: maxGeometrie(25),
    })
    // Never a level taken back.
    expect(
      v.step({ type: 'level', account: 'acct-a', level: 3 }).health
    ).toBeUndefined()
    expect(levelFor(v.valley, 'acct-a')).toBe(25)
    expect(levelFor(v.valley, 'acct-nobody')).toBe(1)
  })

  it("takes each shadow's hit, and the last shatters and makes whole", () => {
    const v = valleyWith(join('a'))
    const hit = { type: 'hit', id: 'a', by: 'man', roll: 0.5 } as const
    expect(v.step(hit).health).toEqual({
      account: 'acct-a',
      points: MAX - MAN,
      max: MAX,
      hit: { by: 'man', damage: MAN, warded: 0 },
    })
    expect(
      v.step({ type: 'hit', id: 'a', by: 'warden', roll: 0.5 }).health?.hit
    ).toEqual({ by: 'warden', damage: CONFIG.damage.warden, warded: 0 })
    expect(v.valley.wounds).toEqual({})
    expect(healthFor(v.valley, 'acct-a')).toBe(MAX)
    v.step({ type: 'set-health', id: 'a', points: MAN })
    const fatal = v.step(hit)
    expect(fatal.health).toMatchObject({ points: 0, fatal: true })
    expect(healthFor(v.valley, 'acct-a')).toBe(MAX)
  })

  it('takes a fall off it by its height, nothing cutting it', () => {
    const { safe, lethal } = CONFIG.fall
    const v = valleyWith(join('a'))
    // Dosed to the eyes: no ward cuts a fall.
    v.step({ type: 'dose', id: 'a', kind: 'joints' })
    expect(
      v.step({ type: 'plunge', id: 'a', height: safe - 0.5 }).health
    ).toBeUndefined()
    const half = (safe + lethal) / 2
    expect(v.step({ type: 'plunge', id: 'a', height: half }).health).toEqual({
      account: 'acct-a',
      points: MAX - MAX / 2,
      max: MAX,
      hit: { by: 'fall', damage: MAX / 2, warded: 0 },
    })
    // Two stories shatter it, and the account is whole and sober after.
    const fatal = v.step({ type: 'plunge', id: 'a', height: 30 })
    expect(fatal.health).toMatchObject({ points: 0, fatal: true })
    expect(fatal.health?.hit).toEqual({ by: 'fall', damage: MAX, warded: 0 })
    expect(healthFor(v.valley, 'acct-a')).toBe(MAX)
    expect(
      v.step({ type: 'plunge', id: 'nobody', height: 30 }).health
    ).toBeUndefined()
  })

  it("is the account's: a second socket shares it, and a stranger has none", () => {
    const second = { ...joinAs('b'), account: 'acct-a' }
    const v = valleyWith(join('a'), second)
    v.step({ type: 'hit', id: 'a', by: 'spiderling', roll: 0.5 })
    expect(
      v.step({ type: 'hit', id: 'b', by: 'spiderling', roll: 0.5 }).health
        ?.points
    ).toBe(MAX - 2 * CONFIG.damage.spiderling)
    expect(
      v.step({ type: 'hit', id: 'nobody', by: 'man' }).health
    ).toBeUndefined()
    expect(
      v.step({ type: 'mend', id: 'nobody', kind: 'pbr' }).health
    ).toBeUndefined()
  })

  it('gives its share back, never past whole, and says nothing when whole', () => {
    const v = valleyWith(join('a'))
    expect(
      v.step({ type: 'mend', id: 'a', kind: 'pbr' }).health
    ).toBeUndefined()
    v.step({ type: 'set-health', id: 'a', points: 1 })
    expect(v.step({ type: 'mend', id: 'a', kind: 'pbr' }).health?.points).toBe(
      1 + healsOf('pbr', MAX)
    )
    v.step({ type: 'set-health', id: 'a', points: MAX - 10 })
    expect(
      v.step({ type: 'mend', id: 'a', kind: 'joints' }).health?.points
    ).toBe(MAX)
    v.step({ type: 'set-health', id: 'a', points: 1 })
    // A forecourt: its share at a time, never past whole.
    const share = Math.round(CONFIG.health.forecourt.share * MAX)
    expect(v.step({ type: 'mend', id: 'a' }).health?.points).toBe(1 + share)
    v.step({ type: 'set-health', id: 'a', points: MAX - 1 })
    expect(v.step({ type: 'mend', id: 'a' }).health?.points).toBe(MAX)
  })

  it('outlasts a reconnect and a world opened afresh', () => {
    const v = valleyWith(join('a'))
    v.step({ type: 'hit', id: 'a', by: 'man', roll: 0.5 })
    v.step(leaveAs('a'))
    v.step({ type: 'reset' })
    const restored = restoreValley({ ...v.valley, world: null })
    expect(restored.wounds).toEqual({ 'acct-a': MAN })
    // An older build's valley, kept before health was, is whole.
    const { wounds: _, ...older } = createValley()
    expect(restoreValley(older).wounds).toEqual({})
    // One kept as hit points left comes back at the same share of whole.
    expect(
      restoreValley({ ...older, health: { 'acct-a': 100 }, healthMax: 300 })
        .wounds
    ).toEqual({ 'acct-a': 667 })
    expect(restoreValley({ ...older, health: { 'acct-a': 2 } }).wounds).toEqual(
      { 'acct-a': 333 }
    )
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
    // In the bed, no one is made whole; a frame that only says it rides is.
    expect(
      forecourtMends(seated(v.valley, 'a'), [{ id: 'a', at: yard }])
    ).toEqual([])
    expect(
      forecourtMends(v.valley, [{ id: 'a', at: { ...yard, riding: true } }])
    ).toEqual(['a'])
    expect(forecourtMends(v.valley, [{ id: 'a', at: null }])).toEqual([])
  })

  it('counts no spiderling toward the daily task or XP', () => {
    const bed = seated(valleyWith(join('a')).valley, 'a')
    const shadows = createShadows()
    // From the bed, lit, so the brood holds still to burn.
    const placed = [{ id: 'a', at: at({ light: true }) }]
    stepShadows(bed, shadows, placed, mulberry32(1), { now: T0, dt: 0 })
    shadows.field.shadowmen = []
    placeShadowman(shadows, 500, 490, 'spiderling')
    const out = stepShadows(bed, shadows, placed, mulberry32(1), {
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
  const spot = (x: number, z: number) => ({ x, z })
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
    expect(wardsFor(v.valley, 'acct-a', v.now)).toEqual({
      high: 0,
      stimulated: 0,
      drunk: 0,
      tripping: 0,
    })
    const { wards: _, ...older } = createValley()
    expect(restoreValley(older).wards).toEqual({})
  })

  it('doses the user once the unit is out of the pack, fading on its clock', () => {
    const v = valleyWith(join('a'))
    const out = v.step({ type: 'dose', id: 'a', kind: 'joints' })
    const high = getItem('joints').wards.high
    expect(out.wards).toEqual([
      {
        account: 'acct-a',
        levels: { high, stimulated: 0, drunk: 0, tripping: 0 },
      },
    ])
    expect(out.xp).toBeUndefined()
    v.tick(60 * SEC)
    const later = wardsFor(v.valley, 'acct-a', v.now).high
    expect(later).toBeCloseTo(high - 60 * CONFIG.wards.fadePerSecond.high)
    expect(
      v.step({ type: 'dose', id: 'nobody', kind: 'joints' }).wards
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
    for (const rider of ['a', 'b']) {
      const bed = valleyWith(join('a'), join('b'), {
        type: 'board',
        id: rider,
        at: HERE,
      })
      expect(bed.step(pass()).reply?.reason).toBe('not-on-foot')
    }
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
    const { stimulated, drunk } = getItem('four-loko-blue').wards
    const share = CONFIG.buffs.shareScale
    expect(out.wards).toEqual([
      {
        account: 'acct-b',
        levels: { high: 0, stimulated, drunk, tripping: 0 },
      },
      {
        account: 'acct-a',
        levels: {
          high: 0,
          stimulated: stimulated * share,
          drunk: drunk * share,
          tripping: 0,
        },
      },
    ])
    expect(out.xp).toEqual([{ account: 'acct-a', source: 'share' }])
    // A taker gone by then is dosed nothing.
    expect(
      v.step({ type: 'dose', id: 'a', kind: 'pbr', to: 'nobody' }).wards
    ).toBeUndefined()
  })

  it('wards each shadow with its own, and a shattering sobers', () => {
    const v = valleyWith(join('a'))
    const hit = (by: ShadowHit) =>
      v.step({ type: 'hit', id: 'a', by, roll: 0.5 }).health?.hit
    // Sober, nothing is warded.
    expect(hit('caretaker')).toEqual({
      by: 'caretaker',
      damage: CONFIG.damage.caretaker,
      warded: 0,
    })
    v.step({ type: 'set-health', id: 'a', points: BASE_GEOMETRIE })
    v.step({ type: 'dose', id: 'a', kind: 'wild-turkey' })
    v.step({ type: 'dose', id: 'a', kind: 'wild-turkey' })
    const drunk = wardsFor(v.valley, 'acct-a', v.now).drunk
    expect(drunk).toBe(1)
    // Drunk wards the Caretaker hard, the shadowmen only a little.
    expect(hit('caretaker')).toEqual({
      by: 'caretaker',
      ...damageOf('caretaker', wardsFor(v.valley, 'acct-a', v.now), 0.5),
    })
    expect(hit('caretaker')?.damage).toBe(300)
    expect(hit('man')?.damage).toBe(288)
    v.step({ type: 'set-health', id: 'a', points: 1 })
    const fatal = v.step({ type: 'hit', id: 'a', by: 'man', roll: 0.99 })
    expect(fatal.health?.fatal).toBe(true)
    expect(fatal.wards).toEqual([
      {
        account: 'acct-a',
        levels: { high: 0, stimulated: 0, drunk: 0, tripping: 0 },
      },
    ])
    expect(v.valley.wards).toEqual({})
  })

  it('wards the Undercroft with a trip', () => {
    const v = valleyWith(join('a'))
    v.step({ type: 'dose', id: 'a', kind: 'lsd' })
    const levels = wardsFor(v.valley, 'acct-a', v.now)
    expect(levels.tripping).toBe(1)
    const warden = v.step({ type: 'hit', id: 'a', by: 'warden', roll: 0.5 })
    // The trip's ward, and a little for the high besides.
    expect(warden.health?.hit).toEqual({
      by: 'warden',
      ...damageOf('warden', levels, 0.5),
    })
    expect(warden.health?.hit?.damage).toBe(413)
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

describe('rule 29: Bull Valley Dial-Up', () => {
  const dial = (id: string, account = `acct-${id}`): ValleyAction => ({
    type: 'dial',
    id,
    account,
    name: id.toUpperCase(),
    outfit: 'coleman',
    level: 3,
  })

  it('comes into the valley with no body, opening no world', () => {
    const v = valleyWith(dial('p'))
    expect(v.valley.world).toBeNull()
    expect(v.valley.members.p).toMatchObject({
      account: 'acct-p',
      level: 3,
      dialup: true,
    })
    expect(v.last().broadcast).toEqual([
      { type: 'world', reason: 'joined', world: null, by: 'p' },
    ])
  })

  it('pays the truck no mind and keeps those already here', () => {
    const v = valleyWith(join('a'))
    const leg = v.valley.world?.truck.leg
    v.tick(1000)
    v.step(dial('p'))
    expect(v.valley.world?.truck.leg).toEqual(leg)
    expect(Object.keys(v.valley.members).sort()).toEqual(['a', 'p'])
  })

  it('never falls', () => {
    const v = valleyWith(dial('p'))
    expect(
      v.step({ type: 'plunge', id: 'p', height: 30 }).health
    ).toBeUndefined()
  })

  it('refuses whatever takes a body', () => {
    const v = valleyWith(join('a'), dial('p'))
    const refused = (action: ValleyAction) => v.step(action).reply
    const cases: [ValleyAction, string][] = [
      [{ type: 'board', id: 'p', at: HERE }, 'board'],
      [{ type: 'hop-out', id: 'p' }, 'hop-out'],
      [{ type: 'call', id: 'p', from: HERE, at: HERE }, 'call'],
      [{ type: 'charter', id: 'p', to: null }, 'charter'],
      [{ type: 'take', id: 'p', index: 0, at: HERE }, 'take'],
      [{ type: 'collect', id: 'p', bush: 0, at: HERE }, 'collect'],
      [
        {
          type: 'pass',
          id: 'p',
          to: 'a',
          kind: 'pbr',
          from: null,
          at: null,
        },
        'pass',
      ],
      [{ type: 'drop', id: 'p', kind: 'pbr', count: 1, at: null }, 'drop'],
      [{ type: 'take-drop', id: 'p', drop: 0, at: HERE }, 'take-drop'],
      [{ type: 'loot', id: 'p', corpse: 0, at: HERE }, 'loot'],
      [{ type: 'open-portal', id: 'p', at: null }, 'portal'],
      [
        { type: 'quest', id: 'p', quest: 'rose', step: 'lay', at: HERE },
        'quest',
      ],
    ]
    for (const [action, re] of cases) {
      expect(refused(action), action.type).toEqual({
        type: 'nack',
        re,
        reason: 'dialup',
      })
    }
  })

  it("opens the account's locker wherever they are, world or none", () => {
    const v = valleyWith(dial('p'))
    const r = v.step({
      type: 'stow',
      id: 'p',
      kind: 'marlboro',
      count: 2,
      at: null,
    })
    expect(r.reply).toBeUndefined()
    expect(r.stash).toEqual({ account: 'acct-p', kind: 'marlboro', delta: 2 })
    // On foot, the locker is still at a Citgo.
    const w = valleyWith(join('a'))
    expect(
      w.step({ type: 'stow', id: 'a', kind: 'marlboro', count: 2, at: null })
        .reply
    ).toMatchObject({ reason: 'no-locker' })
  })

  it('tends the stand wherever they are', () => {
    const v = valleyWith(dial('p'))
    const r = reduce(
      v.valley,
      { type: 'stand-stock', id: 'p', kind: 'cabbage', count: 2, at: null },
      {
        now: T0,
        present: ['p'],
        stand: { ledger: FRESH_STAND, pack: { cabbage: 2 }, cash: 0 },
      }
    )
    expect(r.reply).toBeUndefined()
    expect(r.stand).toMatchObject({ account: 'acct-p', re: 'stock' })
  })

  it('buys at a Citgo the account has stood at, and no other', () => {
    const v = valleyWith(join('a'), dial('p', 'acct-a'))
    const buy = (station: number): ValleyAction => ({
      type: 'buy',
      id: 'p',
      station,
      kind: 'pbr',
      unit: 0,
      at: null,
    })
    expect(v.step(buy(1)).reply).toMatchObject({
      re: 'buy',
      reason: 'not-visited',
    })
    v.step({ type: 'visit', id: 'a', station: 1 })
    const r = v.step(buy(1))
    expect(r.reply).toBeUndefined()
    expect(r.spend).toEqual({ account: 'acct-a', amount: getItem('pbr').price })
  })

  it('deals with Erwin and takes and hands in the rose from anywhere', () => {
    const v = valleyWith({ ...joinAs('a'), maze: MAZE }, dial('p'))
    v.setPack({ marlboro: 200 })
    const deal = v.step({
      type: 'deal',
      id: 'p',
      kind: 'mushrooms',
      offer: {
        marlboro:
          costIn(goodOf('mushrooms') ?? DEALER_GOODS[0], 'marlboro') ?? 1,
      },
      at: null,
    })
    expect(deal.reply).toBeUndefined()
    expect(deal.barter).toMatchObject({ account: 'acct-p' })
    v.setQuest('none', {})
    expect(
      v.step({
        type: 'quest',
        id: 'p',
        quest: 'rose',
        step: 'accept',
        at: null,
      }).quest
    ).toMatchObject({ account: 'acct-p', to: 'given' })
    v.setQuest('laid', {})
    expect(
      v.step({
        type: 'quest',
        id: 'p',
        quest: 'rose',
        step: 'reward',
        at: null,
      }).quest
    ).toMatchObject({ to: 'done' })
  })
})

describe('rule 30: idle expeditions', () => {
  const NO_LEVELS = { high: 0, stimulated: 0, drunk: 0, tripping: 0 }
  const dial = (id: string, level = 3): ValleyAction => ({
    type: 'dial',
    id,
    account: `acct-${id}`,
    name: id.toUpperCase(),
    outfit: 'coleman',
    level,
  })
  const send = (kind: string, seed = 7): ValleyAction => ({
    type: 'expedition-send',
    id: 'p',
    kind,
    seed,
  })
  const claim: ValleyAction = { type: 'expedition-claim', id: 'p' }
  const ctx = (run: ExpeditionRun | null, now = T0, cash = 100_000) => ({
    now,
    present: ['p', 'a'],
    expedition: { run },
    cash,
  })

  it('sends a run out from the phone, timed and seeded by the valley', () => {
    const v = valleyWith(dial('p'))
    const r = reduce(v.valley, send('corn', 99), ctx(null))
    expect(r.reply).toBeUndefined()
    expect(r.expedition).toEqual({
      account: 'acct-p',
      run: {
        id: 'corn',
        startedAt: T0,
        endsAt: T0 + CONFIG.expeditions.runs.corn.minutes * 60_000,
        seed: 99,
        ward: 0,
      },
    })
  })

  it('takes its buy-in out of the wallet, and refuses a wallet short of it', () => {
    const v = valleyWith(dial('p'))
    const { cost } = CONFIG.expeditions.runs.corn
    expect(reduce(v.valley, send('corn'), ctx(null, T0, cost)).spend).toEqual({
      account: 'acct-p',
      amount: cost,
    })
    const short = reduce(v.valley, send('corn'), ctx(null, T0, cost - 1))
    expect(short.reply?.reason).toBe('short')
    expect(short.expedition).toBeUndefined()
    // The ride costs nothing.
    const ride = reduce(v.valley, send('ride'), ctx(null, T0, 0))
    expect(ride.reply).toBeUndefined()
    expect(ride.spend).toBeUndefined()
  })

  it('refuses a second run, a locked one, an unknown one, and one on foot', () => {
    const v = valleyWith(join('a'), dial('p'))
    const out = embark(null, 'ride', 1, NO_LEVELS, T0, 1) as ExpeditionRun
    const reason = (action: ValleyAction, run: ExpeditionRun | null = null) =>
      reduce(v.valley, action, ctx(run)).reply?.reason
    expect(reason(send('corn'), out)).toBe('busy')
    expect(reason(send('undercroft'))).toBe('locked')
    expect(reason(send('moon'))).toBe('unknown')
    expect(
      reduce(
        v.valley,
        { type: 'expedition-send', id: 'a', kind: 'ride', seed: 1 },
        ctx(null)
      ).reply?.reason
    ).toBe('not-dialup')
    expect(
      reduce(v.valley, send('ride'), { now: T0, present: ['p'] }).reply?.reason
    ).toBe('unavailable')
  })

  it('brings a run home once its time is up, with its haul and its XP', () => {
    const v = valleyWith(dial('p'))
    const run = embark(null, 'ride', 3, NO_LEVELS, T0, 5) as ExpeditionRun
    expect(reduce(v.valley, claim, ctx(null)).reply?.reason).toBe('none')
    expect(
      reduce(v.valley, claim, ctx(run, run.endsAt - 1)).reply?.reason
    ).toBe('out')
    const r = reduce(v.valley, claim, ctx(run, run.endsAt))
    expect(r.reply).toBeUndefined()
    expect(r.expedition).toEqual({
      account: 'acct-p',
      run: null,
      outcome: outcomeOf(run),
    })
    expect(r.xp).toEqual([
      { account: 'acct-p', source: 'expedition', times: outcomeOf(run).xp },
    ])
    expect(r.health).toBeUndefined()
  })

  it('takes geometrie off a run that came back hurt', () => {
    const v = valleyWith(dial('p'))
    const seed = Array.from({ length: 200 }, (_, i) => i + 1).find(
      (s) =>
        outcomeOf({ id: 'corn', startedAt: 0, endsAt: 0, seed: s, ward: 0 })
          .hurt
    )
    const run = embark(null, 'corn', 3, NO_LEVELS, T0, seed!) as ExpeditionRun
    const r = reduce(v.valley, claim, ctx(run, run.endsAt))
    const max = maxFor(v.valley, 'acct-p')
    const points = max - Math.round(CONFIG.expeditions.runs.corn.hurt * max)
    expect(r.health).toEqual({ account: 'acct-p', points, max })
    expect(healthFor(r.valley, 'acct-p')).toBe(points)
  })
})

describe('rule 34: parties', () => {
  const invite = (id: string, name: string): ValleyAction => ({
    type: 'invite',
    id,
    name,
  })
  const names = (v: { valley: Valley }, account: string) =>
    partyOf(v.valley.parties, account)?.members.map((m) => m.name) ?? []

  it('invites a raider in the valley, who joins by inviting back', () => {
    const v = valleyWith(join('a'), join('b'), join('c'))
    let r = v.step(invite('a', 'b'))
    expect(r.party).toEqual(['acct-b'])
    expect(r.partyNews).toEqual([
      { account: 'acct-b', news: 'invited', name: 'A' },
      { account: 'acct-a', news: 'sent', name: 'B' },
    ])
    r = v.step(invite('b', 'a'))
    expect(r.party).toEqual(['acct-a', 'acct-b'])
    expect(r.partyNews).toEqual([
      { account: 'acct-a', news: 'joined', name: 'B' },
      { account: 'acct-b', news: 'joined', name: 'B' },
    ])
    expect(names(v, 'acct-a')).toEqual(['A', 'B'])
    // Nothing of it on the world's wire.
    expect(JSON.stringify(r.broadcast)).not.toContain('acct-')
  })

  it('refuses one not in the valley, and says why the rest are refused', () => {
    const v = valleyWith(join('a'), join('b'))
    expect(v.step(invite('a', 'nobody')).reply).toEqual({
      type: 'nack',
      re: 'invite',
      reason: 'not-here',
    })
    expect(v.step(invite('a', 'a')).reply?.reason).toBe('self')
    v.step(invite('a', 'b'))
    expect(v.step(invite('a', 'B')).reply?.reason).toBe('already-invited')
    expect(v.step({ type: 'party-leave', id: 'a' }).reply).toEqual({
      type: 'nack',
      re: 'party-leave',
      reason: 'no-party',
    })
  })

  it('lets a raider leave, telling everyone in it, and a party of one is none', () => {
    const v = valleyWith(join('a'), join('b'), join('c'))
    v.step(invite('a', 'b'))
    v.step(invite('b', 'a'))
    v.step(invite('a', 'c'))
    v.step(invite('c', 'a'))
    const r = v.step({ type: 'party-leave', id: 'c' })
    expect(r.party).toEqual(['acct-a', 'acct-b', 'acct-c'])
    expect(r.partyNews?.map((n) => n.account)).toEqual([
      'acct-a',
      'acct-b',
      'acct-c',
    ])
    expect(names(v, 'acct-a')).toEqual(['A', 'B'])
    v.step({ type: 'party-leave', id: 'b' })
    expect(v.valley.parties.parties).toEqual([])
  })

  it('keeps a raider whose line dropped and came back, and drops one gone past the linger', () => {
    const v = valleyWith(join('a'), join('b'), join('c'))
    v.step(invite('a', 'b'))
    v.step(invite('b', 'a'))
    v.step(invite('a', 'c'))
    v.step(invite('c', 'a'))
    // B's socket goes: away, and A and C are sent it.
    let r = v.step(leaveAs('b'))
    expect(r.party).toEqual(['acct-a', 'acct-b', 'acct-c'])
    // Back within the linger: still in it.
    v.tick(CONFIG.net.lingerMs / 2)
    v.step(join('b'))
    expect(names(v, 'acct-a')).toEqual(['A', 'B', 'C'])
    // C goes, and the valley's linger timer drops them.
    v.step(leaveAs('c'))
    r = v.step({ type: 'party-drop', account: 'acct-c' })
    expect(r.partyNews).toEqual([
      { account: 'acct-a', news: 'left', name: 'C' },
      { account: 'acct-b', news: 'left', name: 'C' },
    ])
    expect(names(v, 'acct-a')).toEqual(['A', 'B'])
    // A drop for an account back in the valley does nothing.
    expect(v.step({ type: 'party-drop', account: 'acct-a' }).party).toBe(
      undefined
    )
  })

  it('drops one gone past the linger on the next arrival, timer or no timer', () => {
    const v = valleyWith(join('a'), join('b'))
    v.step(invite('a', 'b'))
    v.step(invite('b', 'a'))
    v.step(leaveAs('b'))
    v.tick(CONFIG.net.lingerMs + 1)
    const r = v.step(join('c'))
    expect(r.partyNews).toEqual([
      { account: 'acct-a', news: 'left', name: 'B' },
    ])
    expect(v.valley.parties.parties).toEqual([])
  })

  it('follows a new name from Your Name', () => {
    const v = valleyWith(join('a'), join('b'))
    v.step(invite('a', 'b'))
    v.step(invite('b', 'a'))
    const r = v.step({ type: 'appearance', id: 'b', name: 'Bee' })
    expect(r.party).toEqual(['acct-a', 'acct-b'])
    expect(names(v, 'acct-a')).toEqual(['A', 'Bee'])
  })

  it('credits the Caretaker to a burner’s party members standing near', () => {
    const v = valleyWith(join('a'), join('b'), join('c'), join('d'))
    v.step(invite('a', 'b'))
    v.step(invite('b', 'a'))
    v.step(invite('a', 'c'))
    v.step(invite('c', 'a'))
    const far = CONFIG.party.creditRadius + 1
    const raiders = [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: 5, z: 0 },
      { id: 'c', x: far, z: 0 },
      { id: 'd', x: 1, z: 0 },
    ]
    expect(creditedWithParty(v.valley, ['a'], raiders)).toEqual([
      'acct-a',
      'acct-b',
    ])
    expect(creditedWithParty(v.valley, ['d'], raiders)).toEqual(['acct-d'])
  })
})

describe('rule 37: waypoints', () => {
  const mark = (id: string, points: XZ[]): ValleyAction => ({
    type: 'mark',
    id,
    points,
  })

  it('keeps an account its pins, inside the survey, for every socket on it', () => {
    const v = valleyWith(join('a'))
    const pins = [
      { x: 10, z: -20 },
      { x: METRES.width, z: 0 },
    ]
    const reduced = v.step(mark('a', pins))
    expect(reduced.waypoints).toEqual({
      account: 'acct-a',
      points: [{ x: 10, z: -20 }],
    })
    expect(waypointsFor(v.valley, 'acct-a')).toEqual([{ x: 10, z: -20 }])
    expect(waypointsFor(v.valley, 'acct-b')).toEqual([])
    // Cleared.
    v.step(mark('a', []))
    expect(waypointsFor(v.valley, 'acct-a')).toEqual([])
  })

  it('keeps the newest WAYPOINT_MAX and answers even unchanged', () => {
    const v = valleyWith(join('a'))
    const many = Array.from({ length: WAYPOINT_MAX + 2 }, (_, i) => ({
      x: i,
      z: 0,
    }))
    v.step(mark('a', many))
    const kept = waypointsFor(v.valley, 'acct-a')
    expect(kept).toEqual(many.slice(-WAYPOINT_MAX))
    const again = v.step(mark('a', many))
    expect(again.valley).toBe(v.valley)
    expect(again.waypoints?.points).toEqual(kept)
  })

  it('carries over a restore, and ignores a stranger', () => {
    const v = valleyWith(join('a'))
    v.step(mark('a', [{ x: 1, z: 2 }]))
    const stored = JSON.parse(JSON.stringify(v.valley)) as Valley
    expect(waypointsFor(restoreValley(stored), 'acct-a')).toEqual([
      { x: 1, z: 2 },
    ])
    const { waypoints: _, ...older } = stored
    expect(restoreValley(older).waypoints).toEqual({})
    expect(v.step(mark('nobody', [{ x: 1, z: 1 }])).waypoints).toBeUndefined()
  })
})

describe('rule 36: fishing and the firefly pond', () => {
  const shore = POND.landing
  const holding = (pack: Inventory) => ({ pack, cosmetics: [] })
  const tackle: Inventory = { 'fishing-rod': 1, nightcrawlers: 5, berries: 1 }
  const fish = (
    valley: Valley,
    action: ValleyAction,
    pack: Inventory | null = tackle,
    now = T0
  ) =>
    reduce(valley, action, {
      now,
      present: ['a'],
      ...(pack ? { holdings: holding(pack) } : {}),
    })
  const cast = (over: Partial<ValleyAction> = {}): ValleyAction =>
    ({
      type: 'cast',
      id: 'a',
      bait: 'nightcrawlers',
      at: shore,
      roll: 0.999,
      seed: 1234,
      ...over,
    }) as ValleyAction
  const reel = (over: Partial<ValleyAction> = {}): ValleyAction =>
    ({
      type: 'reel',
      id: 'a',
      landed: true,
      roll: 0.999,
      bonus: 0,
      skillRoll: 1,
      ...over,
    }) as ValleyAction
  const reason = (r: Reduced) => r.reply?.reason
  // A line out on the first raider, and when it bit.
  const hooked = () => {
    const v = valleyWith(join('a'))
    const r = fish(v.valley, cast())
    const line = r.valley.lines.a
    return { valley: r.valley, line, r }
  }

  it('keeps where the ponds lie with the world', () => {
    expect(valleyWith(join('a')).valley.world?.ponds).toEqual([POND, FAR_POND])
  })

  it('turns every shadow aside at the pond, as at a forecourt (rule 11)', () => {
    const world = valleyWith(join('a')).valley.world!
    expect(shadeHavens(world)).toEqual([
      ...HAVENS,
      { x: POND.x, z: POND.z, radius: POND.radius },
      { x: FAR_POND.x, z: FAR_POND.z, radius: FAR_POND.radius },
    ])
    expect(shadeHavens({ ...world, ponds: [] })).toEqual(HAVENS)
  })

  it('lets no shadow touch a raider in the fireflies', () => {
    const v = valleyWith(join('a')).valley
    const shadows = createShadows()
    const at: PeerStateWire = {
      x: POND.x,
      y: 0,
      z: POND.z,
      yaw: 0,
      pitch: 0,
      pose: 'stand',
      riding: false,
      light: false,
    }
    const placed = [{ id: 'a', at }]
    stepShadows(v, shadows, placed, mulberry32(1), { now: T0, dt: 0 })
    shadows.field.shadowmen = []
    placeShadowman(shadows, POND.x, POND.z + 1)
    placeShadowman(shadows, POND.x + 1, POND.z, 'spider')
    let struck: string[] = []
    for (let i = 0; i < 20; i++) {
      const out = stepShadows(v, shadows, placed, mulberry32(1), {
        now: T0,
        dt: 0.1,
      })
      struck = [...struck, ...(out?.struck ?? [])]
    }
    expect(struck).toEqual([])
  })

  it('gives a rod out of the tackle box to a pack without one', () => {
    const v = valleyWith(join('a'))
    const r = fish(v.valley, { type: 'tackle', id: 'a', at: shore }, {})
    expect(r.pack).toEqual({ account: 'acct-a', kind: 'fishing-rod', delta: 1 })
    expect(r.angler?.message).toMatchObject({ type: 'angler', rod: true })
    expect(reason(fish(v.valley, { type: 'tackle', id: 'a', at: shore }))).toBe(
      'has-rod'
    )
    expect(
      reason(fish(v.valley, { type: 'tackle', id: 'a', at: shore }, null))
    ).toBe('unavailable')
  })

  it('digs nightcrawlers on the roll, then rests the bank', () => {
    const v = valleyWith(join('a'))
    const dig = (roll: number): ValleyAction => ({
      type: 'dig',
      id: 'a',
      at: shore,
      roll,
    })
    const r = fish(v.valley, dig(0.999), null)
    const { max, cooldownSeconds } = CONFIG.fishing.dig
    expect(r.pack).toEqual({
      account: 'acct-a',
      kind: 'nightcrawlers',
      delta: max,
    })
    expect(r.angler?.message.dug).toBe(max)
    expect(r.valley.anglers['acct-a'].digAt).toBe(T0 + cooldownSeconds * SEC)
    expect(reason(fish(r.valley, dig(0), null, T0 + SEC))).toBe('too-soon')
    expect(
      fish(r.valley, dig(0), null, T0 + cooldownSeconds * SEC).pack?.delta
    ).toBe(CONFIG.fishing.dig.min)
  })

  it('refuses away from the pond, in the bed, or out of the valley', () => {
    const v = valleyWith(join('a'))
    const far = { x: 0, z: 0 }
    expect(reason(fish(v.valley, cast({ at: far })))).toBe('no-pond')
    expect(reason(fish(v.valley, cast({ at: null })))).toBe('no-pond')
    // Either pond will do.
    expect(fish(v.valley, cast({ at: FAR_POND.landing })).reply).toBeUndefined()
    expect(
      reason(fish(v.valley, { type: 'dig', id: 'a', at: far, roll: 0 }))
    ).toBe('no-pond')
    const aboard = valleyWith(join('a'), { type: 'board', id: 'a', at: HERE })
    expect(reason(fish(aboard.valley, cast()))).toBe('aboard')
    expect(reason(fish(v.valley, cast({ id: 'z' })))).toBe('not-in-valley')
    expect(reason(fish(createValley(), cast()))).toBe('not-in-valley')
  })

  it('casts with the best rod in the pack, the fight and the catch its own', () => {
    const v = valleyWith(join('a'))
    const pack = { ...tackle, 'g-loomis': 1 }
    const r = fish(v.valley, cast(), pack)
    const line = r.valley.lines.a
    expect(line.rod).toBe('g-loomis')
    expect((r.fished as LineMessage).hook?.fight).toEqual(
      fightOf(line.kind, 0, 'g-loomis')
    )
    // A bought rod is a rod: the tackle box keeps its own.
    expect(
      reason(fish(v.valley, { type: 'tackle', id: 'a', at: shore }, pack))
    ).toBe('has-rod')
    // A bass far past the skill, landed on the Loomis, lost without it.
    const on = (rod?: string): Valley => ({
      ...v.valley,
      lines: {
        a: {
          account: 'acct-a',
          kind: 'largemouth-bass',
          skill: 0,
          ...(rod ? { rod } : {}),
          seed: 1,
          bitesAt: T0,
        },
      },
    })
    const at = (rod?: string) =>
      T0 + quickestMs(fightOf('largemouth-bass', 0, rod))
    expect(
      fish(on('g-loomis'), reel({ roll: 0.5 }), null, at('g-loomis')).fished
    ).toMatchObject({ outcome: 'landed' })
    expect(fish(on(), reel({ roll: 0.5 }), null, at()).fished).toMatchObject({
      outcome: 'snap',
    })
  })

  it('casts only with a rod and the bait, and one line at a time', () => {
    const v = valleyWith(join('a'))
    expect(reason(fish(v.valley, cast(), { nightcrawlers: 3 }))).toBe('no-rod')
    expect(reason(fish(v.valley, cast(), { 'fishing-rod': 1 }))).toBe('no-bait')
    expect(reason(fish(v.valley, cast(), null))).toBe('unavailable')
    const { valley } = hooked()
    expect(reason(fish(valley, cast()))).toBe('busy')
  })

  it('keeps the bait when nothing bites, and sends an empty line', () => {
    const v = valleyWith(join('a'))
    const r = fish(v.valley, cast({ roll: 0 }))
    expect(r.pack).toBeUndefined()
    expect(r.valley.lines).toEqual({})
    expect(r.fished).toMatchObject({ type: 'line', hook: null })
    const { bite } = CONFIG.fishing
    const wait = (r.fished as { bitesIn: number }).bitesIn
    expect(wait).toBeGreaterThanOrEqual(bite.min)
    expect(wait).toBeLessThanOrEqual(bite.max)
  })

  it('takes the bait on a bite and deals the fight, never saying the fish', () => {
    const { r, line } = hooked()
    expect(r.pack).toEqual({
      account: 'acct-a',
      kind: 'nightcrawlers',
      delta: -1,
    })
    expect(line).toMatchObject({ account: 'acct-a', skill: 0, seed: 1234 })
    const msg = r.fished as LineMessage
    expect(line.bitesAt).toBe(T0 + msg.bitesIn)
    expect(msg.hook?.fight).toEqual(fightOf(line.kind, 0))
    expect(msg.hook?.seed).toBe(1234)
    expect(JSON.stringify(msg)).not.toContain(line.kind)
  })

  it('lands a spent fish reeled in time: the pack, the count, the XP', () => {
    const v = valleyWith(join('a'))
    const on = (kind: string): Valley => ({
      ...v.valley,
      lines: { a: { account: 'acct-a', kind, skill: 0, seed: 1, bitesAt: T0 } },
    })
    const landed = (kind: string) =>
      fish(on(kind), reel(), null, T0 + quickestMs(fightOf(kind, 0)))
    const r = landed('bluegill')
    expect(r.valley.lines).toEqual({})
    expect(r.pack).toEqual({ account: 'acct-a', kind: 'bluegill', delta: 1 })
    expect(r.fished).toMatchObject({
      type: 'catch',
      outcome: 'landed',
      kind: 'bluegill',
    })
    expect(r.valley.anglers['acct-a'].caught).toBe(1)
    expect(r.xp).toEqual([{ account: 'acct-a', source: 'fish' }])
    expect(r.angler?.message.angler.caught).toBe(1)
    // The junk comes in too, and earns nothing.
    const can = landed('empty-can')
    expect(can.pack?.kind).toBe('empty-can')
    expect(can.xp).toBeUndefined()
  })

  it('raises the skill on a fish above it', () => {
    // A perch on the line for a raider at skill 0.
    const v = valleyWith(join('a'))
    const valley: Valley = {
      ...v.valley,
      lines: {
        a: {
          account: 'acct-a',
          kind: 'yellow-perch',
          skill: 0,
          seed: 1,
          bitesAt: T0,
        },
      },
    }
    const at = T0 + quickestMs(fightOf('yellow-perch', 0))
    // A sure land, a sure rise.
    const r = fish(valley, reel({ roll: 0, skillRoll: 0, bonus: 0 }), null, at)
    expect(r.fished).toMatchObject({ outcome: 'landed', skill: 1, up: true })
    expect(r.valley.anglers['acct-a'].skill).toBe(1)
  })

  it('loses a fish far past the skill, a large one snapping the line', () => {
    const v = valleyWith(join('a'))
    const on = (kind: string): Valley => ({
      ...v.valley,
      lines: { a: { account: 'acct-a', kind, skill: 0, seed: 1, bitesAt: T0 } },
    })
    const at = (kind: string) => T0 + quickestMs(fightOf(kind, 0))
    const small = fish(
      on('bullhead'),
      reel({ roll: 0.99 }),
      null,
      at('bullhead')
    )
    expect(small.fished).toMatchObject({ outcome: 'skill' })
    expect(small.pack).toBeUndefined()
    // A loss counts toward the day, as FFXI's fatigue does.
    expect(small.valley.anglers['acct-a'].caught).toBe(1)
    const large = fish(
      on('channel-catfish'),
      reel({ roll: 0.99 }),
      null,
      at('channel-catfish')
    )
    expect(large.fished).toMatchObject({ outcome: 'snap' })
  })

  it('lets a fish go given up, reeled too soon or too late, and counts none', () => {
    const { valley, line } = hooked()
    const fight = fightOf(line.kind, 0)
    const gone = (r: Reduced) => {
      expect(r.fished).toMatchObject({ type: 'catch', outcome: 'gave-up' })
      expect(r.pack).toBeUndefined()
      expect(r.valley.lines).toEqual({})
      expect(r.valley.anglers['acct-a']).toBeUndefined()
    }
    gone(fish(valley, reel({ landed: false }), null, line.bitesAt + 10))
    gone(fish(valley, reel(), null, line.bitesAt))
    gone(
      fish(
        valley,
        reel(),
        null,
        line.bitesAt + fight.limitMs + CONFIG.fishing.lateMs + 1
      )
    )
    expect(reason(fish(valley, reel({ id: 'z' }), null))).toBe('not-in-valley')
    expect(reason(fish(createValley(), reel(), null))).toBe('not-in-valley')
    const v = valleyWith(join('a'))
    expect(reason(fish(v.valley, reel(), null))).toBe('no-line')
  })

  it("lets nothing bite past the day's limit, until the day turns", () => {
    const v = valleyWith(join('a'))
    const worn: Valley = {
      ...v.valley,
      anglers: {
        'acct-a': {
          skill: 0,
          day: dayKey(T0),
          caught: CONFIG.fishing.perDay,
          digAt: 0,
        },
      },
    }
    expect(reason(fish(worn, cast()))).toBe('tired')
    const tomorrow = nextMidnight(T0) + SEC
    expect(fish(worn, cast(), tackle, tomorrow).reply).toBeUndefined()
  })

  it('takes the line out with the socket that leaves', () => {
    const { valley } = hooked()
    const r = reduce(valley, leaveAs('a'), { now: T0, present: ['a'] })
    expect(r.valley.lines).toEqual({})
    // A socket gone without a word takes its line with it on the next
    // arrival.
    const joined = reduce(valley, join('b'), { now: T0, present: [] })
    expect(joined.valley.lines).toEqual({})
    const kept = reduce(valley, join('b'), { now: T0, present: ['a'] })
    expect(Object.keys(kept.valley.lines)).toEqual(['a'])
  })

  it('reads the angler for the wire, fresh for an account that never fished', () => {
    const v = valleyWith(join('a'))
    expect(anglerFor(v.valley, 'acct-a', T0)).toEqual({
      skill: 0,
      caught: 0,
      perDay: CONFIG.fishing.perDay,
      digAt: 0,
    })
  })

  it('lets a raider dialed in fish from anywhere (rule 29)', () => {
    const v = valleyWith({
      type: 'dial',
      id: 'a',
      account: 'acct-a',
      name: 'A',
      outfit: 'coleman',
      level: 1,
    })
    expect(fish(v.valley, cast({ at: null })).reply).toBeUndefined()
    expect(
      fish(v.valley, { type: 'dig', id: 'a', at: null, roll: 0 }).pack?.kind
    ).toBe('nightcrawlers')
  })
})

describe('rule 36: slurms into the jar', () => {
  const slot = Math.floor(T0 / 1000 / CONFIG.slurms.slotSeconds)
  const jar = (
    valley: Valley,
    over: Partial<Extract<ValleyAction, { type: 'jar-slurm' }>> = {},
    pack: Inventory | null = { 'slurm-jar': 1 },
    now = T0
  ) =>
    reduce(
      valley,
      {
        type: 'jar-slurm',
        id: 'a',
        station: 0,
        slot,
        index: 0,
        at: HAVENS[0],
        ...over,
      },
      {
        now,
        present: ['a'],
        ...(pack ? { holdings: { pack, cosmetics: [] } } : {}),
      }
    )
  const reason = (r: Reduced) => r.reply?.reason

  it('puts a slurm crawling at the Citgo into the jar, and tells everyone', () => {
    const v = valleyWith(join('a'))
    const r = jar(v.valley)
    expect(r.pack).toEqual({ account: 'acct-a', kind: 'slurm', delta: 1 })
    expect(r.jarred).toEqual({
      type: 'slurm-jarred',
      station: 0,
      slot,
      index: 0,
      by: 'a',
    })
    expect(r.valley.jarred).toEqual([`0:${slot}:0`])
    // Once.
    expect(reason(jar(r.valley))).toBe('gone')
    // And forgotten once its drop is long over.
    const later = T0 + 10 * CONFIG.slurms.slotSeconds * 1000
    const next = jar(r.valley, { slot: slot + 10 }, { 'slurm-jar': 1 }, later)
    expect(next.valley.jarred).toEqual([`0:${slot + 10}:0`])
  })

  it('refuses without a jar, with it full, away from the Citgo, or a slurm long gone', () => {
    const v = valleyWith(join('a'))
    expect(reason(jar(v.valley, {}, {}))).toBe('no-jar')
    expect(
      reason(
        jar(v.valley, {}, { 'slurm-jar': 1, slurm: CONFIG.fishing.jar.holds })
      )
    ).toBe('jar-full')
    expect(reason(jar(v.valley, {}, null))).toBe('unavailable')
    expect(reason(jar(v.valley, { at: HAVENS[1] }))).toBe('too-far')
    expect(reason(jar(v.valley, { at: null }))).toBe('too-far')
    expect(reason(jar(v.valley, { slot: slot - 5 }))).toBe('gone')
    expect(reason(jar(v.valley, { index: 99 }))).toBe('gone')
    expect(reason(jar(v.valley, { id: 'z' }))).toBe('not-in-valley')
    const aboard = valleyWith(join('a'), { type: 'board', id: 'a', at: HERE })
    expect(reason(jar(aboard.valley))).toBe('aboard')
  })

  it('takes a body: none from Dial-Up (rule 29)', () => {
    const v = valleyWith({
      type: 'dial',
      id: 'a',
      account: 'acct-a',
      name: 'A',
      outfit: 'coleman',
      level: 1,
    })
    expect(reason(jar(v.valley))).toBe('dialup')
  })

  describe("the moat's", () => {
    const moat = { x: 2000, z: 2000, yaw: 0.35 }
    // A point down in the channel: out from the middle until it is.
    const inMoat = (() => {
      for (let r = 0; r < 200; r += 0.5) {
        const p = { x: moat.x + r, z: moat.z }
        if (inChannel(moat, p.x, p.z)) return { x: p.x + 1, z: p.z }
      }
      throw new Error('no channel')
    })()
    // A drop a few slots back, down by now.
    const moatSlot = Math.floor(T0 / 1000 / CONFIG.slurms.moat.slotSeconds) - 2
    const opened = () =>
      valleyWith({ ...join('a'), moat } as ValleyAction).valley
    const moatJar = (
      valley: Valley,
      over: Partial<Extract<ValleyAction, { type: 'jar-slurm' }>> = {},
      now = T0
    ) =>
      jar(
        valley,
        { station: MOAT_STATION, slot: moatSlot, at: inMoat, ...over },
        { 'slurm-jar': 1 },
        now
      )

    it('puts one down on the floor into the jar, from down in the channel', () => {
      expect(inChannel(moat, inMoat.x, inMoat.z)).toBe(true)
      const r = moatJar(opened())
      expect(r.pack).toEqual({ account: 'acct-a', kind: 'slurm', delta: 1 })
      expect(r.jarred).toEqual({
        type: 'slurm-jarred',
        station: MOAT_STATION,
        slot: moatSlot,
        index: 0,
        by: 'a',
      })
      expect(r.valley.jarred).toEqual([`${MOAT_STATION}:${moatSlot}:0`])
      // Once.
      expect(reason(moatJar(r.valley))).toBe('gone')
      // Kept while it could still lie there; forgotten once it would have
      // melted.
      const { crawlSeconds, lingerSeconds, jarSlack, slotSeconds } =
        CONFIG.slurms.moat
      const life = (crawlSeconds + lingerSeconds + jarSlack) * 1000
      const soon = moatJar(r.valley, { slot: moatSlot + 1 }, T0 + 2000)
      expect(soon.valley.jarred).toContain(`${MOAT_STATION}:${moatSlot}:0`)
      const later = T0 + life + 4 * slotSeconds * 1000
      const laterSlot = Math.floor(later / 1000 / slotSeconds) - 2
      const next = moatJar(r.valley, { slot: laterSlot }, later)
      expect(next.valley.jarred).toEqual([`${MOAT_STATION}:${laterSlot}:0`])
    })

    it('refuses up out of the channel, with no moat, or one melted or never dropped', () => {
      const v = opened()
      expect(reason(moatJar(v, { at: HAVENS[0] }))).toBe('too-far')
      expect(reason(moatJar(v, { at: null }))).toBe('too-far')
      expect(reason(moatJar(valleyWith(join('a')).valley))).toBe('too-far')
      expect(reason(moatJar(v, { slot: moatSlot - 100 }))).toBe('gone')
      expect(reason(moatJar(v, { slot: moatSlot + 100 }))).toBe('gone')
      expect(reason(moatJar(v, { index: 99 }))).toBe('gone')
    })
  })
})

describe('rule 39: the topiaries and the torch', () => {
  const box = toolboxOf(MAZE)
  // On the spine of topiary 0's first spot, in the world.
  const spot = theTopiaries().pools[0][0]
  const onSpine = mazeToWorld(MAZE, { x: spot.a.x + 0.5, z: spot.z })
  const inMaze = () => {
    const v = valleyWith({ ...join('a'), maze: MAZE } as ValleyAction)
    v.setPack({ torch: 1 })
    return v
  }
  const swing = (
    over: Partial<Extract<ValleyAction, { type: 'torch' }>> = {}
  ) =>
    ({
      type: 'torch',
      id: 'a',
      index: 0,
      at: onSpine,
      roll: 0.5,
      ...over,
    }) as ValleyAction
  const reason = (r: Reduced) => r.reply?.reason

  it('stands every topiary whole in a world opened fresh, on the wire', () => {
    const v = inMaze()
    expect(v.valley.world?.topiaries).toEqual(freshTopiaries())
    expect(toWire(v.valley)?.topiaries).toHaveLength(TOPIARIES.length)
  })

  it('hands a torch out of the toolbox to a raider by it with none', () => {
    const v = inMaze()
    v.setPack({})
    const r = v.step({ type: 'toolbox', id: 'a', at: box })
    expect(r.pack).toEqual({ account: 'acct-a', kind: 'torch', delta: 1 })
    v.setPack({ torch: 1 })
    expect(reason(v.step({ type: 'toolbox', id: 'a', at: box }))).toBe(
      'has-torch'
    )
    const far = { x: box.x + 20, z: box.z }
    v.setPack({})
    expect(reason(v.step({ type: 'toolbox', id: 'a', at: far }))).toBe(
      'too-far'
    )
    expect(reason(v.step({ type: 'toolbox', id: 'a', at: null }))).toBe(
      'too-far'
    )
  })

  it('takes a swing off the topiary for everyone to see', () => {
    const v = inMaze()
    const r = v.step(swing())
    const damage = torchDamage(0.5)
    expect(reasons(r)).toEqual(['topiary-hit'])
    expect(r.broadcast[0]).toMatchObject({ by: 'a', index: 0, damage })
    expect(r.valley.world?.topiaries[0]).toEqual({
      hp: CONFIG.topiaries.hp - damage,
      back: null,
    })
    expect(r.broadcast[0].world?.topiaries[0].hp).toBe(
      CONFIG.topiaries.hp - damage
    )
  })

  it('refuses a swing too soon after the last, without a torch, or out of reach', () => {
    const v = inMaze()
    v.step(swing())
    expect(reason(v.step(swing()))).toBe('too-soon')
    v.tick(CONFIG.torch.swingSeconds * 1000)
    expect(reasons(v.step(swing()))).toEqual(['topiary-hit'])
    v.tick(CONFIG.torch.swingSeconds * 1000)
    v.setPack({})
    expect(reason(v.step(swing()))).toBe('no-torch')
    v.setPack({ torch: 1 })
    const far = { x: onSpine.x + 500, z: onSpine.z + 500 }
    expect(reason(v.step(swing({ at: far })))).toBe('too-far')
    expect(reason(v.step(swing({ at: null })))).toBe('too-far')
    expect(reason(v.step(swing({ index: 99 })))).toBe('too-far')
  })

  it('burns one away at nothing, and grows it back whole later', () => {
    const v = inMaze()
    let last: Reduced = v.last()
    for (let i = 0; i < 20 && reasons(last)[0] !== 'topiary-burned'; i++) {
      last = v.step(swing({ roll: 1 }))
      v.tick(CONFIG.torch.swingSeconds * 1000)
    }
    expect(reasons(last)).toEqual(['topiary-burned'])
    const burned = v.valley.world?.topiaries[0]
    expect(burned?.hp).toBe(0)
    expect(burned?.back).toBeGreaterThan(v.now)
    // Burned away, a swing finds nothing.
    expect(reason(v.step(swing()))).toBe('gone')
    // The valley wakes for it, and it is back whole.
    const back = burned?.back ?? 0
    expect(wakeAt(v.valley, v.now)).toBeLessThanOrEqual(back)
    v.tick(back - v.now)
    const r = v.step(swing({ index: 1, at: null }))
    expect(reasons(r)).toContain('topiary-back')
    expect(r.valley.world?.topiaries[0]).toEqual({
      hp: CONFIG.topiaries.hp,
      back: null,
    })
  })

  it('needs a body', () => {
    const v = valleyWith({
      type: 'dial',
      id: 'a',
      account: 'acct-a',
      name: 'A',
      outfit: 'coleman',
      level: 1,
    })
    expect(reason(v.step(swing()))).toBe('dialup')
    expect(reason(v.step({ type: 'toolbox', id: 'a', at: box }))).toBe('dialup')
  })

  it('stands the topiaries whole in a world stored before they had health', () => {
    const v = inMaze()
    const world = { ...v.valley.world } as Partial<NonNullable<Valley['world']>>
    delete world.topiaries
    delete world.swings
    const restored = restoreValley({
      ...v.valley,
      world: world as NonNullable<Valley['world']>,
    })
    expect(restored.world?.topiaries).toEqual(freshTopiaries())
    expect(restored.world?.swings).toEqual({})
  })
})

describe('rule 41: the drive-in reel', () => {
  const projector = projectorOf(MAZE)
  const FILM = 'carnival of souls.mp4'
  const thread = (
    over: Partial<Extract<ValleyAction, { type: 'thread' }>> = {}
  ) =>
    ({
      type: 'thread',
      id: 'a',
      film: FILM,
      at: projector,
      ...over,
    }) as ValleyAction
  const reason = (r: Reduced) => r.reply?.reason
  const inMaze = () =>
    valleyWith(
      { ...join('a'), maze: MAZE } as ValleyAction,
      {
        ...join('b'),
        maze: MAZE,
      } as ValleyAction
    )

  it('shows nothing until a film is threaded', () => {
    const v = inMaze()
    expect(v.valley.reel).toBeNull()
    expect(toWire(v.valley)?.reel).toBeNull()
  })

  it('threads a film from its start, now, for everyone', () => {
    const v = inMaze()
    v.tick(5000)
    const r = v.step(thread())
    expect(reasons(r)).toEqual(['threaded'])
    expect(r.broadcast[0]).toMatchObject({ by: 'a' })
    expect(r.broadcast[0].world?.reel).toEqual({ film: FILM, since: v.now })
    expect(r.valley.reel).toEqual({ film: FILM, since: v.now })
    // Another, later, takes its place, and starts it over.
    v.tick(1000)
    const again = v.step(thread({ id: 'b', film: 'night.mp4' }))
    expect(again.valley.reel).toEqual({ film: 'night.mp4', since: v.now })
  })

  it('threads from beside the projector, within its slack, and no farther', () => {
    const v = inMaze()
    const { projectorReach, slack } = CONFIG.driveIn
    const near = {
      x: projector.x + projectorReach + slack - 0.1,
      z: projector.z,
    }
    expect(reasons(v.step(thread({ at: near })))).toEqual(['threaded'])
    const far = {
      x: projector.x + projectorReach + slack + 0.1,
      z: projector.z,
    }
    expect(reason(v.step(thread({ at: far })))).toBe('too-far')
    expect(reason(v.step(thread({ at: null })))).toBe('too-far')
    expect(v.valley.reel?.since).toBe(T0)
  })

  it('refuses a film it could never show, and one with no drive-in', () => {
    expect(reason(inMaze().step(thread({ film: '../x.mp4' })))).toBe('no-film')
    expect(reason(inMaze().step(thread({ film: 'x.avi' })))).toBe('no-film')
    const none = valleyWith(join('a'))
    expect(reason(none.step(thread()))).toBe('too-far')
    expect(reason(none.step(thread({ id: 'nobody' })))).toBe('not-in-valley')
  })

  it('has no booth for a raider dialed in', () => {
    const v = inMaze()
    v.step({
      type: 'dial',
      id: 'p',
      account: 'acct-p',
      name: 'P',
      outfit: 'coleman',
      level: 1,
    })
    expect(reason(v.step(thread({ id: 'p' })))).toBe('dialup')
    expect(v.valley.reel).toBeNull()
  })

  it('keeps the reel through a world opened afresh', () => {
    const v = inMaze()
    v.step(thread())
    const stored = {
      ...v.valley,
      world: { ...v.valley.world, version: PROTOCOL_VERSION - 1 },
    } as Valley
    const restored = restoreValley(stored)
    expect(restored.world).toBeNull()
    expect(restored.reel).toEqual({ film: FILM, since: T0 })
    // An older valley, from before the drive-in, has none.
    const { reel: _, ...older } = v.valley
    expect(restoreValley(older).reel).toBeNull()
  })
})
