import { describe, expect, it } from 'vitest'
import { BOOK, foundLines } from '../../src/book.ts'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import { tradeRefusal } from '../../src/cosmetics.ts'
import { DAILY_TASK, taskLine } from '../../src/dailytask.ts'
import { dealRefusal } from '../../src/dealer.ts'
import {
  applyFrame,
  asked,
  asking,
  DIALED,
  expeditionName,
  haulLine,
  lineLost,
  NO_WARDS,
  raiderStats,
  sayLine,
  shelfOf,
  useImpact,
  wardsNow,
  withCitgoNames,
} from '../../src/dialstate.ts'
import { riskOf } from '../../src/expeditions.ts'
import {
  anglerNews,
  catchLine,
  fishRefusal,
  skillUpLine,
} from '../../src/fishlines.ts'
import { itemLabel, itemLine } from '../../src/itemcopy.ts'
import { healsOf, itemById } from '../../src/items.ts'
import { outfitById } from '../../src/outfits.ts'
import { xpToReach } from '../../src/progression.ts'
import { stepNews, stepRefusal } from '../../src/quests.ts'
import {
  foundLine,
  lineName,
  recycleRefusal,
  researchNews,
} from '../../src/researchlines.ts'
import { SEASON, seasonLine } from '../../src/season.ts'
import { FRESH_STAND, refusalLine } from '../../src/stand.ts'
import { formatCash } from '../../src/store.ts'
import { levelsAt } from '../../src/wardlevels.ts'
import type { DialState } from '../../src/dialstate.ts'
import type { ServerMessage, WelcomeMessage } from '../../src/protocol.ts'

const welcome = (over: Partial<WelcomeMessage> = {}): ServerMessage => ({
  type: 'welcome',
  id: 'p1',
  serverNow: 0,
  peers: [],
  world: null,
  place: null,
  daily: { collected: [], resetsAt: 0 },
  pack: { marlboro: 40 },
  cash: 4000,
  cosmetics: [],
  stash: { joints: 1 },
  corpses: [],
  season: { season: SEASON.id, kills: 0, claimed: false },
  book: [],
  task: { task: DAILY_TASK.id, day: 'd', count: 0, claimed: false },
  xp: 120,
  stand: FRESH_STAND,
  quests: { rose: 'none' },
  health: 900,
  healthMax: 1000,
  wards: { ...NO_WARDS, high: 0.5 },
  citgos: { last: null, visited: [] },
  waypoints: [],
  expedition: null,
  ...over,
})

describe("Dial-Up's state", () => {
  it('takes the welcome whole', () => {
    const s = applyFrame(DIALED, welcome(), 0, 0)
    expect(s).toMatchObject({
      id: 'p1',
      pack: { marlboro: 40 },
      stash: { joints: 1 },
      cash: 4000,
      xp: 120,
      stand: FRESH_STAND,
      health: 900,
      healthMax: 1000,
      wards: { high: 0.5 },
      world: null,
    })
  })

  it('reads a bad stand or wards as none', () => {
    const s = applyFrame(
      DIALED,
      welcome({ stand: 'x' as never, wards: 'y' as never }),
      0,
      0
    )
    expect(s.stand).toBeNull()
    expect(s.wards).toEqual(NO_WARDS)
  })

  it("takes the pack frame as the locker's answer", () => {
    let s = asked(applyFrame(DIALED, welcome(), 0, 0), { locker: true })
    expect(s.pending.locker).toBe(true)
    s = applyFrame(
      s,
      {
        type: 'pack',
        pack: { marlboro: 20 },
        cash: 4000,
        cosmetics: [],
        stash: { marlboro: 20, joints: 1 },
        corpses: [],
      },
      0,
      0
    )
    expect(s.stash).toMatchObject({ marlboro: 20, joints: 1 })
    expect(s.pending.locker).toBe(false)
  })

  it("says what the stand's frame and its refusals say", () => {
    let s = asked(applyFrame(DIALED, welcome(), 0, 0), { stand: true })
    s = applyFrame(
      s,
      { type: 'stand', re: 'collect', stand: FRESH_STAND, cents: 250 },
      5,
      5
    )
    expect(s.pending.stand).toBe(false)
    expect(s.said).toEqual({
      text: copy('log.stand_collected', { amount: '$2.50' }),
      at: 5,
    })
    s = applyFrame(
      s,
      { type: 'stand', re: 'collect', stand: 'x' as never },
      6,
      6
    )
    expect(s.said?.at).toBe(5)
    s = applyFrame(
      asked(s, { stand: true }),
      { type: 'nack', re: 'stand-collect', reason: 'empty' },
      7,
      7
    )
    expect(s.said).toEqual({ text: refusalLine('empty'), at: 7 })
    s = applyFrame(
      asked(s, { locker: true }),
      { type: 'nack', re: 'stow', reason: 'x' },
      8,
      8
    )
    expect(s.said).toEqual({ text: copy('log.locker_refused'), at: 8 })
    expect(s.pending.locker).toBe(false)
    // Another refusal says nothing here.
    expect(
      applyFrame(s, { type: 'nack', re: 'pass', reason: 'dialup' }, 9, 9)
    ).toBe(s)
  })

  it('keeps the angler and the line, and says the dig, the catch and a refusal', () => {
    const angler = { skill: 12, caught: 1, perDay: 40, digAt: 0 }
    let s = applyFrame(DIALED, { type: 'angler', angler }, 1, 1)
    expect(s.angler).toEqual(angler)
    expect(s.said).toBeNull()
    expect(
      raiderStats(s, '2026-10-21').find((st) => st.id === 'fishing')
    ).toEqual({
      id: 'fishing',
      label: copy('dialup.raider.fishing'),
      value: copy('dialup.raider.fishing_value', {
        skill: '1.2',
        caught: 1,
        limit: 40,
      }),
      share: 12 / CONFIG.fishing.skillCap,
    })
    s = applyFrame(
      asked(s, { fish: true }),
      { type: 'angler', angler, dug: 2 },
      2,
      2
    )
    expect(s.pending.fish).toBe(false)
    expect(s.said).toEqual({ text: anglerNews({ dug: 2 }), at: 2 })
    // A rod out of the box from the 3D valley goes into the log alone.
    s = applyFrame(s, { type: 'angler', angler, rod: true }, 3, 3)
    expect(s.chat.at(-1)?.text).toBe(anglerNews({ rod: true }))
    // A garbled angler keeps the one it had.
    s = applyFrame(s, { type: 'angler', angler: null as never }, 3, 3)
    expect(s.angler).toEqual(angler)
    s = applyFrame(
      asked(s, { fish: true }),
      { type: 'line', bitesIn: 500, hook: null },
      4,
      4
    )
    expect(s.line).toEqual({ hook: null, bitesAt: 504 })
    expect(s.pending.fish).toBe(false)
    s = applyFrame(
      s,
      {
        type: 'catch',
        outcome: 'landed',
        kind: 'bluegill',
        skill: 13,
        up: true,
      },
      5,
      5
    )
    expect(s.line).toBeNull()
    expect(s.said?.text).toBe(
      catchLine({ outcome: 'landed', kind: 'bluegill' })
    )
    expect(s.chat.at(-1)?.text).toBe(skillUpLine(13))
    s = applyFrame(
      { ...asked(s, { fish: true }), line: { hook: null, bitesAt: 9 } },
      { type: 'nack', re: 'reel', reason: 'no-line' },
      6,
      6
    )
    expect(s.line).toBeNull()
    expect(s.pending.fish).toBe(false)
    expect(s.said).toEqual({ text: fishRefusal('no-line'), at: 6 })
    s = applyFrame(
      { ...s, line: { hook: null, bitesAt: 9 } },
      { type: 'nack', re: 'cast', reason: 'tired' },
      7,
      7
    )
    expect(s.line).toEqual({ hook: null, bitesAt: 9 })
  })

  it('keeps the research, and says a level, loose change and a refusal', () => {
    let s = applyFrame(
      DIALED,
      { type: 'research', research: { dimes: 2 } },
      1,
      1
    )
    expect(s.research).toEqual({ dimes: 2 })
    expect(s.said).toBeNull()
    // The raider's record shows loose change once the research is known.
    expect(
      raiderStats(DIALED, '2026-10-21').some((st) => st.id === 'loose-change')
    ).toBe(false)
    expect(
      raiderStats(s, '2026-10-21').find((st) => st.id === 'loose-change')
    ).toEqual({
      id: 'loose-change',
      label: lineName('dimes'),
      value: copy('dialup.raider.loose_change', {
        pct: Math.round(CONFIG.recycling.lines.dimes[1].chance * 100),
        level: 2,
        top: CONFIG.recycling.lines.dimes.length,
      }),
      share: 2 / CONFIG.recycling.lines.dimes.length,
    })
    s = applyFrame(
      asked(s, { recycle: true }),
      { type: 'research', research: { dimes: 3 }, line: 'dimes' },
      2,
      2
    )
    expect(s.research).toEqual({ dimes: 3 })
    expect(s.pending.recycle).toBe(false)
    expect(s.said).toEqual({
      text: researchNews({ research: { dimes: 3 }, line: 'dimes' }),
      at: 2,
    })
    // A level bought from the 3D valley goes into the log alone.
    const before = s.said
    s = applyFrame(
      s,
      { type: 'research', research: { dimes: 4 }, line: 'dimes' },
      3,
      3
    )
    expect(s.said).toBe(before)
    expect(s.chat.at(-1)?.text).toBe(
      researchNews({ research: { dimes: 4 }, line: 'dimes' })
    )
    s = applyFrame(s, { type: 'found', dimes: 5 }, 4, 4)
    expect(s.chat.at(-1)?.text).toBe(foundLine(5))
    s = applyFrame(
      asked(s, { recycle: true }),
      { type: 'nack', re: 'recycle', reason: 'short' },
      5,
      5
    )
    expect(s.pending.recycle).toBe(false)
    expect(s.said).toEqual({ text: recycleRefusal('short'), at: 5 })
  })

  it('follows the XP up, geometrie, the wards and the world', () => {
    let s = applyFrame(DIALED, welcome(), 0, 0)
    s = applyFrame(s, { type: 'xp', xp: 150, gained: 30 }, 0, 0)
    expect(s.xp).toBe(150)
    // Two grants out of order never take XP back.
    expect(applyFrame(s, { type: 'xp', xp: 140, gained: 20 }, 0, 0).xp).toBe(
      150
    )
    s = applyFrame(s, { type: 'health', health: 1000, max: 1040 }, 0, 0)
    expect([s.health, s.healthMax]).toEqual([1000, 1040])
    s = applyFrame(s, { type: 'wards', wards: { ...NO_WARDS, drunk: 1 } }, 0, 0)
    expect(s.wards.drunk).toBe(1)
    expect(applyFrame(s, { type: 'wards', wards: 'x' as never }, 0, 0)).toBe(s)
    const world = { day: 'd' } as never
    s = applyFrame(s, { type: 'world', reason: 'joined', world }, 0, 0)
    expect(s.world).toBe(world)
    expect(
      applyFrame(s, { type: 'world', reason: 'joined', world: null }, 0, 0)
        .world
    ).toBe(world)
    expect(applyFrame(s, { type: 'pong', t: 0, serverNow: 0 }, 0, 0)).toBe(s)
  })

  it('keeps the season, the task, the book and the Citgos', () => {
    let s = applyFrame(DIALED, welcome({ book: ['citgo'] }), 0, 0)
    expect(s.season).toEqual({ kills: 0, claimed: false })
    expect(s.task).toEqual({ day: 'd', count: 0, claimed: false })
    expect(s.book).toEqual(['citgo'])
    s = applyFrame(
      s,
      {
        type: 'season',
        season: { season: SEASON.id, kills: 2, claimed: false },
        rewarded: false,
      },
      0,
      0
    )
    expect(s.season.kills).toBe(2)
    s = applyFrame(
      s,
      {
        type: 'task',
        task: { task: DAILY_TASK.id, day: 'e', count: 3, claimed: false },
        rewarded: false,
      },
      0,
      0
    )
    expect(s.task).toEqual({ day: 'e', count: 3, claimed: false })
    // Another season's or task's progress says nothing of this one's.
    const other = applyFrame(
      applyFrame(
        s,
        {
          type: 'season',
          season: { season: 'gone', kills: 9, claimed: true },
          rewarded: true,
        },
        0,
        0
      ),
      {
        type: 'task',
        task: { task: 'gone', day: 'f', count: 9, claimed: true },
        rewarded: true,
      },
      0,
      0
    )
    expect(other.season).toEqual(s.season)
    expect(other.task).toEqual(s.task)
    // A page already written is never written twice.
    s = applyFrame(s, { type: 'book', found: ['citgo', 'shadowman'] }, 0, 0)
    expect(s.book).toEqual(['citgo', 'shadowman'])
    s = applyFrame(
      s,
      { type: 'citgos', citgos: { last: 4, visited: [0, 4] } },
      0,
      0
    )
    expect(s.citgos.visited).toEqual([0, 4])
  })
})

describe("the raider's record", () => {
  const record = (s: DialState, day = 'd') =>
    Object.fromEntries(raiderStats(s, day).map((stat) => [stat.id, stat]))

  it('counts toward each goal', () => {
    const s: DialState = {
      ...applyFrame(DIALED, welcome({ xp: 0 }), 0, 0),
      season: { kills: 2, claimed: false },
      task: { day: 'd', count: 4, claimed: false },
      book: ['citgo', 'citgo', 'shadowman'],
      citgos: { last: 3, visited: [0, 3] },
    }
    const r = record(s)
    expect(r.xp.share).toBe(0)
    expect(r.season.value).toBe(
      copy('dialup.raider.of', { done: 2, goal: SEASON.goal })
    )
    expect(r.task.value).toBe(
      copy('dialup.raider.of', { done: 4, goal: DAILY_TASK.goal })
    )
    expect(r.book.value).toBe(
      copy('dialup.raider.of', { done: 2, goal: BOOK.length })
    )
    expect(r.citgos).toMatchObject({ value: '2', share: null })
    // Nothing worn, no line for it.
    expect(r.worn).toBeUndefined()
    // Yesterday's burns count for nothing today.
    expect(record(s, 'e').task.share).toBe(0)
  })

  it('says Done for what is paid, the top level, and what is worn', () => {
    const s: DialState = {
      ...DIALED,
      xp: Number.MAX_SAFE_INTEGER,
      season: { kills: 7, claimed: true },
      task: { day: 'd', count: 5, claimed: true },
      cosmetics: ['flaming-halo'],
    }
    const r = record(s)
    expect(r.xp).toMatchObject({
      value: copy('dialup.raider.xp_max'),
      share: 1,
    })
    expect(r.season.value).toBe(copy('dialup.raider.done'))
    expect(r.season.share).toBe(1)
    expect(r.task.value).toBe(copy('dialup.raider.done'))
    expect(r.worn.value).toBe(copy('cosmetics.flaming-halo.label'))
  })
})

describe('the folk, the Citgo and the chat on the phone', () => {
  const me = (over: Partial<WelcomeMessage> = {}) =>
    applyFrame(DIALED, welcome(over), 0, 0)
  const world = (shelves: Record<string, boolean[]>[]) =>
    ({ shelves, dealer: {} }) as never

  it("lists a Citgo's shelves, the first unit a buy takes", () => {
    const s = { ...me(), world: world([{ marlboro: [false, true, true] }]) }
    expect(shelfOf(s, 0)).toEqual([
      {
        kind: 'marlboro',
        price: itemById('marlboro')?.price,
        left: 2,
        unit: 1,
      },
    ])
    const out = { ...s, world: world([{ marlboro: [false, false] }]) }
    expect(shelfOf(out, 0)[0]).toMatchObject({ left: 0, unit: null })
    expect(shelfOf(me(), 0)).toEqual([])
    expect(shelfOf(s, 4)).toEqual([])
  })

  it('says a buy of ours, and why one was refused', () => {
    let s = asked(me(), { buy: { station: 0, kind: 'marlboro' } })
    s = applyFrame(
      s,
      {
        type: 'world',
        reason: 'bought',
        world: world([]),
        by: 'p1',
        station: 0,
        item: 'marlboro',
      },
      5,
      5
    )
    expect(s.pending.buy).toBeNull()
    expect(s.said?.text).toBe(itemLine('marlboro', 'bought'))
    // Someone else's is no news.
    const other = applyFrame(
      s,
      {
        type: 'world',
        reason: 'bought',
        world: world([]),
        by: 'p2',
        item: 'marlboro',
      },
      6,
      6
    )
    expect(other.said).toBe(s.said)
    const nack = (reason: string) =>
      applyFrame(
        s,
        { type: 'nack', re: 'buy', reason, station: 0, item: 'marlboro' },
        7,
        7
      ).said?.text
    expect(nack('not-visited')).toBe(copy('dialup.citgo.not_visited'))
    expect(nack('not-in-valley')).toBe(copy('dialup.citgo.no_world'))
    expect(nack('sold-out')).toBe(copy('log.sold_out'))
    const price = itemById('marlboro')?.price ?? 0
    expect(nack('short')).toBe(
      copy('log.short', { amount: formatCash(Math.max(0, price - s.cash)) })
    )
    expect(nack('what')).toBe(copy('log.refused'))
  })

  it("follows Erwin's deals, the rose, and Moab's trade", () => {
    let s = asked(me(), { deal: true })
    s = applyFrame(
      s,
      {
        type: 'world',
        reason: 'dealt',
        world: world([]),
        by: 'p1',
        item: 'lsd',
      },
      0,
      0
    )
    expect(s.pending.deal).toBe(false)
    expect(s.said?.text).toBe(copy('dealer.bought', { item: itemLabel('lsd') }))
    s = applyFrame(s, { type: 'nack', re: 'deal', reason: 'sold-out' }, 0, 0)
    expect(s.said?.text).toBe(dealRefusal('sold-out'))
    s = applyFrame(
      s,
      { type: 'quest', quest: 'rose', step: 'accept', stage: 'given' },
      0,
      0
    )
    expect(s.quests.rose).toBe('given')
    expect(s.said?.text).toBe(stepNews('accept'))
    expect(
      applyFrame(
        s,
        { type: 'quest', quest: 'x', step: 'accept', stage: 'given' } as never,
        0,
        0
      )
    ).toBe(s)
    s = applyFrame(s, { type: 'nack', re: 'quest', reason: 'too-far' }, 0, 0)
    expect(s.said?.text).toBe(stepRefusal('too-far'))
    s = asked(s, { trade: true })
    s = applyFrame(s, { type: 'nack', re: 'trade', reason: 'short' }, 0, 0)
    expect(s.pending.trade).toBe(false)
    s = applyFrame(
      s,
      {
        type: 'pack',
        pack: {},
        stash: {},
        cash: 0,
        cosmetics: ['flaming-halo'],
        corpses: [],
      } as never,
      0,
      0
    )
    expect(s.cosmetics).toEqual(['flaming-halo'])
    expect(s.said?.text).toBe(
      copy('log.cosmetic_worn', {
        cosmetic: copy('cosmetics.flaming-halo.label'),
      })
    )
  })

  it('keeps the peers and the chat log', () => {
    const peer = {
      id: 'p2',
      name: 'Kid',
      outfit: 'player',
      cosmetics: [],
      level: 3,
      at: null,
    } as const
    let s = me()
    s = applyFrame(
      s,
      { type: 'peer-joined', peer: { ...peer, cosmetics: [] } },
      0,
      0
    )
    expect(s.peers.map((p) => p.name)).toEqual(['Kid'])
    expect(s.chat.at(-1)?.text).toBe(copy('log.peer_joined', { name: 'Kid' }))
    s = applyFrame(
      s,
      { type: 'peer-updated', peer: { ...peer, cosmetics: [], level: 4 } },
      0,
      0
    )
    expect(s.peers[0].level).toBe(4)
    // Back from a dropped line under the same id: no news in the log.
    const lines = s.chat.length
    s = applyFrame(
      s,
      { type: 'peer-joined', peer: { ...peer, cosmetics: [], level: 4 } },
      0,
      0
    )
    expect(s.peers).toHaveLength(1)
    expect(s.chat).toHaveLength(lines)
    s = applyFrame(
      s,
      { type: 'chat', id: 'p2', name: 'Kid', text: 'yo', at: 9 },
      0,
      0
    )
    expect(s.chat.at(-1)).toEqual({
      kind: 'say',
      name: 'Kid',
      text: 'yo',
      at: 9,
    })
    s = applyFrame(
      s,
      {
        type: 'whisper',
        from: 'Kid',
        to: 'Me',
        text: 'psst',
        at: 10,
        outgoing: false,
      },
      0,
      0
    )
    expect(s.chat.at(-1)?.name).toBe(copy('chat.whisper_from', { name: 'Kid' }))
    s = applyFrame(s, { type: 'peer-left', id: 'p2' }, 0, 0)
    expect(s.peers).toEqual([])
    expect(s.chat.at(-1)?.text).toBe(copy('log.peer_left', { name: 'Kid' }))
    expect(applyFrame(s, { type: 'peer-left', id: 'zz' }, 0, 0).chat).toBe(
      s.chat
    )
    s = applyFrame(s, { type: 'nack', re: 'chat', reason: 'too-fast' }, 0, 0)
    expect(s.said?.text).toBe(copy('chat.too_fast'))
  })

  it('says a line, answers /online, and sends the rest to the valley', () => {
    const self = { name: 'Me', level: 2 }
    const s = me()
    expect(sayLine(s, '  ', self, 0)).toEqual({ state: s, frame: null })
    expect(sayLine(s, 'hello', self, 0).frame).toEqual({
      type: 'chat',
      text: 'hello',
    })
    const online = sayLine(s, '/online', self, 0)
    expect(online.frame).toBeNull()
    expect(online.state.chat.at(-1)?.text).toBe(
      copy('chat.online', {
        names: copy('chat.online_phone', { name: 'Me', level: 2 }),
      })
    )
    expect(sayLine(s, '/wave', self, 0).state.chat.at(-1)?.text).toBe(
      copy('dialup.social.no_body')
    )
    expect(sayLine(s, '/nope', self, 0).state.chat.at(-1)?.text).toBe(
      copy('chat.unknown_command')
    )
    expect(sayLine(s, '/w', self, 0).state.chat.at(-1)?.text).toBe(
      copy('chat.usage_whisper')
    )
    const whisper = sayLine(s, '/w Kid hi there', self, 0)
    expect(whisper.frame).toEqual({
      type: 'whisper',
      to: 'Kid',
      text: 'hi there',
    })
    expect(whisper.state.pending.whisperTo).toBe('Kid')
    const friends = sayLine(s, '/friends', self, 0)
    expect(friends.frame).toEqual({ type: 'friends' })
    const asking = sayLine(s, '/friend Kid', self, 0)
    expect(asking.frame).toEqual({ type: 'friend', name: 'Kid' })
    // The valley's answers.
    let after = applyFrame(
      asking.state,
      {
        type: 'friends',
        friends: [
          { name: 'Kid', state: 'asked', online: true, where: 'phone' },
        ],
      },
      0,
      0
    )
    expect(after.pending.ask).toBeNull()
    expect(after.said?.text).toBe(copy('friends.sent', { name: 'Kid' }))
    after = applyFrame(friends.state, { type: 'friends', friends: [] }, 0, 0)
    expect(after.chat.at(-1)?.text).toBe(copy('friends.none'))
    after = applyFrame(
      after,
      { type: 'friend-news', news: 'asked', name: 'Kid' },
      0,
      0
    )
    expect(after.chat.at(-1)?.text).toBe(
      copy('friends.news_asked', { name: 'Kid' })
    )
    expect(
      applyFrame(
        whisper.state,
        { type: 'nack', re: 'whisper', reason: 'not-here' },
        0,
        0
      ).said?.text
    ).toBe(copy('chat.whisper_not_here', { name: 'Kid' }))
    expect(
      applyFrame(
        asking.state,
        { type: 'nack', re: 'friend', reason: 'self' },
        0,
        0
      ).said?.text
    ).toBe(copy('friends.self'))
  })

  it('invites, keeps the party, hears it, and says its news', () => {
    const self = { name: 'Me', level: 2 }
    const s = { ...me(), name: 'Me' }
    const asking = sayLine(s, '/invite Kid', self, 0)
    expect(asking.frame).toEqual({ type: 'invite', name: 'Kid' })
    expect(asking.state.pending.invite).toBe('Kid')
    expect(sayLine(s, '/leave', self, 0).frame).toEqual({
      type: 'party-leave',
    })
    expect(sayLine(s, '/p hi', self, 0).frame).toEqual({
      type: 'party-chat',
      text: 'hi',
    })
    expect(sayLine(s, '/party', self, 0).state.chat.at(-1)?.text).toBe(
      copy('party.none')
    )
    let after = applyFrame(
      asking.state,
      { type: 'party-news', news: 'sent', name: 'Kid' },
      0,
      0
    )
    expect(after.pending.invite).toBeNull()
    expect(after.chat.at(-1)?.text).toBe(copy('party.invited', { name: 'Kid' }))
    const party = {
      members: [
        { name: 'Me', online: true },
        { name: 'Kid', online: true },
      ],
      invites: [],
    }
    after = applyFrame(after, { type: 'party', ...party }, 0, 0)
    expect(after.party).toEqual(party)
    after = applyFrame(
      after,
      { type: 'party-news', news: 'joined', name: 'Me' },
      0,
      0
    )
    expect(after.chat.at(-1)?.text).toBe(copy('party.you_joined'))
    after = applyFrame(
      after,
      { type: 'party-chat', from: 'Kid', text: 'maze?', at: 9 },
      0,
      0
    )
    expect(after.chat.at(-1)).toEqual(
      expect.objectContaining({ kind: 'party', text: 'maze?' })
    )
    const refused = applyFrame(
      asking.state,
      { type: 'nack', re: 'invite', reason: 'in-party' },
      0,
      0
    )
    expect(refused.said?.text).toBe(copy('party.in_party', { name: 'Kid' }))
    expect(refused.pending.invite).toBeNull()
  })

  it('sends the crew commands, keeps the crew, hears it, and says its news', () => {
    const self = { name: 'Me', level: 2 }
    const s = { ...me(), name: 'Me' }
    const asking = sayLine(s, '/crew invite Kid', self, 0)
    expect(asking.frame).toEqual({ type: 'crew-invite', name: 'Kid' })
    expect(asking.state.pending.crew).toBe('Kid')
    expect(sayLine(s, '/crew', self, 0).state.chat.at(-1)?.text).toBe(
      copy('crew.none')
    )
    const crew = {
      name: 'Bull Valley',
      tag: 'BVC',
      leader: 'Me',
      members: [{ name: 'Me', online: true }],
    }
    let after = applyFrame(
      asking.state,
      { type: 'crew', crew, invites: [] },
      0,
      0
    )
    expect(after.crew.crew).toEqual(crew)
    after = applyFrame(
      after,
      {
        type: 'crew-news',
        news: 'sent',
        name: 'Kid',
        tag: 'BVC',
        crew: 'Bull Valley',
      },
      0,
      0
    )
    expect(after.pending.crew).toBeNull()
    expect(after.chat.at(-1)?.text).toBe(copy('crew.sent', { name: 'Kid' }))
    after = applyFrame(
      after,
      { type: 'crew-chat', from: 'Kid', text: 'keep?', at: 9 },
      0,
      0
    )
    expect(after.chat.at(-1)).toEqual(
      expect.objectContaining({ kind: 'crew', text: 'keep?' })
    )
    const refused = applyFrame(
      asking.state,
      { type: 'nack', re: 'crew-invite', reason: 'their-crew' },
      0,
      0
    )
    expect(refused.said?.text).toBe(copy('crew.their_crew', { name: 'Kid' }))
    expect(refused.pending.crew).toBeNull()
  })

  it("asks for a raider's card, keeps the answer, and says a refusal", () => {
    const self = { name: 'Me', level: 2 }
    const asking = sayLine(me(), '/inspect Kid', self, 0)
    expect(asking.frame).toEqual({ type: 'inspect', name: 'Kid' })
    expect(asking.state.pending.inspect).toBe('Kid')
    const card = {
      name: 'Kid',
      level: 3,
      outfit: 'player' as const,
      finish: 'black' as const,
      cosmetics: [],
      book: { found: 1, of: 9 },
      season: { kills: 0, goal: 5, claimed: false },
      friend: null,
      party: null,
      crew: null,
      crewInvite: false,
      online: true,
    }
    const shown = applyFrame(asking.state, { type: 'inspected', card }, 0, 0)
    expect(shown.inspected).toEqual(card)
    expect(shown.pending.inspect).toBeNull()
    const refused = applyFrame(
      asking.state,
      { type: 'nack', re: 'inspect', reason: 'unknown' },
      0,
      0
    )
    expect(refused.said?.text).toBe(copy('friends.unknown', { name: 'Kid' }))
    expect(refused.pending.inspect).toBeNull()
  })
})

describe('expeditions on the phone', () => {
  const run = {
    id: 'corn' as const,
    startedAt: 0,
    endsAt: 60_000,
    seed: 3,
    ward: 0,
  }

  it('keeps the run out, says it went, and says what came home', () => {
    let s = applyFrame(DIALED, welcome({ expedition: run }), 0, 0)
    expect(s.expedition).toEqual(run)
    expect(
      applyFrame(DIALED, welcome({ expedition: 'x' as never }), 0, 0).expedition
    ).toBeNull()
    s = asked({ ...s, expedition: null }, { expedition: true })
    s = applyFrame(s, { type: 'expedition', run }, 0, 0)
    expect(s.pending.expedition).toBe(false)
    expect(s.said?.text).toBe(
      copy('dialup.expeditions.sent', { run: expeditionName('corn') })
    )
    const outcome = {
      items: { cabbage: 2 },
      cents: 150,
      hurt: false,
      damage: 0,
      xp: 4,
    }
    s = applyFrame(s, { type: 'expedition', run: null, outcome }, 0, 0)
    expect(s.expedition).toBeNull()
    expect(s.haul).toEqual(outcome)
    expect(s.said?.text).toBe(haulLine(outcome))
    expect(haulLine(outcome)).toBe(
      copy('dialup.expeditions.home', {
        haul: `${copy('dialup.expeditions.haul_item', { count: 2, item: itemLabel('cabbage') })}, ${formatCash(150)}`,
      })
    )
    expect(
      haulLine({ items: {}, cents: 0, hurt: true, damage: 0.2, xp: 1 })
    ).toBe(
      copy('dialup.expeditions.home_hurt', {
        haul: copy('dialup.expeditions.nothing'),
      })
    )
  })

  it('names every run, and says why one was refused', () => {
    expect(expeditionName('ride')).toBe(copy('dialup.expeditions.ride'))
    expect(expeditionName('undercroft')).toBe(
      copy('dialup.expeditions.undercroft')
    )
    const s = asked(applyFrame(DIALED, welcome(), 0, 0), { expedition: true })
    const nack = (re: 'expedition-send' | 'expedition-claim', reason: string) =>
      applyFrame(s, { type: 'nack', re, reason }, 0, 0)
    expect(nack('expedition-send', 'busy').said?.text).toBe(
      copy('dialup.expeditions.busy')
    )
    expect(nack('expedition-send', 'locked').said?.text).toBe(
      copy('dialup.expeditions.locked_refused')
    )
    expect(nack('expedition-send', 'short').said?.text).toBe(
      copy('dialup.expeditions.short_refused')
    )
    expect(nack('expedition-claim', 'out').said?.text).toBe(
      copy('dialup.expeditions.out')
    )
    expect(nack('expedition-claim', 'what').pending.expedition).toBe(false)
    expect(nack('expedition-claim', 'what').said?.text).toBe(
      copy('dialup.expeditions.refused')
    )
  })
})

describe('a dropped line on the phone', () => {
  it('lets every ask go and says the signal is lost', () => {
    let s = applyFrame(DIALED, welcome(), 0, 0)
    s = asked(s, {
      stand: true,
      expedition: true,
      buy: { station: 2, kind: 'water' },
    })
    s = lineLost(s, 50, 1_000)
    expect(s.pending).toEqual(applyFrame(DIALED, welcome(), 0, 0).pending)
    expect(s.said).toEqual({ text: copy('log.signal_lost'), at: 50 })
    expect(s.chat.at(-1)).toMatchObject({
      kind: 'system',
      text: copy('log.signal_lost'),
      at: 1_000,
    })
  })

  it('waits on an ask only while the line is up', () => {
    const s = applyFrame(DIALED, welcome(), 0, 0)
    const up = asking(s, { trade: true }, true, 10)
    expect(up.pending.trade).toBe(true)
    expect(up.said).toBeNull()
    const down = asking(s, { trade: true }, false, 10)
    expect(down.pending.trade).toBe(false)
    expect(down.said).toEqual({ text: copy('dialup.no_signal'), at: 10 })
  })
})

describe("the account's news on the phone", () => {
  const start = (over: Partial<WelcomeMessage> = {}) =>
    applyFrame({ ...DIALED, name: 'Me', outfit: 'player' }, welcome(over), 0, 0)
  const lastLog = (s: DialState) => s.chat.at(-1)?.text

  it('logs a new level, once', () => {
    let s = start({ xp: xpToReach(2) - 1 })
    s = applyFrame(s, { type: 'xp', xp: xpToReach(2), gained: 1 }, 5, 50)
    expect(s.chat.at(-1)).toMatchObject({
      text: copy('log.level_up', { level: 2 }),
      at: 50,
    })
    const lines = s.chat.length
    s = applyFrame(s, { type: 'xp', xp: xpToReach(2) + 1, gained: 1 }, 6, 60)
    expect(s.chat).toHaveLength(lines)
  })

  it("leaves the screen's word to the phone's own asks", () => {
    // Erwin's line for a quest step stays up when the rose's page is
    // written just after it.
    let s = start()
    s = applyFrame(
      s,
      { type: 'quest', quest: 'rose', step: 'accept', stage: 'given' },
      5,
      50
    )
    const said = s.said
    expect(said?.text).toBe(stepNews('accept'))
    s = applyFrame(s, { type: 'book', found: ['rose'] }, 6, 60)
    s = applyFrame(s, { type: 'xp', xp: xpToReach(2), gained: 1 }, 6, 60)
    expect(s.said).toEqual(said)
  })

  it("says the season's and the task's news", () => {
    let s = start()
    const season = { season: SEASON.id, kills: 1, claimed: false }
    s = applyFrame(s, { type: 'season', season, rewarded: false }, 0, 0)
    expect(lastLog(s)).toBe(seasonLine({ kills: 1, claimed: false }, false))
    const task = { task: DAILY_TASK.id, day: 'd', count: 2, claimed: false }
    s = applyFrame(s, { type: 'task', task, rewarded: false }, 0, 0)
    expect(lastLog(s)).toBe(
      taskLine({ day: 'd', count: 2, claimed: false }, false)
    )
  })

  it('says a page written, never twice', () => {
    let s = start()
    s = applyFrame(s, { type: 'book', found: ['keep'] }, 0, 0)
    expect(s.chat.slice(-2).map((l) => l.text)).toEqual(foundLines(['keep']))
    const lines = s.chat.length
    s = applyFrame(s, { type: 'book', found: ['keep'] }, 0, 0)
    expect(s.chat).toHaveLength(lines)
  })

  it('says a Citgo found by its name', () => {
    let s = withCitgoNames(start({ citgos: { last: 0, visited: [0] } }), [
      'Lake Avenue',
      'Route 47',
    ])
    s = applyFrame(
      s,
      { type: 'citgos', citgos: { last: 1, visited: [0, 1] } },
      0,
      0
    )
    expect(lastLog(s)).toBe(copy('log.citgo_visited', { citgo: 'Route 47' }))
  })

  it("says a raider's new name and level, but not our own", () => {
    const peer = {
      id: 'p2',
      name: 'Kid',
      outfit: 'player',
      cosmetics: [],
      level: 3,
      at: null,
    } as const
    let s = start({ peers: [{ ...peer, cosmetics: [] }] })
    s = applyFrame(
      s,
      {
        type: 'peer-updated',
        peer: { ...peer, cosmetics: [], name: 'Ace', level: 4 },
      },
      0,
      0
    )
    expect(s.chat.slice(-2).map((l) => l.text)).toEqual([
      copy('log.peer_renamed', { was: 'Kid', name: 'Ace' }),
      copy('log.peer_level', { name: 'Ace', level: 4 }),
    ])
    const lines = s.chat.length
    s = applyFrame(
      s,
      {
        type: 'peer-updated',
        peer: { ...peer, cosmetics: [], id: 'p1', name: 'Me', level: 9 },
      },
      0,
      0
    )
    expect(s.chat).toHaveLength(lines)
  })

  it('takes on a name and body changed in the 3D valley, and says so', () => {
    const me = {
      id: 'p1',
      name: 'Me',
      outfit: 'player',
      cosmetics: [],
      level: 1,
      at: null,
    } as const
    let s = start()
    s = applyFrame(
      s,
      { type: 'peer-updated', peer: { ...me, cosmetics: [], name: 'Ace' } },
      0,
      10
    )
    expect(s.name).toBe('Ace')
    expect(lastLog(s)).toBe(copy('gron.renamed', { name: 'Ace' }))
    s = applyFrame(
      s,
      {
        type: 'peer-updated',
        peer: { ...me, cosmetics: [], name: 'Ace', outfit: 'gron' },
      },
      0,
      20
    )
    expect(s.outfit).toBe('gron')
    expect(lastLog(s)).toBe(
      copy('gron.became', { name: outfitById('gron').label })
    )
  })

  it('says nothing of the account on its other app', () => {
    // The account in the 3D valley: another peer under our own name.
    const body = {
      id: 'p9',
      name: 'Me',
      outfit: 'player',
      cosmetics: [],
      level: 1,
      at: null,
    } as const
    let s = start({ peers: [{ ...body, cosmetics: [] }] })
    const lines = s.chat.length
    s = applyFrame(
      s,
      { type: 'peer-updated', peer: { ...body, cosmetics: [], level: 2 } },
      0,
      0
    )
    expect(s.chat).toHaveLength(lines)
    expect(s.peers[0].level).toBe(2)
  })

  it('says the valley missed a new name or look', () => {
    const s = applyFrame(
      start(),
      { type: 'nack', re: 'rename', reason: 'gone' },
      0,
      0
    )
    expect(lastLog(s)).toBe(copy('log.change_unheard'))
  })
})

describe('the wards on the phone', () => {
  it("fade from the valley's word as the 3D valley fades them", () => {
    const levels = { high: 0.5, stimulated: 0.2, drunk: 0, tripping: 0 }
    const s = applyFrame(DIALED, { type: 'wards', wards: levels }, 1000, 0)
    expect(wardsNow(s, 1000)).toEqual(levels)
    const later = wardsNow(s, 11_000)
    expect(later).toEqual(levelsAt({ at: 1, levels }, 11))
    expect(later.high).toBeLessThan(levels.high)
  })
})

describe('what an item would do, used on the phone', () => {
  it('raises its ward, lowers the risk of the run that ward guards', () => {
    const s = applyFrame(DIALED, { type: 'wards', wards: NO_WARDS }, 0, 0)
    const impact = useImpact(s, 'four-loko-blue', 0)
    const drunk = impact.wards.find((w) => w.axis === 'drunk')
    expect(drunk?.from).toBe(0)
    expect(drunk?.to).toBeGreaterThan(0)
    const corn = impact.risks.find((r) => r.id === 'corn')
    expect(corn?.from).toBe(riskOf('corn', 0))
    expect(corn?.to).toBe(riskOf('corn', drunk?.to ?? 0))
    expect(corn!.to).toBeLessThan(corn!.from)
    // A run no ward guards is not moved by it.
    expect(impact.risks.some((r) => r.id === 'ride')).toBe(false)
  })

  it('mends geometrie up to whole, and says nothing when whole', () => {
    const hurt = { ...DIALED, health: 500, healthMax: 1000 }
    expect(useImpact(hurt, 'marlboro', 0).health).toEqual({
      from: 500,
      to: 500 + healsOf('marlboro', 1000),
    })
    const whole = { ...DIALED, health: 1000, healthMax: 1000 }
    expect(useImpact(whole, 'marlboro', 0).health).toBeNull()
  })

  it('reads the wards faded to now', () => {
    const levels = { high: 0, stimulated: 0, drunk: 0.6, tripping: 0 }
    const s = applyFrame(DIALED, { type: 'wards', wards: levels }, 0, 0)
    const later = useImpact(s, 'four-loko-blue', 60_000)
    expect(later.wards.find((w) => w.axis === 'drunk')?.from).toBe(
      wardsNow(s, 60_000).drunk
    )
  })
})

describe('what the 3D valley did, in the phone log', () => {
  it('logs something passed, either way', () => {
    let s = applyFrame(DIALED, welcome(), 0, 0)
    s = applyFrame(s, { type: 'passed', kind: 'joints', to: 'Ace' }, 0, 1)
    expect(s.chat.at(-1)?.text).toBe(
      copy('log.passed', { item: itemLabel('joints'), name: 'Ace' })
    )
    s = applyFrame(s, { type: 'passed', kind: 'joints', from: 'Kid' }, 0, 2)
    expect(s.chat.at(-1)?.text).toBe(
      copy('log.passed_you', { item: itemLabel('joints'), name: 'Kid' })
    )
  })

  it("keeps the stand's news in the log, and on the screen only when asked", () => {
    const line = copy('log.stand_collected', { amount: '$2.50' })
    const frame = {
      type: 'stand',
      re: 'collect',
      stand: FRESH_STAND,
      cents: 250,
    } as const
    const elsewhere = applyFrame(
      applyFrame(DIALED, welcome(), 0, 0),
      frame,
      5,
      5
    )
    expect(elsewhere.said).toBeNull()
    expect(elsewhere.chat.at(-1)?.text).toBe(line)
    const asked_ = applyFrame(
      asked(applyFrame(DIALED, welcome(), 0, 0), { stand: true }),
      frame,
      5,
      5
    )
    expect(asked_.said?.text).toBe(line)
    expect(asked_.chat.at(-1)?.text).toBe(line)
  })

  it("words Moab's refusal for the offer the phone made", () => {
    let s = asked(applyFrame(DIALED, welcome(), 0, 0), {
      trade: true,
      tradeOffer: 'flaming-halo',
    })
    s = applyFrame(s, { type: 'nack', re: 'trade', reason: 'owned' }, 0, 0)
    expect(s.pending.tradeOffer).toBeNull()
    expect(s.chat.at(-1)?.text).toBe(tradeRefusal('owned', 'flaming-halo'))
  })
})
