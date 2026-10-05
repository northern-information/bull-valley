import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { dayKey, nextMidnight } from '../../src/daily.ts'
import { createValley, dailyFor, reduce, toWire } from '../../src/sharedraid.ts'
import { freshStock } from '../../src/store.ts'
import type { DailyMessage, RaidMessage } from '../../src/protocol.ts'
import type { Valley, ValleyAction } from '../../src/sharedraid.ts'

const PICKUPS = 70
const STATIONS = 3
const T0 = 1_000_000

// A little harness: applies actions in order, remembering who is present.
function valleyWith(...actions: ValleyAction[]) {
  let valley = createValley()
  const present: string[] = []
  let now = T0
  const out: ReturnType<typeof reduce>[] = []
  const step = (action: ValleyAction) => {
    const ctx = { now, present: [...present] }
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
})

const reasons = (reduced: { broadcast: RaidMessage[] }) =>
  reduced.broadcast.map((m) => m.reason)

const phase = (valley: Valley, id: string) => valley.members[id]?.phase

describe('rule 1: a lobby forms for the first arrival', () => {
  it('opens a fresh lobby with the clock and the alarm armed', () => {
    const v = valleyWith()
    const r = v.step(join('a'))
    const raid = v.valley.raid
    expect(raid?.phase).toBe('LOBBY')
    expect(raid?.epoch).toBe(1)
    expect(raid?.startedAt).toBe(T0)
    expect(raid?.loadoutEndsAt).toBe(T0 + CONFIG.raid.loadoutSeconds * 1000)
    expect(r.alarm).toBe(raid?.loadoutEndsAt)
    expect(reasons(r)).toEqual(['joined'])
    expect(r.broadcast[0].by).toBe('a')
    expect(phase(v.valley, 'a')).toBe('LOBBY')
  })

  it('does not restart the lobby for the second arrival', () => {
    const v = valleyWith(join('a'))
    v.tick(5000)
    const r = v.step(join('b'))
    expect(v.valley.raid?.startedAt).toBe(T0)
    expect(r.alarm).toBeUndefined()
    expect(toWire(v.valley)?.members.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('starts over when everyone before has silently gone', () => {
    const v = valleyWith(join('a'))
    // a's socket vanished without a close; b arrives with a not present.
    const r = reduce(v.valley, join('b'), { now: T0 + 9000, present: [] })
    expect(r.valley.raid?.epoch).toBe(2)
    expect(r.valley.raid?.startedAt).toBe(T0 + 9000)
    expect(Object.keys(r.valley.members)).toEqual(['b'])
  })

  it('turns away a build whose pickups or stations differ', () => {
    const v = valleyWith(join('a'))
    const r = v.step({ ...join('b'), pickups: PICKUPS + 1 } as ValleyAction)
    expect(r.reject).toBe('stale-build')
    expect(r.valley).toBe(v.valley)
    expect(Object.keys(v.valley.members)).toEqual(['a'])
    const moved = v.step({
      ...join('c'),
      stations: STATIONS + 1,
    } as ValleyAction)
    expect(moved.reject).toBe('stale-build')
  })

  it("stocks every station's shelves for the lobby", () => {
    const v = valleyWith(join('a'))
    const shelves = v.valley.raid?.shelves
    expect(shelves).toHaveLength(STATIONS)
    expect(shelves?.[0]).toEqual(freshStock(1)[0])
    expect(shelves?.[0].pbr).toBe(CONFIG.store.perItem)
  })
})

describe('rule 2: where a newcomer stands', () => {
  it('puts a late arrival on foot once the truck has left', () => {
    const v = valleyWith(join('a'), { type: 'board', id: 'a' })
    expect(v.valley.raid?.phase).toBe('OUT')
    v.step(join('b'))
    expect(phase(v.valley, 'b')).toBe('ON_FOOT')
    expect(v.valley.raid?.riders).toEqual(['a'])
  })
})

describe('rule 3: when the truck leaves', () => {
  it('waits while someone in the lobby is not aboard', () => {
    const v = valleyWith(join('a'), join('b'))
    const r = v.step({ type: 'board', id: 'a' })
    expect(reasons(r)).toEqual(['boarded'])
    expect(v.valley.raid?.phase).toBe('LOBBY')
    expect(v.valley.members.a.boarded).toBe(true)
  })

  it('leaves the moment everyone is aboard', () => {
    const v = valleyWith(join('a'), join('b'), { type: 'board', id: 'a' })
    v.tick(1234)
    const r = v.step({ type: 'board', id: 'b' })
    expect(reasons(r)).toEqual(['depart'])
    expect(r.alarm).toBeNull()
    const raid = v.valley.raid
    expect(raid?.phase).toBe('OUT')
    expect(raid?.departedAt).toBe(v.now)
    expect(raid?.departReason).toBe('all-aboard')
    expect(raid?.riders).toEqual(['a', 'b'])
    expect(phase(v.valley, 'a')).toBe('RIDING')
    expect(phase(v.valley, 'b')).toBe('RIDING')
  })

  it('leaves alone with the only player aboard', () => {
    const v = valleyWith(join('a'))
    const r = v.step({ type: 'board', id: 'a' })
    expect(reasons(r)).toEqual(['depart'])
    expect(v.valley.raid?.riders).toEqual(['a'])
  })

  it('leaves on the clock with whoever is aboard', () => {
    const v = valleyWith(join('a'), join('b'), join('c'), {
      type: 'board',
      id: 'a',
    })
    const r = v.step({ type: 'clock' })
    expect(reasons(r)).toEqual(['depart'])
    expect(r.alarm).toBeNull()
    expect(v.valley.raid?.departReason).toBe('clock')
    expect(v.valley.raid?.riders).toEqual(['a'])
    expect(phase(v.valley, 'a')).toBe('RIDING')
    expect(phase(v.valley, 'b')).toBe('ON_FOOT')
    expect(phase(v.valley, 'c')).toBe('ON_FOOT')
  })

  it('does nothing when the clock fires after it has left', () => {
    const v = valleyWith(join('a'), { type: 'board', id: 'a' })
    const r = v.step({ type: 'clock' })
    expect(r.broadcast).toEqual([])
  })

  it('lets a player climb back out before it leaves', () => {
    const v = valleyWith(join('a'), join('b'), { type: 'board', id: 'a' })
    const r = v.step({ type: 'unboard', id: 'a' })
    expect(reasons(r)).toEqual(['unboarded'])
    expect(v.valley.members.a.boarded).toBe(false)
    v.step({ type: 'board', id: 'b' })
    expect(v.valley.raid?.phase).toBe('LOBBY')
  })

  it('leaves when the one everybody waited on walks off for good', () => {
    const v = valleyWith(join('a'), join('b'), { type: 'board', id: 'a' })
    const r = v.step({ type: 'leave', id: 'b' })
    expect(reasons(r)).toEqual(['left', 'depart'])
    expect(r.alarm).toBeNull()
    expect(v.valley.raid?.riders).toEqual(['a'])
    expect(v.valley.members.b).toBeUndefined()
  })

  it('refuses boarding outside the lobby', () => {
    const v = valleyWith(join('a'), { type: 'board', id: 'a' })
    v.step(join('b'))
    const r = v.step({ type: 'board', id: 'b' })
    expect(r.reply).toEqual({
      type: 'nack',
      re: 'board',
      reason: 'not-in-lobby',
    })
    const again = v.step({ type: 'unboard', id: 'b' })
    expect(again.reply?.reason).toBe('not-aboard')
  })

  it('refuses boarding twice', () => {
    const v = valleyWith(join('a'), join('b'), { type: 'board', id: 'a' })
    const r = v.step({ type: 'board', id: 'a' })
    expect(r.reply?.reason).toBe('aboard')
  })

  it('tracks hopping out of the moving truck', () => {
    const v = valleyWith(join('a'), { type: 'board', id: 'a' })
    const r = v.step({ type: 'hop-out', id: 'a' })
    expect(reasons(r)).toEqual(['hop-out'])
    expect(phase(v.valley, 'a')).toBe('ON_FOOT')
    expect(v.step({ type: 'hop-out', id: 'a' }).reply?.reason).toBe(
      'not-riding'
    )
  })
})

describe('rule 4: pickups go to the first to ask', () => {
  it('records a take and tells everyone who got it', () => {
    const v = valleyWith(join('a'), join('b'))
    const r = v.step({ type: 'take', id: 'a', index: 12 })
    expect(r.broadcast).toHaveLength(1)
    expect(r.broadcast[0]).toMatchObject({
      reason: 'taken',
      by: 'a',
      index: 12,
    })
    expect(v.valley.raid?.taken).toEqual([12])
  })

  it('tells the loser it is gone', () => {
    const v = valleyWith(join('a'), join('b'), {
      type: 'take',
      id: 'a',
      index: 12,
    })
    const r = v.step({ type: 'take', id: 'b', index: 12 })
    expect(r.broadcast).toEqual([])
    expect(r.reply).toEqual({
      type: 'nack',
      re: 'take',
      reason: 'gone',
      index: 12,
    })
  })

  it('refuses an index off the end and a player who has left the raid', () => {
    const v = valleyWith(join('a'), join('b'))
    expect(
      v.step({ type: 'take', id: 'a', index: PICKUPS }).reply?.reason
    ).toBe('no-such-pickup')
    v.step({ type: 'extract', id: 'a', kind: 'fuel' })
    expect(v.step({ type: 'take', id: 'a', index: 1 }).reply?.reason).toBe(
      'not-in-raid'
    )
  })
})

describe('rule 8: the shelves are shared', () => {
  const buy = (id: string, station = 0, kind = 'pbr'): ValleyAction => ({
    type: 'buy',
    id,
    station,
    kind,
  })

  it("takes one unit off that station's shelf and tells everyone who bought it", () => {
    const v = valleyWith(join('a'), join('b'))
    const r = v.step(buy('a', 1, 'marlboro'))
    expect(r.broadcast).toHaveLength(1)
    expect(r.broadcast[0]).toMatchObject({
      reason: 'bought',
      by: 'a',
      station: 1,
      item: 'marlboro',
    })
    expect(v.valley.raid?.shelves[1].marlboro).toBe(CONFIG.store.perItem - 1)
    expect(v.valley.raid?.shelves[0].marlboro).toBe(CONFIG.store.perItem)
    expect(r.broadcast[0].raid?.shelves[1].marlboro).toBe(
      CONFIG.store.perItem - 1
    )
  })

  it('says sold out to whoever comes once the shelf is bare', () => {
    const v = valleyWith(join('a'), join('b'))
    for (let i = 0; i < CONFIG.store.perItem; i++) v.step(buy('a'))
    const r = v.step(buy('b'))
    expect(r.broadcast).toEqual([])
    expect(r.reply).toEqual({
      type: 'nack',
      re: 'buy',
      reason: 'sold-out',
      station: 0,
      item: 'pbr',
    })
  })

  it('refuses a shelf that does not exist and a player out of the raid', () => {
    const v = valleyWith(join('a'), join('b'))
    expect(v.step(buy('a', STATIONS)).reply?.reason).toBe('no-such-shelf')
    expect(v.step(buy('a', 0, 'cabbage')).reply?.reason).toBe('no-such-shelf')
    v.step({ type: 'extract', id: 'a', kind: 'fuel' })
    expect(v.step(buy('a')).reply?.reason).toBe('not-in-raid')
  })

  it('sells during the lobby and out in the valley alike', () => {
    const v = valleyWith(join('a'), { type: 'board', id: 'a' })
    v.step(join('b'))
    expect(v.step(buy('b', 2, 'sack')).broadcast[0].reason).toBe('bought')
  })

  it('fills the shelves again with the next lobby', () => {
    const v = valleyWith(join('a'), buy('a'))
    v.step({ type: 'leave', id: 'a' })
    v.step(join('b'))
    expect(v.valley.raid?.shelves[0].pbr).toBe(CONFIG.store.perItem)
  })
})

describe('rule 5: one whistle at a time', () => {
  const out = () =>
    valleyWith(
      join('a'),
      join('b'),
      { type: 'board', id: 'a' },
      {
        type: 'board',
        id: 'b',
      },
      { type: 'hop-out', id: 'a' },
      { type: 'hop-out', id: 'b' }
    )

  const whistle = (id: string): ValleyAction => ({
    type: 'call',
    id,
    from: { x: 1, z: 2 },
    to: { x: 30, z: 40 },
  })

  it('records the first call with where and when', () => {
    const v = out()
    v.tick(60_000)
    const r = v.step(whistle('a'))
    expect(reasons(r)).toEqual(['call'])
    expect(v.valley.raid?.call).toEqual({
      by: 'a',
      from: { x: 1, z: 2 },
      to: { x: 30, z: 40 },
      at: v.now,
    })
  })

  it('tells the second caller the truck is busy', () => {
    const v = out()
    v.step(whistle('a'))
    const r = v.step(whistle('b'))
    expect(r.reply).toEqual({ type: 'nack', re: 'call', reason: 'busy' })
  })

  it('needs the truck gone and the caller on foot', () => {
    const lobby = valleyWith(join('a'), join('b'))
    expect(lobby.step(whistle('a')).reply?.reason).toBe('not-on-foot')
    const riding = valleyWith(join('a'), { type: 'board', id: 'a' })
    expect(riding.step(whistle('a')).reply?.reason).toBe('not-on-foot')
  })

  it('frees the truck when the caller extracts or leaves', () => {
    const v = out()
    v.step(whistle('a'))
    const r = v.step({ type: 'extract', id: 'a', kind: 'truck' })
    expect(reasons(r)).toEqual(['extracted', 'truck-free'])
    expect(v.valley.raid?.call).toBeNull()
    v.step(whistle('b'))
    const gone = v.step({ type: 'leave', id: 'b' })
    expect(reasons(gone)).toEqual(['left', 'truck-free', 'reset'])
  })
})

describe('rules 6 and 7: extracting, and the valley resetting', () => {
  it('takes an extracted player out of the raid', () => {
    const v = valleyWith(
      join('a'),
      join('b'),
      { type: 'board', id: 'a' },
      {
        type: 'board',
        id: 'b',
      }
    )
    const r = v.step({ type: 'extract', id: 'a', kind: 'keep' })
    expect(r.broadcast[0]).toMatchObject({
      reason: 'extracted',
      by: 'a',
      kind: 'keep',
    })
    expect(phase(v.valley, 'a')).toBe('EXTRACTED')
    expect(v.valley.raid?.phase).toBe('OUT')
    expect(
      v.step({ type: 'extract', id: 'a', kind: 'keep' }).reply?.reason
    ).toBe('not-in-raid')
  })

  it('resets once the last player in the raid is out', () => {
    const v = valleyWith(
      join('a'),
      join('b'),
      { type: 'board', id: 'a' },
      {
        type: 'board',
        id: 'b',
      }
    )
    v.step({ type: 'extract', id: 'a', kind: 'fuel' })
    const r = v.step({ type: 'extract', id: 'b', kind: 'fuel' })
    expect(reasons(r)).toEqual(['extracted', 'reset'])
    expect(r.alarm).toBeNull()
    expect(v.valley.raid).toBeNull()
    expect(r.broadcast[1].raid).toBeNull()
    // The extracted players are still listed, out of the raid.
    expect(Object.keys(v.valley.members)).toEqual(['a', 'b'])
  })

  it('resets when the last player leaves, and forms anew for the next', () => {
    const v = valleyWith(join('a'), { type: 'board', id: 'a' })
    const r = v.step({ type: 'leave', id: 'a' })
    expect(reasons(r)).toEqual(['left', 'reset'])
    expect(v.valley.raid).toBeNull()
    v.tick(1000)
    const again = v.step(join('b'))
    expect(v.valley.raid?.epoch).toBe(2)
    expect(again.alarm).toBe(v.now + CONFIG.raid.loadoutSeconds * 1000)
    expect(phase(v.valley, 'b')).toBe('LOBBY')
  })

  it('does not reset while someone is still on foot', () => {
    const v = valleyWith(join('a'), join('b'), { type: 'board', id: 'a' })
    v.step({ type: 'board', id: 'b' })
    const r = v.step({ type: 'leave', id: 'a' })
    expect(reasons(r)).toEqual(['left'])
    expect(v.valley.raid?.phase).toBe('OUT')
  })

  it('counts an extract from the lobby as never boarding', () => {
    const v = valleyWith(join('a'), join('b'), { type: 'board', id: 'a' })
    const r = v.step({ type: 'extract', id: 'b', kind: 'fuel' })
    expect(reasons(r)).toEqual(['extracted', 'depart'])
    expect(v.valley.raid?.riders).toEqual(['a'])
  })
})

describe('rule 9: one berry a day per account', () => {
  const collect = (id: string): ValleyAction => ({ type: 'collect', id })
  const daily = (r: ReturnType<typeof reduce>) => r.daily as DailyMessage

  it('gives the first ask of the day a berry, to the asker alone', () => {
    const v = valleyWith(join('a'))
    const r = v.step(collect('a'))
    expect(r.broadcast).toEqual([])
    expect(r.alarm).toBeUndefined()
    expect(daily(r)).toEqual({
      type: 'daily',
      picked: true,
      daily: { collected: true, resetsAt: nextMidnight(v.now) },
    })
    expect(v.valley.dailies).toEqual({ 'acct-a': dayKey(v.now) })
  })

  it('refuses the second ask of the day without touching the valley', () => {
    const v = valleyWith(join('a'), collect('a'))
    const before = v.valley
    v.tick(60_000)
    const r = v.step(collect('a'))
    expect(r.valley).toBe(before)
    expect(daily(r)).toEqual({
      type: 'daily',
      picked: false,
      daily: { collected: true, resetsAt: nextMidnight(v.now) },
    })
  })

  it('shares the berry between sockets on one account, not across accounts', () => {
    const v = valleyWith(join('a'), collect('a'))
    // The same account on another socket.
    v.step({ ...join('a2'), account: 'acct-a' } as ValleyAction)
    expect(daily(v.step(collect('a2'))).picked).toBe(false)
    // Another account showing the same name has a berry of its own.
    v.step({ ...join('b'), name: 'A' } as ValleyAction)
    expect(daily(v.step(collect('b'))).picked).toBe(true)
    expect(Object.keys(v.valley.dailies).sort()).toEqual(['acct-a', 'acct-b'])
  })

  it('never puts the account on the wire', () => {
    const v = valleyWith(join('a'))
    expect(JSON.stringify(toWire(v.valley))).not.toContain('acct-a')
  })

  it('has the berry back at midnight Central, and forgets yesterday', () => {
    const v = valleyWith(join('a'), collect('a'), join('b'))
    expect(dailyFor(v.valley, 'acct-a', v.now).collected).toBe(true)
    v.tick(nextMidnight(v.now) - v.now - 1)
    expect(dailyFor(v.valley, 'acct-a', v.now).collected).toBe(true)
    v.tick(1)
    expect(dailyFor(v.valley, 'acct-a', v.now)).toEqual({
      collected: false,
      resetsAt: nextMidnight(v.now),
    })
    // B's pick on the new day drops A's record from the old one.
    expect(daily(v.step(collect('b'))).picked).toBe(true)
    expect(v.valley.dailies).toEqual({ 'acct-b': dayKey(v.now) })
    expect(daily(v.step(collect('a'))).picked).toBe(true)
  })

  it('keeps the record through a reset and a fresh lobby', () => {
    const v = valleyWith(join('a'), collect('a'))
    v.step({ type: 'reset' })
    expect(v.valley.raid).toBeNull()
    expect(v.valley.dailies).toEqual({ 'acct-a': dayKey(v.now) })
    // Everyone leaves; the next arrival opens a new lobby.
    v.step({ type: 'leave', id: 'a' })
    v.step(join('a'))
    expect(v.valley.raid?.epoch).toBe(2)
    expect(daily(v.step(collect('a'))).picked).toBe(false)
  })

  it('answers a stranger with a nack', () => {
    const v = valleyWith(join('a'))
    const r = v.step(collect('nobody'))
    expect(r.reply).toEqual({
      type: 'nack',
      re: 'collect',
      reason: 'not-in-valley',
    })
    expect(r.valley).toBe(v.valley)
  })

  it('starts every valley with an empty record', () => {
    expect(createValley().dailies).toEqual({})
    expect(dailyFor(createValley(), 'acct-a', T0)).toEqual({
      collected: false,
      resetsAt: nextMidnight(T0),
    })
  })
})

describe('rule 10: Gron changes how a raider is shown', () => {
  it('renames and restyles a member without touching their place', () => {
    const v = valleyWith(join('a'), join('b'), { type: 'board', id: 'a' })
    const before = v.valley.members.a
    const r = v.step({ type: 'appearance', id: 'a', name: 'Renamed' })
    expect(r.broadcast).toEqual([])
    expect(r.alarm).toBeUndefined()
    expect(v.valley.members.a).toEqual({ ...before, name: 'Renamed' })
    expect(toWire(v.valley)?.members.find((m) => m.id === 'a')?.name).toBe(
      'Renamed'
    )
    v.step({ type: 'appearance', id: 'a', outfit: 'church' })
    expect(v.valley.members.a).toEqual({
      ...before,
      name: 'Renamed',
      outfit: 'church',
    })
    // Still aboard, still in the lobby.
    expect(v.valley.members.a.boarded).toBe(true)
    expect(v.valley.members.a.phase).toBe('LOBBY')
  })

  it('keeps the berry with the account through a rename', () => {
    const v = valleyWith(join('a'), { type: 'collect', id: 'a' })
    v.step({ type: 'appearance', id: 'a', name: 'Someone_Else' })
    const r = v.step({ type: 'collect', id: 'a' })
    expect((r.daily as DailyMessage).picked).toBe(false)
  })

  it('ignores a stranger', () => {
    const v = valleyWith(join('a'))
    const r = v.step({ type: 'appearance', id: 'nobody', name: 'X' })
    expect(r.valley).toBe(v.valley)
    expect(r.broadcast).toEqual([])
  })
})

describe('dev frames', () => {
  it('hurries the lobby clock and re-arms the alarm', () => {
    const v = valleyWith(join('a'))
    v.tick(2000)
    const r = v.step({ type: 'hurry', seconds: 3 })
    expect(reasons(r)).toEqual(['hurry'])
    expect(v.valley.raid?.loadoutEndsAt).toBe(v.now + 3000)
    expect(r.alarm).toBe(v.now + 3000)
    expect(v.valley.raid?.startedAt).toBe(T0)
  })

  it('has nothing to hurry once the truck has left', () => {
    const v = valleyWith(join('a'), { type: 'board', id: 'a' })
    expect(v.step({ type: 'hurry', seconds: 0 }).reply?.reason).toBe('no-lobby')
  })

  it('resets the valley on demand', () => {
    const v = valleyWith(join('a'), join('b'))
    const r = v.step({ type: 'reset' })
    expect(reasons(r)).toEqual(['reset'])
    expect(r.alarm).toBeNull()
    expect(v.valley.raid).toBeNull()
  })
})

describe('the wire', () => {
  it('carries the raid and the members, never the pickup count', () => {
    const v = valleyWith(join('a'), join('b'), { type: 'board', id: 'a' })
    const wire = toWire(v.valley)
    expect(wire).toMatchObject({
      epoch: 1,
      phase: 'LOBBY',
      riders: [],
      taken: [],
      call: null,
    })
    expect(wire?.shelves).toHaveLength(STATIONS)
    expect(wire?.members).toEqual([
      { id: 'a', name: 'A', phase: 'LOBBY', boarded: true },
      { id: 'b', name: 'B', phase: 'LOBBY', boarded: false },
    ])
    expect(wire && 'pickups' in wire).toBe(false)
    expect(wire && 'stations' in wire).toBe(false)
    // The bush's record is per name and goes out in the daily frames.
    expect(wire && 'dailies' in wire).toBe(false)
    expect(toWire(createValley())).toBeNull()
  })

  it('ignores a leave from a stranger', () => {
    const v = valleyWith(join('a'))
    const r = v.step({ type: 'leave', id: 'nobody' })
    expect(r.broadcast).toEqual([])
  })
})
