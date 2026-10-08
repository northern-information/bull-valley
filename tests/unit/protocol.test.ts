import { describe, expect, it } from 'vitest'
import {
  CHAT_MAX,
  CLOSE,
  DISCOVER_MAX,
  isValidChat,
  isValidName,
  MAX_COORD,
  NAME_MAX,
  normalizeChat,
  normalizeName,
  parseClientMessage,
  parsePeerState,
  parseServerMessage,
  PEER_POSES,
  PICKUPS_MAX,
  PROTOCOL_VERSION,
} from '../../src/protocol.ts'
import { dryMap } from '../../src/waterside.ts'

const state = {
  x: 1.5,
  y: 0.25,
  z: -2,
  yaw: 0.3,
  pitch: -0.2,
  pose: 'walk',
  riding: false,
  light: true,
}
const hello = {
  type: 'hello',
  v: PROTOCOL_VERSION,
  outfit: 'coleman',
  pickups: [
    { kind: 'marlboro', count: 3 },
    { kind: 'cabbage', count: 1 },
  ],
  stations: 5,
  havens: [0, 1, 2, 3, 4].map((i) => ({ x: i * 100, z: i })),
  metres: { width: 15059, height: 15038 },
  water: dryMap({ width: 15059, height: 15038 }),
  maze: { x: 120, z: -40, yaw: 0.5 },
  truck: { home: { x: 10, z: -20 }, joyrideMs: 600_000 },
}

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value))

describe('names', () => {
  it('normalizes to composed, single-spaced, trimmed text', () => {
    expect(normalizeName('  David   Coleman ')).toBe('David Coleman')
    expect(normalizeName('é')).toBe('é')
    expect(normalizeName('a\u0000b​c')).toBe('abc')
    expect(normalizeName('\t\n')).toBe('')
  })

  it('does not clamp the length', () => {
    const long = 'x'.repeat(NAME_MAX + 5)
    expect(normalizeName(long)).toBe(long)
  })

  it('accepts one to sixteen code points of normalized text', () => {
    expect(isValidName('M')).toBe(true)
    expect(isValidName('x'.repeat(NAME_MAX))).toBe(true)
    expect(isValidName('é'.repeat(NAME_MAX))).toBe(true)
    expect(isValidName('x'.repeat(NAME_MAX + 1))).toBe(false)
    expect(isValidName('')).toBe(false)
    expect(isValidName(' padded')).toBe(false)
    expect(isValidName('two  spaces')).toBe(false)
    expect(isValidName('ctrl\u0007')).toBe(false)
    expect(isValidName(null)).toBe(false)
    expect(isValidName(42)).toBe(false)
  })
})

describe('outfits and poses', () => {
  it('has no seated pose yet', () => {
    expect(PEER_POSES).toEqual(['stand', 'walk', 'crouch'])
  })
})

describe('parsePeerState', () => {
  it('accepts a complete state', () => {
    expect(parsePeerState(state)).toEqual(state)
  })

  it('rejects anything off the survey or not a number', () => {
    expect(parsePeerState({ ...state, x: NaN })).toBeNull()
    expect(parsePeerState({ ...state, y: Infinity })).toBeNull()
    expect(parsePeerState({ ...state, z: MAX_COORD + 1 })).toBeNull()
    expect(parsePeerState({ ...state, x: '1' })).toBeNull()
    expect(parsePeerState({ ...state, yaw: NaN })).toBeNull()
  })

  it('rejects unknown poses and non-boolean riding', () => {
    expect(parsePeerState({ ...state, pose: 'fly' })).toBeNull()
    expect(parsePeerState({ ...state, riding: 'yes' })).toBeNull()
    expect(parsePeerState({ ...state, light: 1 })).toBeNull()
    expect(parsePeerState({ ...state, pitch: 2 })).toBeNull()
    expect(parsePeerState({ ...state, pitch: NaN })).toBeNull()
    expect(parsePeerState({ ...state, light: undefined })).toBeNull()
    expect(parsePeerState(null)).toBeNull()
    expect(parsePeerState('state')).toBeNull()
  })
})

describe('chat', () => {
  it('normalizes like a name', () => {
    expect(normalizeChat('  hello   valley\n')).toBe('hello valley')
    expect(normalizeChat('a\u0000b​c')).toBe('abc')
    expect(normalizeChat(' \t ')).toBe('')
  })

  it('accepts one to CHAT_MAX code points of normalized text', () => {
    expect(isValidChat('hi')).toBe(true)
    expect(isValidChat('x'.repeat(CHAT_MAX))).toBe(true)
    expect(isValidChat('é'.repeat(CHAT_MAX))).toBe(true)
    expect(isValidChat('x'.repeat(CHAT_MAX + 1))).toBe(false)
    expect(isValidChat('')).toBe(false)
    expect(isValidChat(' padded')).toBe(false)
    expect(isValidChat('bell\u0007')).toBe(false)
    expect(isValidChat(7)).toBe(false)
  })

  it('parses a chat frame and refuses a bad one', () => {
    expect(parse({ type: 'chat', text: 'hi', extra: 1 })).toEqual({
      type: 'chat',
      text: 'hi',
    })
    expect(parse({ type: 'chat', text: '' })).toBeNull()
    expect(parse({ type: 'chat', text: 'x'.repeat(CHAT_MAX + 1) })).toBeNull()
    expect(parse({ type: 'chat', text: '  unnormalized ' })).toBeNull()
    expect(parse({ type: 'chat' })).toBeNull()
  })
})

describe('parseClientMessage', () => {
  it('parses hello, state and ping', () => {
    expect(parse(hello)).toEqual(hello)
    expect(parse({ type: 'state', ...state })).toEqual({
      type: 'state',
      ...state,
    })
    expect(parse({ type: 'ping', t: 12.5 })).toEqual({ type: 'ping', t: 12.5 })
  })

  it('lets the server judge a bad outfit in a hello', () => {
    const judged = parse({ ...hello, outfit: 'tuxedo' })
    expect(judged?.type).toBe('hello')
  })

  it("ignores an older build's name, so its stale version is what is judged", () => {
    expect(parse({ ...hello, v: 3, name: 'Dave' })).toEqual({ ...hello, v: 3 })
    expect(parse({ ...hello, name: 7 })).toEqual(hello)
  })

  it("parses an older build's hello without havens, metres or a maze, with empty defaults", () => {
    const {
      havens: _havens,
      metres: _metres,
      water: _water,
      maze: _maze,
      truck: _truck,
      ...older
    } = hello
    expect(parse({ ...older, v: PROTOCOL_VERSION - 1 })).toEqual({
      ...older,
      v: PROTOCOL_VERSION - 1,
      havens: [],
      metres: { width: 0, height: 0 },
      water: { cell: 100, cols: 1, rows: 1, bits: 'AA==' },
      maze: null,
      truck: { home: { x: 0, z: 0 }, joyrideMs: 0 },
    })
    // Bad ones read as missing in an older build, too.
    expect(
      parse({
        ...hello,
        v: PROTOCOL_VERSION - 1,
        havens: 1,
        metres: 'big',
        maze: 'corn',
        truck: 'chevy',
      })
    ).toEqual({
      ...older,
      v: PROTOCOL_VERSION - 1,
      havens: [],
      metres: { width: 0, height: 0 },
      // A good map parses whatever the version.
      water: hello.water,
      maze: null,
      truck: { home: { x: 0, z: 0 }, joyrideMs: 0 },
    })
    // The current version still requires both.
    expect(parse({ ...older, v: PROTOCOL_VERSION })).toBeNull()
  })

  it('parses the dev frame that places a shadowman', () => {
    expect(parse({ type: 'dev', op: 'shadowman', x: 1, z: -2 })).toEqual({
      type: 'dev',
      op: 'shadowman',
      x: 1,
      z: -2,
    })
    expect(parse({ type: 'dev', op: 'shadowman', x: 1 })).toBeNull()
    // A spider when it says so, and only for true.
    expect(
      parse({ type: 'dev', op: 'shadowman', x: 1, z: -2, spider: true })
    ).toEqual({ type: 'dev', op: 'shadowman', x: 1, z: -2, spider: true })
    expect(
      parse({ type: 'dev', op: 'shadowman', x: 1, z: -2, spider: 'yes' })
    ).toEqual({ type: 'dev', op: 'shadowman', x: 1, z: -2 })
    expect(parse({ type: 'dev', op: 'calm' })).toEqual({
      type: 'dev',
      op: 'calm',
    })
    expect(parse({ type: 'dev', op: 'caretaker', x: 1, z: -2 })).toEqual({
      type: 'dev',
      op: 'caretaker',
      x: 1,
      z: -2,
    })
  })

  it('parses a discover frame, leaving which entries are real to the valley', () => {
    expect(parse({ type: 'discover', entries: ['citgo', 'nowhere'] })).toEqual({
      type: 'discover',
      entries: ['citgo', 'nowhere'],
    })
    expect(parse({ type: 'discover', entries: [] })).toBeNull()
    expect(parse({ type: 'discover', entries: 'citgo' })).toBeNull()
    expect(parse({ type: 'discover', entries: ['citgo', 3] })).toBeNull()
    expect(parse({ type: 'discover', entries: [''] })).toBeNull()
    expect(
      parse({
        type: 'discover',
        entries: Array.from({ length: DISCOVER_MAX + 1 }, () => 'citgo'),
      })
    ).toBeNull()
  })

  it('parses the raid frames', () => {
    for (const type of ['board', 'hop-out', 'rename']) {
      expect(parse({ type })).toEqual({ type })
    }
    // A collect names its bush.
    expect(parse({ type: 'collect', bush: 3 })).toEqual({
      type: 'collect',
      bush: 3,
    })
    expect(parse({ type: 'collect' })).toBeNull()
    expect(parse({ type: 'collect', bush: -1 })).toBeNull()
    expect(parse({ type: 'collect', bush: 'big one' })).toBeNull()
    // A rename names nothing; anything it carries is dropped.
    expect(parse({ type: 'rename', name: 'Mallory' })).toEqual({
      type: 'rename',
    })
    expect(parse({ type: 'appearance', outfit: 'church' })).toEqual({
      type: 'appearance',
      outfit: 'church',
    })
    // A bad id parses, so the server can say which check it failed.
    expect(parse({ type: 'appearance', outfit: 'tuxedo' })?.type).toBe(
      'appearance'
    )
    expect(parse({ type: 'use', kind: 'joints' })).toEqual({
      type: 'use',
      kind: 'joints',
    })
    expect(parse({ type: 'drop', kind: 'cabbage', count: 2 })).toEqual({
      type: 'drop',
      kind: 'cabbage',
      count: 2,
    })
    expect(parse({ type: 'take-drop', drop: 4 })).toEqual({
      type: 'take-drop',
      drop: 4,
    })
    expect(parse({ type: 'loot', corpse: 2, extra: 1 })).toEqual({
      type: 'loot',
      corpse: 2,
    })
    expect(parse({ type: 'stow', kind: 'joints', count: 2 })).toEqual({
      type: 'stow',
      kind: 'joints',
      count: 2,
    })
    expect(parse({ type: 'unstow', kind: 'joints', count: 1 })).toEqual({
      type: 'unstow',
      kind: 'joints',
      count: 1,
    })
    expect(parse({ type: 'trade', offer: 'flaming-halo', extra: 1 })).toEqual({
      type: 'trade',
      offer: 'flaming-halo',
    })
    expect(
      parse({ type: 'dev', op: 'grant', kind: 'gold-bullion', count: 2 })
    ).toEqual({ type: 'dev', op: 'grant', kind: 'gold-bullion', count: 2 })
    expect(parse({ type: 'buy', station: 2, kind: 'pbr', unit: 1 })).toEqual({
      type: 'buy',
      station: 2,
      kind: 'pbr',
      unit: 1,
    })
    expect(parse({ type: 'take', index: 3 })).toEqual({
      type: 'take',
      index: 3,
    })
    expect(
      parse({
        type: 'call',
        from: { x: 1, z: 2, extra: true },
        to: { x: 3, z: 4 },
      })
    ).toEqual({ type: 'call', from: { x: 1, z: 2 }, to: { x: 3, z: 4 } })
    expect(parse({ type: 'dev', op: 'hurry', seconds: 2 })).toEqual({
      type: 'dev',
      op: 'hurry',
      seconds: 2,
    })
    expect(parse({ type: 'dev', op: 'reset' })).toEqual({
      type: 'dev',
      op: 'reset',
    })
  })

  it('rejects malformed raid frames', () => {
    expect(parse({ type: 'take', index: -1 })).toBeNull()
    expect(parse({ type: 'take', index: 1.5 })).toBeNull()
    expect(parse({ type: 'take' })).toBeNull()
    expect(parse({ type: 'buy', station: -1, kind: 'pbr', unit: 0 })).toBeNull()
    expect(
      parse({ type: 'buy', station: 1.5, kind: 'pbr', unit: 0 })
    ).toBeNull()
    expect(parse({ type: 'buy', station: 1, kind: '', unit: 0 })).toBeNull()
    expect(parse({ type: 'buy', station: 1, kind: 7, unit: 0 })).toBeNull()
    expect(parse({ type: 'buy', station: 1, unit: 0 })).toBeNull()
    expect(parse({ type: 'buy', station: 1, kind: 'pbr' })).toBeNull()
    expect(parse({ type: 'buy', station: 1, kind: 'pbr', unit: -1 })).toBeNull()
    expect(parse({ type: 'use', kind: '' })).toBeNull()
    expect(parse({ type: 'use', kind: 7 })).toBeNull()
    expect(parse({ type: 'use' })).toBeNull()
    expect(parse({ type: 'drop', kind: 'joints', count: 0 })).toBeNull()
    expect(parse({ type: 'drop', kind: 'joints', count: 1.5 })).toBeNull()
    expect(parse({ type: 'drop', kind: '', count: 1 })).toBeNull()
    expect(parse({ type: 'take-drop', drop: -1 })).toBeNull()
    expect(parse({ type: 'take-drop' })).toBeNull()
    expect(parse({ type: 'loot', corpse: -1 })).toBeNull()
    expect(parse({ type: 'loot', corpse: 'mine' })).toBeNull()
    expect(parse({ type: 'stow', kind: 'joints', count: 0 })).toBeNull()
    expect(parse({ type: 'unstow', kind: '', count: 1 })).toBeNull()
    expect(parse({ type: 'stow', kind: 'joints' })).toBeNull()
    expect(parse({ type: 'trade', offer: '' })).toBeNull()
    expect(parse({ type: 'trade' })).toBeNull()
    expect(parse({ type: 'dev', op: 'grant', kind: 'gold-bullion' })).toBeNull()
    expect(
      parse({ type: 'dev', op: 'grant', kind: 'gold-bullion', count: 0 })
    ).toBeNull()
    expect(parse({ type: 'dev', op: 'grant', kind: '', count: 1 })).toBeNull()
    expect(
      parse({ type: 'call', from: { x: 1 }, to: { x: 3, z: 4 } })
    ).toBeNull()
    expect(
      parse({
        type: 'call',
        from: { x: 1, z: 2 },
        to: { x: MAX_COORD + 1, z: 4 },
      })
    ).toBeNull()
    // Gone with the raid.
    expect(parse({ type: 'extract', kind: 'keep' })).toBeNull()
    expect(parse({ type: 'unboard' })).toBeNull()
    expect(parse({ type: 'dev', op: 'hurry' })).toBeNull()
    expect(parse({ type: 'dev', op: 'hurry', seconds: NaN })).toBeNull()
    expect(parse({ type: 'dev', op: 'explode' })).toBeNull()
    expect(parse({ type: 'appearance' })).toBeNull()
    expect(parse({ type: 'appearance', outfit: 3 })).toBeNull()
  })

  it('returns null for anything malformed', () => {
    expect(parseClientMessage('not json')).toBeNull()
    expect(parseClientMessage('42')).toBeNull()
    expect(parseClientMessage('null')).toBeNull()
    expect(parse({ type: 'dance' })).toBeNull()
    expect(parse({ type: 'hello', v: '1' })).toBeNull()
    expect(parse({ ...hello, v: 1.5 })).toBeNull()
    expect(parse({ ...hello, outfit: 7 })).toBeNull()
    expect(parse({ ...hello, pickups: undefined })).toBeNull()
    expect(parse({ ...hello, pickups: 70 })).toBeNull()
    expect(parse({ ...hello, pickups: [{ kind: 'joints' }] })).toBeNull()
    expect(parse({ ...hello, pickups: [{ kind: '', count: 1 }] })).toBeNull()
    expect(
      parse({ ...hello, pickups: [{ kind: 'joints', count: 1.5 }] })
    ).toBeNull()
    expect(parse({ ...hello, pickups: [null] })).toBeNull()
    expect(
      parse({
        ...hello,
        pickups: Array.from({ length: PICKUPS_MAX + 1 }, () => ({
          kind: 'cabbage',
          count: 1,
        })),
      })
    ).toBeNull()
    expect(parse({ ...hello, stations: undefined })).toBeNull()
    expect(parse({ ...hello, stations: -1 })).toBeNull()
    // One haven per station, each a place in the valley; a survey size.
    expect(parse({ ...hello, havens: undefined })).toBeNull()
    // Where the truck parks, and a joyride no longer than a day.
    expect(parse({ ...hello, truck: undefined })).toBeNull()
    expect(
      parse({ ...hello, truck: { home: { x: 1, z: 1 }, joyrideMs: -1 } })
    ).toBeNull()
    expect(
      parse({
        ...hello,
        truck: { home: { x: 1, z: 1 }, joyrideMs: 25 * 3600 * 1000 },
      })
    ).toBeNull()
    expect(
      parse({ ...hello, truck: { home: 'citgo', joyrideMs: 1 } })
    ).toBeNull()
    expect(
      parse({ ...hello, truck: { home: { x: 1, z: 1 }, joyrideMs: 'long' } })
    ).toBeNull()
    expect(parse({ ...hello, havens: hello.havens.slice(1) })).toBeNull()
    expect(
      parse({ ...hello, havens: [...hello.havens.slice(1), 'pumps'] })
    ).toBeNull()
    // Where the maze lies, or null for a build without one.
    expect(parse({ ...hello, maze: null })).toEqual({ ...hello, maze: null })
    expect(parse({ ...hello, maze: undefined })).toBeNull()
    expect(parse({ ...hello, maze: { x: 1, z: 2 } })).toBeNull()
    expect(parse({ ...hello, maze: { x: 1, z: 2, yaw: 'east' } })).toBeNull()
    expect(parse({ ...hello, metres: undefined })).toBeNull()
    expect(parse({ ...hello, metres: { width: 0, height: 10 } })).toBeNull()
    expect(
      parse({ ...hello, metres: { width: 10, height: 'tall' } })
    ).toBeNull()
    expect(parse({ type: 'state', ...state, x: NaN })).toBeNull()
    expect(parse({ type: 'ping', t: 'now' })).toBeNull()
  })
})

describe('parseServerMessage', () => {
  it('passes typed frames through and drops garbage', () => {
    expect(
      parseServerMessage(JSON.stringify({ type: 'peer-left', id: 'a' }))
    ).toEqual({ type: 'peer-left', id: 'a' })
    expect(parseServerMessage('{')).toBeNull()
    expect(parseServerMessage('[]')).toBeNull()
    expect(parseServerMessage(JSON.stringify({ id: 'a' }))).toBeNull()
  })
})

describe('close codes', () => {
  it('stay in the application range', () => {
    for (const code of Object.values(CLOSE)) {
      expect(code).toBeGreaterThanOrEqual(4000)
      expect(code).toBeLessThan(5000)
    }
    expect(new Set(Object.values(CLOSE)).size).toBe(Object.keys(CLOSE).length)
  })
})
