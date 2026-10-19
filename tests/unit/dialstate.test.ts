import { describe, expect, it } from 'vitest'
import { copy } from '../../src/copy.ts'
import { applyFrame, asked, DIALED, NO_WARDS } from '../../src/dialstate.ts'
import { FRESH_STAND, refusalLine } from '../../src/stand.ts'
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
  geometrie: { ...NO_WARDS, high: 0.5 },
  citgos: { last: null, visited: [] },
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
      welcome({ stand: 'x' as never, geometrie: 'y' as never }),
      0
    )
    expect(s.stand).toBeNull()
    expect(s.wards).toEqual(NO_WARDS)
  })

  it("takes the pack frame as the locker's answer", () => {
    let s = asked(applyFrame(DIALED, welcome(), 0), 'locker')
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
    let s = asked(applyFrame(DIALED, welcome(), 0), 'stand')
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
      asked(s, 'stand'),
      { type: 'nack', re: 'stand-collect', reason: 'empty' },
      7
    )
    expect(s.said).toEqual({ text: refusalLine('empty'), at: 7 })
    s = applyFrame(
      asked(s, 'locker'),
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
    s = applyFrame(
      s,
      { type: 'geometrie', geometrie: { ...NO_WARDS, drunk: 1 } },
      0
    )
    expect(s.wards.drunk).toBe(1)
    expect(
      applyFrame(s, { type: 'geometrie', geometrie: 'x' as never }, 0)
    ).toBe(s)
    const world = { day: 'd' } as never
    s = applyFrame(s, { type: 'world', reason: 'joined', world }, 0)
    expect(s.world).toBe(world)
    expect(
      applyFrame(s, { type: 'world', reason: 'joined', world: null }, 0).world
    ).toBe(world)
    expect(applyFrame(s, { type: 'pong', t: 0, serverNow: 0 }, 0)).toBe(s)
  })
})
