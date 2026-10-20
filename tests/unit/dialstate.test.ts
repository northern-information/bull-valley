import { describe, expect, it } from 'vitest'
import { BOOK } from '../../src/book.ts'
import { copy } from '../../src/copy.ts'
import { DAILY_TASK } from '../../src/dailytask.ts'
import { dealRefusal } from '../../src/dealer.ts'
import {
  applyFrame,
  asked,
  DIALED,
  expeditionName,
  haulLine,
  NO_WARDS,
  raiderStats,
  sayLine,
  shelfOf,
} from '../../src/dialstate.ts'
import { itemLabel, itemLine } from '../../src/itemcopy.ts'
import { itemById } from '../../src/items.ts'
import { stepNews, stepRefusal } from '../../src/quests.ts'
import { SEASON } from '../../src/season.ts'
import { FRESH_STAND, refusalLine } from '../../src/stand.ts'
import { formatCash } from '../../src/store.ts'
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
  season: { season: 's1', kills: 0, claimed: false },
  book: [],
  task: { task: 't', day: 'd', count: 0, claimed: false },
  xp: 120,
  stand: FRESH_STAND,
  quests: { rose: 'none' },
  health: 900,
  healthMax: 1000,
  wards: { ...NO_WARDS, high: 0.5 },
  citgos: { last: null, visited: [] },
  expedition: null,
  ...over,
})

describe("Dial-Up's state", () => {
  it('takes the welcome whole', () => {
    const s = applyFrame(DIALED, welcome(), 0)
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
      0
    )
    expect(s.stand).toBeNull()
    expect(s.wards).toEqual(NO_WARDS)
  })

  it("takes the pack frame as the locker's answer", () => {
    let s = asked(applyFrame(DIALED, welcome(), 0), { locker: true })
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
      0
    )
    expect(s.stash).toMatchObject({ marlboro: 20, joints: 1 })
    expect(s.pending.locker).toBe(false)
  })

  it("says what the stand's frame and its refusals say", () => {
    let s = asked(applyFrame(DIALED, welcome(), 0), { stand: true })
    s = applyFrame(
      s,
      { type: 'stand', re: 'collect', stand: FRESH_STAND, cents: 250 },
      5
    )
    expect(s.pending.stand).toBe(false)
    expect(s.said).toEqual({
      text: copy('log.stand_collected', { amount: '$2.50' }),
      at: 5,
    })
    s = applyFrame(s, { type: 'stand', re: 'collect', stand: 'x' as never }, 6)
    expect(s.said?.at).toBe(5)
    s = applyFrame(
      asked(s, { stand: true }),
      { type: 'nack', re: 'stand-collect', reason: 'empty' },
      7
    )
    expect(s.said).toEqual({ text: refusalLine('empty'), at: 7 })
    s = applyFrame(
      asked(s, { locker: true }),
      { type: 'nack', re: 'stow', reason: 'x' },
      8
    )
    expect(s.said).toEqual({ text: copy('log.locker_refused'), at: 8 })
    expect(s.pending.locker).toBe(false)
    // Another refusal says nothing here.
    expect(
      applyFrame(s, { type: 'nack', re: 'use', reason: 'dialup' }, 9)
    ).toBe(s)
  })

  it('follows the XP up, geometrie, the wards and the world', () => {
    let s = applyFrame(DIALED, welcome(), 0)
    s = applyFrame(s, { type: 'xp', xp: 150, gained: 30 }, 0)
    expect(s.xp).toBe(150)
    // Two grants out of order never take XP back.
    expect(applyFrame(s, { type: 'xp', xp: 140, gained: 20 }, 0).xp).toBe(150)
    s = applyFrame(s, { type: 'health', health: 1000, max: 1040 }, 0)
    expect([s.health, s.healthMax]).toEqual([1000, 1040])
    s = applyFrame(s, { type: 'wards', wards: { ...NO_WARDS, drunk: 1 } }, 0)
    expect(s.wards.drunk).toBe(1)
    expect(applyFrame(s, { type: 'wards', wards: 'x' as never }, 0)).toBe(s)
    const world = { day: 'd' } as never
    s = applyFrame(s, { type: 'world', reason: 'joined', world }, 0)
    expect(s.world).toBe(world)
    expect(
      applyFrame(s, { type: 'world', reason: 'joined', world: null }, 0).world
    ).toBe(world)
    expect(applyFrame(s, { type: 'pong', t: 0, serverNow: 0 }, 0)).toBe(s)
  })

  it('keeps the season, the task, the book and the Citgos', () => {
    let s = applyFrame(DIALED, welcome({ book: ['citgo'] }), 0)
    expect(s.season).toEqual({ kills: 0, claimed: false })
    expect(s.task).toEqual({ day: 'd', count: 0, claimed: false })
    expect(s.book).toEqual(['citgo'])
    s = applyFrame(
      s,
      {
        type: 'season',
        season: { season: 's1', kills: 2, claimed: false },
        rewarded: false,
      },
      0
    )
    expect(s.season.kills).toBe(2)
    s = applyFrame(
      s,
      {
        type: 'task',
        task: { task: 't', day: 'e', count: 3, claimed: false },
        rewarded: false,
      },
      0
    )
    expect(s.task).toEqual({ day: 'e', count: 3, claimed: false })
    // A page already written is never written twice.
    s = applyFrame(s, { type: 'book', found: ['citgo', 'shadowman'] }, 0)
    expect(s.book).toEqual(['citgo', 'shadowman'])
    s = applyFrame(
      s,
      { type: 'citgos', citgos: { last: 4, visited: [0, 4] } },
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
      ...applyFrame(DIALED, welcome({ xp: 0 }), 0),
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
    applyFrame(DIALED, welcome(over), 0)
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
      6
    )
    expect(other.said).toBe(s.said)
    const nack = (reason: string) =>
      applyFrame(
        s,
        { type: 'nack', re: 'buy', reason, station: 0, item: 'marlboro' },
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
      0
    )
    expect(s.pending.deal).toBe(false)
    expect(s.said?.text).toBe(copy('dealer.bought', { item: itemLabel('lsd') }))
    s = applyFrame(s, { type: 'nack', re: 'deal', reason: 'sold-out' }, 0)
    expect(s.said?.text).toBe(dealRefusal('sold-out'))
    s = applyFrame(
      s,
      { type: 'quest', quest: 'rose', step: 'accept', stage: 'given' },
      0
    )
    expect(s.quests.rose).toBe('given')
    expect(s.said?.text).toBe(stepNews('accept'))
    expect(
      applyFrame(
        s,
        { type: 'quest', quest: 'x', step: 'accept', stage: 'given' } as never,
        0
      )
    ).toBe(s)
    s = applyFrame(s, { type: 'nack', re: 'quest', reason: 'too-far' }, 0)
    expect(s.said?.text).toBe(stepRefusal('too-far'))
    s = asked(s, { trade: true })
    s = applyFrame(s, { type: 'nack', re: 'trade', reason: 'short' }, 0)
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
      0
    )
    expect(s.peers.map((p) => p.name)).toEqual(['Kid'])
    expect(s.chat.at(-1)?.text).toBe(copy('log.peer_joined', { name: 'Kid' }))
    s = applyFrame(
      s,
      { type: 'peer-updated', peer: { ...peer, cosmetics: [], level: 4 } },
      0
    )
    expect(s.peers[0].level).toBe(4)
    s = applyFrame(
      s,
      { type: 'chat', id: 'p2', name: 'Kid', text: 'yo', at: 9 },
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
      0
    )
    expect(s.chat.at(-1)?.name).toBe(copy('chat.whisper_from', { name: 'Kid' }))
    s = applyFrame(s, { type: 'peer-left', id: 'p2' }, 0)
    expect(s.peers).toEqual([])
    expect(s.chat.at(-1)?.text).toBe(copy('log.peer_left', { name: 'Kid' }))
    expect(applyFrame(s, { type: 'peer-left', id: 'zz' }, 0).chat).toBe(s.chat)
    s = applyFrame(s, { type: 'nack', re: 'chat', reason: 'too-fast' }, 0)
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
      0
    )
    expect(after.pending.ask).toBeNull()
    expect(after.said?.text).toBe(copy('friends.sent', { name: 'Kid' }))
    after = applyFrame(friends.state, { type: 'friends', friends: [] }, 0)
    expect(after.chat.at(-1)?.text).toBe(copy('friends.none'))
    after = applyFrame(
      after,
      { type: 'friend-news', news: 'asked', name: 'Kid' },
      0
    )
    expect(after.chat.at(-1)?.text).toBe(
      copy('friends.news_asked', { name: 'Kid' })
    )
    expect(
      applyFrame(
        whisper.state,
        { type: 'nack', re: 'whisper', reason: 'not-here' },
        0
      ).said?.text
    ).toBe(copy('chat.whisper_not_here', { name: 'Kid' }))
    expect(
      applyFrame(
        asking.state,
        { type: 'nack', re: 'friend', reason: 'self' },
        0
      ).said?.text
    ).toBe(copy('friends.self'))
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
    let s = applyFrame(DIALED, welcome({ expedition: run }), 0)
    expect(s.expedition).toEqual(run)
    expect(
      applyFrame(DIALED, welcome({ expedition: 'x' as never }), 0).expedition
    ).toBeNull()
    s = asked({ ...s, expedition: null }, { expedition: true })
    s = applyFrame(s, { type: 'expedition', run }, 0)
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
    s = applyFrame(s, { type: 'expedition', run: null, outcome }, 0)
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
    const s = asked(applyFrame(DIALED, welcome(), 0), { expedition: true })
    const nack = (re: 'expedition-send' | 'expedition-claim', reason: string) =>
      applyFrame(s, { type: 'nack', re, reason }, 0)
    expect(nack('expedition-send', 'busy').said?.text).toBe(
      copy('dialup.expeditions.busy')
    )
    expect(nack('expedition-send', 'locked').said?.text).toBe(
      copy('dialup.expeditions.locked_refused')
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
