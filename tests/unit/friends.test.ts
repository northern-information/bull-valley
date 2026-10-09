import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import {
  askOutcome,
  friendLines,
  friendNews,
  friendRefusal,
  sameName,
  settledAsk,
  whereabouts,
  whisperRefusal,
} from '../../src/friends.ts'
import { mazeToWorld } from '../../src/maze.ts'
import type { FriendWire, PeerStateWire } from '../../src/protocol.ts'

const at = (x: number, z: number, riding = false): PeerStateWire => ({
  x,
  y: 0,
  z,
  yaw: 0,
  pitch: 0,
  pose: 'stand',
  riding,
  light: false,
})

const friend = (over: Partial<FriendWire> = {}): FriendWire => ({
  name: 'Baker',
  state: 'friend',
  online: true,
  where: 'valley',
  ...over,
})

describe('asking to be friends', () => {
  it('comes to a request, an acceptance, or nothing new', () => {
    expect(askOutcome(null, false)).toBe('requested')
    expect(askOutcome('asking', false)).toBe('accepted')
    expect(askOutcome('asked', false)).toBe('already-asked')
    expect(askOutcome('friend', false)).toBe('already-friends')
    expect(askOutcome(null, true)).toBe('self')
  })

  it('finds a name in any case', () => {
    expect(sameName('Baker', 'baker')).toBe(true)
    expect(sameName('Baker', 'Bakers')).toBe(false)
  })
})

describe('whereabouts', () => {
  const maze = { x: 1000, z: 1000, yaw: 0.3 }
  const world = { havens: [{ x: 0, z: 0 }], maze }

  it('says riding, in the maze, by a Citgo, or out in the valley', () => {
    expect(whereabouts(null, world)).toBeNull()
    expect(whereabouts(at(0, 0, true), world)).toBe('riding')
    const inside = mazeToWorld(maze, { x: 10, z: 10 })
    expect(whereabouts(at(inside.x, inside.z), world)).toBe('maze')
    expect(whereabouts(at(10, 10), world)).toBe('citgo')
    const r = CONFIG.shadowmen.havenRadius
    expect(whereabouts(at(r + 1, 0), world)).toBe('valley')
    expect(whereabouts(at(r + 1, 0), null)).toBe('valley')
  })
})

describe('the friends list in the log', () => {
  it('says there is no one yet', () => {
    expect(friendLines([])).toEqual([copy('friends.none')])
  })

  it('puts friends in the valley first, then away, then requests', () => {
    const lines = friendLines([
      friend({ name: 'Zed', state: 'asked', online: false, where: null }),
      friend({ name: 'yul', online: false, where: null }),
      friend({ name: 'Xan', state: 'asking', online: false, where: null }),
      friend({ name: 'baker', where: 'maze' }),
      friend({ name: 'Able', where: null }),
    ])
    expect(lines).toEqual([
      copy('friends.online', {
        name: 'Able',
        where: copy('friends.where_valley'),
      }),
      copy('friends.online', {
        name: 'baker',
        where: copy('friends.where_maze'),
      }),
      copy('friends.offline', { name: 'yul' }),
      copy('friends.asking', { name: 'Xan' }),
      copy('friends.asked', { name: 'Zed' }),
    ])
  })

  it('names every whereabouts', () => {
    for (const where of ['riding', 'maze', 'citgo', 'valley'] as const) {
      expect(friendLines([friend({ where })])[0]).toBe(
        copy('friends.online', {
          name: 'Baker',
          where: copy(`friends.where_${where}`),
        })
      )
    }
  })
})

describe("the valley's answers", () => {
  it('settles a pending ask from the list', () => {
    const ask = { op: 'friend' as const, name: 'baker' }
    expect(settledAsk(ask, [])).toBeNull()
    expect(settledAsk(ask, [friend({ state: 'asked' })])).toBe(
      copy('friends.sent', { name: 'Baker' })
    )
    expect(settledAsk(ask, [friend()])).toBe(
      copy('friends.now', { name: 'Baker' })
    )
    const off = { op: 'unfriend' as const, name: 'Baker' }
    expect(settledAsk(off, [friend()])).toBeNull()
    expect(settledAsk(off, [])).toBe(copy('friends.removed', { name: 'Baker' }))
  })

  it('says why a friends change was refused', () => {
    const cases: [string, string][] = [
      ['unknown', copy('friends.unknown', { name: 'Baker' })],
      ['self', copy('friends.self')],
      ['already-friends', copy('friends.already_friends', { name: 'Baker' })],
      ['already-asked', copy('friends.already_asked', { name: 'Baker' })],
      ['full', copy('friends.full')],
      ['not-friends', copy('friends.not_friends', { name: 'Baker' })],
      ['too-fast', copy('chat.too_fast')],
      ['server', copy('friends.failed')],
    ]
    for (const [reason, line] of cases) {
      expect(friendRefusal(reason, 'Baker')).toBe(line)
    }
  })

  it('says why a whisper was refused', () => {
    expect(whisperRefusal('not-here', 'Baker')).toBe(
      copy('chat.whisper_not_here', { name: 'Baker' })
    )
    expect(whisperRefusal('self', 'Baker')).toBe(copy('chat.whisper_self'))
    expect(whisperRefusal('too-fast', 'Baker')).toBe(copy('chat.too_fast'))
  })

  it('says the news', () => {
    expect(friendNews('asked', 'Baker')).toBe(
      copy('friends.news_asked', { name: 'Baker' })
    )
    expect(friendNews('accepted', 'Baker')).toBe(
      copy('friends.news_accepted', { name: 'Baker' })
    )
    expect(friendNews('online', 'Baker')).toBe(
      copy('friends.news_online', { name: 'Baker' })
    )
  })
})
