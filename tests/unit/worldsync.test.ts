import { describe, expect, it } from 'vitest'
import {
  aboard,
  boardable,
  charterable,
  clockText,
  countdown,
  giftsIn,
  newLeg,
  portalNews,
  reconcileBed,
  seatOf,
  settledBy,
  toolsIn,
  topiaryNews,
} from '../../src/worldsync.ts'
import type { Leg } from '../../src/marx.ts'
import type { Portal } from '../../src/portals.ts'
import type { WorldWire } from '../../src/protocol.ts'

const T0 = 1_000_000

const world = (leg: Leg, riders: string[] = []): WorldWire => ({
  day: '2026-10-07',
  taken: [],
  shelves: [],
  drops: [],
  dealer: {},
  graves: [],
  corpses: [],
  portals: [],
  truck: { leg, riders },
  members: [],
  topiaries: [],
})
const parked = (leavesAt: number | null = null): Leg => ({
  kind: 'parked',
  at: T0,
  from: null,
  leavesAt,
})

describe('the bed', () => {
  it('says who is aboard, and in which seat', () => {
    const w = world(parked(T0 + 60_000), ['b', 'a'])
    expect(aboard(w, 'a')).toBe(true)
    expect(aboard(w, 'c')).toBe(false)
    expect(aboard(null, 'a')).toBe(false)
    expect(aboard(w, null)).toBe(false)
    expect(seatOf(w, 'a')).toBe(1)
    expect(seatOf(w, 'b')).toBe(0)
    // Not aboard, or no valley: the first seat.
    expect(seatOf(w, 'c')).toBe(0)
    expect(seatOf(null, 'a')).toBe(0)
  })

  it('lets a raider climb in at the Citgo, or into the truck they whistled', () => {
    expect(boardable(parked(), 'a')).toBe(true)
    const called: Leg = {
      kind: 'called',
      at: T0,
      by: 'a',
      from: { x: 0, z: 0 },
      to: { x: 9, z: 9 },
      rest: true,
    }
    expect(boardable(called, 'a')).toBe(true)
    expect(boardable(called, 'b')).toBe(false)
    expect(boardable(called, null)).toBe(false)
    expect(boardable({ kind: 'donuts', at: T0 }, 'a')).toBe(false)
    expect(boardable(null, 'a')).toBe(false)
  })
})

describe('reconcileBed', () => {
  const off = { aboard: false, pendingBoard: false }
  const on = { aboard: true, pendingBoard: false }
  const asked = { aboard: true, pendingBoard: true }

  it("takes the valley's word on who is in the bed", () => {
    const w = world(parked(T0 + 60_000), ['a'])
    expect(reconcileBed(w, 'a', off, 'boarded')).toEqual({
      aboard: true,
      pendingBoard: false,
      letOff: false,
      rolling: false,
    })
    expect(reconcileBed(w, 'b', off, 'boarded')).toEqual({
      aboard: false,
      pendingBoard: false,
      letOff: false,
      rolling: false,
    })
  })

  it('lets a raider off when the valley no longer has them in the bed', () => {
    const w = world(parked(), [])
    expect(reconcileBed(w, 'a', on, 'home')).toEqual({
      aboard: false,
      pendingBoard: false,
      letOff: true,
      rolling: false,
    })
  })

  it('keeps a raider in the bed on trust until their board is answered', () => {
    const w = world(parked(), ['b'])
    expect(reconcileBed(w, 'a', asked, 'boarded')).toEqual({
      aboard: true,
      pendingBoard: true,
      letOff: false,
      rolling: false,
    })
    // Answered: the board is no longer pending.
    expect(
      reconcileBed(world(parked(), ['b', 'a']), 'a', asked, 'boarded')
    ).toEqual({
      aboard: true,
      pendingBoard: false,
      letOff: false,
      rolling: false,
    })
  })

  it('says the truck is rolling with us in it', () => {
    const joyride: Leg = { kind: 'joyride', at: T0 }
    expect(reconcileBed(world(joyride, ['a']), 'a', on, 'depart').rolling).toBe(
      true
    )
    expect(reconcileBed(world(joyride, ['b']), 'a', on, 'depart').rolling).toBe(
      false
    )
    expect(reconcileBed(world(joyride, ['a']), 'a', on, 'joined').rolling).toBe(
      false
    )
  })
})

describe('the charter', () => {
  it('is the first one in to pick, at the Citgo only', () => {
    const empty = world(parked()).truck
    expect(charterable(empty, 'a')).toBe(true)
    const two = world(parked(T0 + 60_000), ['a', 'b']).truck
    expect(charterable(two, 'a')).toBe(true)
    expect(charterable(two, 'b')).toBe(false)
    const called: Leg = {
      kind: 'called',
      at: T0,
      by: 'a',
      from: { x: 0, z: 0 },
      to: { x: 1, z: 1 },
      rest: true,
    }
    expect(charterable(world(called).truck, 'a')).toBe(false)
    expect(charterable(null, 'a')).toBe(false)
    expect(charterable(empty, null)).toBe(false)
  })
})

describe('the countdown', () => {
  it('counts the whole seconds left, never below zero', () => {
    const w = world(parked(T0 + 60_000), ['a']).truck
    expect(countdown(w, T0)).toBe(60)
    expect(countdown(w, T0 + 59_001)).toBe(1)
    expect(countdown(w, T0 + 70_000)).toBe(0)
    expect(countdown(world(parked()).truck, T0)).toBeNull()
    expect(countdown(world({ kind: 'joyride', at: T0 }).truck, T0)).toBeNull()
    expect(countdown(null, T0)).toBeNull()
  })

  it('reads as m:ss', () => {
    expect(clockText(60)).toBe('1:00')
    expect(clockText(9)).toBe('0:09')
  })
})

describe('newLeg', () => {
  it('is new for another kind, another start, or a drive home begun', () => {
    expect(newLeg(null, parked())).toBe(true)
    expect(newLeg(parked(), { kind: 'donuts', at: T0 })).toBe(true)
    expect(
      newLeg({ kind: 'donuts', at: T0 }, { kind: 'donuts', at: T0 + 1 })
    ).toBe(true)
    const home: Leg = {
      kind: 'parked',
      at: T0,
      from: { kind: 'donuts', at: T0 - 9, cut: T0 },
      leavesAt: null,
    }
    expect(newLeg(parked(), home)).toBe(true)
    // A countdown starting or stopping is not a new leg.
    expect(newLeg(parked(), parked(T0 + 60_000))).toBe(false)
    expect(newLeg(parked(T0 + 60_000), parked())).toBe(false)
  })
})

describe('settledBy', () => {
  const none = { take: null, sale: null, dropped: null, dropTaken: null }

  it("says what a take or a sale settled, and whether it was this raider's", () => {
    expect(settledBy({ reason: 'taken', by: 'a', index: 3 }, 'a')).toEqual({
      ...none,
      take: { index: 3, mine: true },
    })
    expect(settledBy({ reason: 'taken', by: 'b', index: 3 }, 'a').take).toEqual(
      { index: 3, mine: false }
    )
    expect(
      settledBy({ reason: 'bought', by: 'a', station: 1, item: 'pbr' }, 'a')
    ).toEqual({ ...none, sale: { station: 1, item: 'pbr', mine: true } })
    // Played alone there is no id, and nothing the valley settled is ours.
    expect(
      settledBy({ reason: 'bought', by: 'a', station: 1, item: 'pbr' }, null)
        .sale?.mine
    ).toBe(false)
  })

  it('says what was set down and what was taken up, and by whom', () => {
    const detail = { by: 'a', item: 'cabbage', drop: 4, count: 2 }
    expect(settledBy({ reason: 'dropped', ...detail }, 'a')).toEqual({
      ...none,
      dropped: { kind: 'cabbage', count: 2, mine: true },
    })
    expect(settledBy({ reason: 'drop-taken', ...detail }, 'b')).toEqual({
      ...none,
      dropTaken: { drop: 4, kind: 'cabbage', count: 2, mine: false },
    })
  })

  it('settles nothing without the detail, or for any other reason', () => {
    expect(settledBy({ reason: 'taken', by: 'a' }, 'a')).toEqual(none)
    expect(settledBy({ reason: 'bought', by: 'a', station: 0 }, 'a')).toEqual(
      none
    )
    expect(settledBy({ reason: 'joined', by: 'a', index: 2 }, 'a')).toEqual(
      none
    )
    expect(
      settledBy({ reason: 'dropped', by: 'a', item: 'joints', count: 1 }, 'a')
    ).toEqual(none)
    expect(
      settledBy({ reason: 'drop-taken', by: 'a', item: 'joints', drop: 1 }, 'a')
    ).toEqual(none)
  })
})

describe('Citgo portals', () => {
  const end = { x: 0, z: 0, yaw: 0 }
  const portal = (id: number): Portal => ({
    id,
    name: `R${id}`,
    field: end,
    citgo: end,
    station: 0,
    slot: id,
    closes: T0,
  })
  const withPortals = (...ids: number[]): WorldWire => ({
    ...world(parked()),
    portals: ids.map(portal),
  })

  it('says ours opened, and keeps it as ours', () => {
    const news = portalNews(
      { reason: 'portal-opened', by: 'me', portal: 3 },
      withPortals(3),
      'me',
      null
    )
    expect(news).toEqual({
      opened: { portal: portal(3), mine: true },
      mine: 3,
      closed: false,
    })
  })

  it('says another opened one, and ours stands', () => {
    const news = portalNews(
      { reason: 'portal-opened', by: 'them', portal: 4 },
      withPortals(3, 4),
      'me',
      3
    )
    expect(news.opened).toEqual({ portal: portal(4), mine: false })
    expect(news.mine).toBe(3)
    expect(news.closed).toBe(false)
  })

  it('says ours closed once it is gone, and never a second as closing the first', () => {
    expect(
      portalNews({ reason: 'portal-closed' }, withPortals(), 'me', 3)
    ).toEqual({ opened: null, mine: null, closed: true })
    expect(
      portalNews(
        { reason: 'portal-opened', by: 'me', portal: 5 },
        withPortals(5),
        'me',
        3
      )
    ).toMatchObject({ mine: 5, closed: false })
    expect(portalNews({ reason: 'joined' }, withPortals(), 'me', null)).toEqual(
      { opened: null, mine: null, closed: false }
    )
  })
})

describe('gifts', () => {
  it('says a gift the pack did not hold before and holds now', () => {
    expect(giftsIn({}, { 'marx-whistle': 1 })).toEqual(['marx-whistle'])
    expect(giftsIn({ 'marx-whistle': 0 }, { 'marx-whistle': 1 })).toEqual([
      'marx-whistle',
    ])
    // Held already, or still not held, is no news; nor is anything else.
    expect(giftsIn({ 'marx-whistle': 1 }, { 'marx-whistle': 1 })).toEqual([])
    expect(giftsIn({}, { marlboro: 20 })).toEqual([])
  })
})

describe('tools', () => {
  it('puts on the bar what the hand has a use for, newly in the pack', () => {
    expect(toolsIn({}, { 'fishing-rod': 1, nightcrawlers: 6 })).toEqual([
      'fishing-rod',
    ])
    expect(toolsIn({ 'slurm-jar': 0 }, { 'slurm-jar': 1 })).toEqual([
      'slurm-jar',
    ])
    // Carried already, a pack of cigarettes, or nothing new: none.
    expect(toolsIn({ 'zebco-33': 1 }, { 'zebco-33': 1 })).toEqual([])
    expect(toolsIn({}, { marlboro: 20 })).toEqual([])
  })
})

describe('a topiary under the torch (rule 39)', () => {
  it('names the topiary struck, whose blow it was, and whether it burned', () => {
    expect(
      topiaryNews({ reason: 'topiary-hit', by: 'me', index: 2 }, 'me')
    ).toEqual({
      index: 2,
      mine: true,
      burned: false,
    })
    expect(
      topiaryNews({ reason: 'topiary-burned', by: 'you', index: 0 }, 'me')
    ).toEqual({ index: 0, mine: false, burned: true })
    expect(topiaryNews({ reason: 'topiary-hit', index: 1 }, null)?.mine).toBe(
      false
    )
  })

  it('says nothing of any other snapshot', () => {
    expect(
      topiaryNews({ reason: 'taken', by: 'me', index: 2 }, 'me')
    ).toBeNull()
    expect(topiaryNews({ reason: 'topiary-back' }, 'me')).toBeNull()
    expect(topiaryNews({ reason: 'topiary-hit' }, 'me')).toBeNull()
  })
})
