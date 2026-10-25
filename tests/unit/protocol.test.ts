import { describe, expect, it } from 'vitest'
import { EMOTE_IDS } from '../../src/emotes.ts'
import { MOAT_STATION } from '../../src/moatslurms.ts'
import {
  CHAT_MAX,
  CLOSE,
  COUNT_MAX,
  DISCOVER_MAX,
  FRAME_MAX,
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
import { WAYPOINT_MAX } from '../../src/waypoints.ts'

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
    { kind: 'marlboro', count: 3, x: 4, z: -6 },
    { kind: 'cabbage', count: 1, x: 250.5, z: 80 },
  ],
  stations: 5,
  havens: [0, 1, 2, 3, 4].map((i) => ({ x: i * 100, z: i })),
  metres: { width: 15059, height: 15038 },
  lairs: [],
  lurks: [{ x: -30, z: -60 }],
  maze: { x: 120, z: -40, yaw: 0.5 },
  truck: { home: { x: 10, z: -20 }, joyrideMs: 600_000 },
  stand: { x: 6, z: -24 },
  recyclers: [0, 1, 2, 3, 4].map((i) => ({ x: i * 100 + 12, z: i + 30 })),
  ponds: [
    { x: -300, z: 40, radius: 120, landing: { x: -220, z: 10 } },
    { x: 600, z: 400, radius: 90, landing: { x: 540, z: 360 } },
  ],
  bushes: [0, 1, 2].map((i) => ({ x: 6 + i, z: -30 })),
  dealer: { x: -10, z: -60 },
  gron: { x: 4, z: -9 },
  disk: { x: -150, z: -230 },
  undercroft: { x: -7000, z: -7000, yaw: 0 },
  moat: { x: 400, z: 30, yaw: 0.35 },
  rings: [0, 1, 2, 3, 4].map((i) => ({ x: i * 100 + 2, z: i + 14 })),
  payphones: [{ x: 230, z: -60 }],
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
  it('carries the emotes as poses, named as they are typed', () => {
    expect(PEER_POSES).toEqual(['stand', 'walk', 'crouch', ...EMOTE_IDS])
    expect(parsePeerState({ ...state, pose: 'wave' })?.pose).toBe('wave')
    expect(parsePeerState({ ...state, pose: 'moonwalk' })).toBeNull()
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

  it('carries a jar or a rod in hand, and nothing else', () => {
    expect(parsePeerState({ ...state, held: 'jar' })?.held).toBe('jar')
    expect(parsePeerState({ ...state, held: 'rod' })?.held).toBe('rod')
    expect(parsePeerState({ ...state, held: 'torch' })?.held).toBe('torch')
    expect(parsePeerState(state)).not.toHaveProperty('held')
    expect(parsePeerState({ ...state, held: 'flashlight' })).toBeNull()
    expect(parsePeerState({ ...state, held: 3 })).toBeNull()
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

  it('parses whispers and the friends frames, and refuses bad ones', () => {
    expect(parse({ type: 'whisper', to: 'Baker', text: 'hi' })).toEqual({
      type: 'whisper',
      to: 'Baker',
      text: 'hi',
    })
    expect(parse({ type: 'whisper', to: '', text: 'hi' })).toBeNull()
    expect(parse({ type: 'whisper', to: 'Baker', text: '' })).toBeNull()
    expect(
      parse({ type: 'whisper', to: 'Baker', text: 'x'.repeat(CHAT_MAX + 1) })
    ).toBeNull()
    expect(parse({ type: 'friend', name: 'Baker' })).toEqual({
      type: 'friend',
      name: 'Baker',
    })
    expect(parse({ type: 'unfriend', name: 'Baker', extra: 1 })).toEqual({
      type: 'unfriend',
      name: 'Baker',
    })
    expect(parse({ type: 'friend', name: 7 })).toBeNull()
    expect(parse({ type: 'inspect', name: 'Baker' })).toEqual({
      type: 'inspect',
      name: 'Baker',
    })
    expect(parse({ type: 'inspect', name: '' })).toBeNull()
    expect(parse({ type: 'invite', name: 'Baker' })).toEqual({
      type: 'invite',
      name: 'Baker',
    })
    expect(parse({ type: 'invite' })).toBeNull()
    expect(parse({ type: 'party-leave', extra: 1 })).toEqual({
      type: 'party-leave',
    })
    expect(parse({ type: 'party-chat', text: 'to the maze' })).toEqual({
      type: 'party-chat',
      text: 'to the maze',
    })
    expect(parse({ type: 'party-chat', text: '' })).toBeNull()
    expect(
      parse({ type: 'crew-create', tag: 'BVC', name: 'Bull Valley' })
    ).toEqual({ type: 'crew-create', tag: 'BVC', name: 'Bull Valley' })
    expect(
      parse({ type: 'crew-create', tag: 'B'.repeat(9), name: 'X' })
    ).toBeNull()
    expect(parse({ type: 'crew-invite', name: 'Baker' })).toEqual({
      type: 'crew-invite',
      name: 'Baker',
    })
    expect(parse({ type: 'crew-join', tag: 'BVC' })).toEqual({
      type: 'crew-join',
      tag: 'BVC',
    })
    expect(parse({ type: 'crew-join', tag: '' })).toBeNull()
    expect(parse({ type: 'crew-leave' })).toEqual({ type: 'crew-leave' })
    expect(parse({ type: 'crew-kick', name: 'Baker' })).toEqual({
      type: 'crew-kick',
      name: 'Baker',
    })
    expect(parse({ type: 'crew-chat', text: 'hi' })).toEqual({
      type: 'crew-chat',
      text: 'hi',
    })
    expect(parse({ type: 'dev', op: 'earn', cents: 500 })).toEqual({
      type: 'dev',
      op: 'earn',
      cents: 500,
    })
    expect(parse({ type: 'dev', op: 'earn', cents: 0 })).toBeNull()
    expect(parse({ type: 'unfriend' })).toBeNull()
    expect(parse({ type: 'friends', extra: 1 })).toEqual({ type: 'friends' })
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

  it('refuses a type or a dev op it does not know, prototype names too', () => {
    expect(parse({ type: 'teleport' })).toBeNull()
    expect(parse({ type: 'toString' })).toBeNull()
    expect(parse({ type: '__proto__' })).toBeNull()
    expect(parse({ type: 7 })).toBeNull()
    expect(parse({ type: 'dev', op: 'toString' })).toBeNull()
    expect(parse({ type: 'dev', op: 'fly' })).toBeNull()
    expect(parse({ type: 'dev' })).toBeNull()
  })

  it("parses where Marx's truck stands, and nothing else", () => {
    const lights = { type: 'headlights', x: 1, y: 2, z: 3, heading: -1.5 }
    expect(parse({ ...lights, extra: true })).toEqual(lights)
    expect(parse({ ...lights, heading: 'north' })).toBeNull()
    expect(parse({ ...lights, heading: Infinity })).toBeNull()
    expect(parse({ ...lights, x: NaN })).toBeNull()
  })

  it("carries a reconnect's last id in a hello, and drops a bad one", () => {
    expect(parse({ ...hello, was: 'abc' })).toEqual({ ...hello, was: 'abc' })
    expect(parse({ ...hello, was: 7 })).toEqual(hello)
    expect(parse({ ...hello, was: 'x'.repeat(65) })).toEqual(hello)
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
      lairs: _lairs,
      lurks: _lurks,
      maze: _maze,
      truck: _truck,
      stand: _stand,
      recyclers: _recyclers,
      ponds: _ponds,
      bushes: _bushes,
      dealer: _dealer,
      gron: _gron,
      disk: _disk,
      undercroft: _undercroft,
      moat: _moat,
      rings: _rings,
      payphones: _payphones,
      ...older
    } = hello
    expect(parse({ ...older, v: PROTOCOL_VERSION - 1 })).toEqual({
      ...older,
      v: PROTOCOL_VERSION - 1,
      havens: [],
      metres: { width: 0, height: 0 },
      lairs: [],
      lurks: [],
      maze: null,
      truck: { home: { x: 0, z: 0 }, joyrideMs: 0 },
      stand: null,
      recyclers: [],
      ponds: [],
      bushes: [],
      dealer: null,
      gron: null,
      disk: null,
      undercroft: null,
      moat: null,
      rings: [],
      payphones: [],
    })
    // Any bad one reads as none in an older build, a good map beside them
    // too: the places come all together or not at all.
    expect(
      parse({
        ...hello,
        v: PROTOCOL_VERSION - 1,
        havens: 1,
        metres: 'big',
        maze: 'corn',
        truck: 'chevy',
        stand: 'cabbages',
        bushes: 'berries',
        dealer: 'wick',
        undercroft: 'cellar',
        moat: 'deep',
        rings: 'round',
      })
    ).toEqual({
      ...older,
      v: PROTOCOL_VERSION - 1,
      havens: [],
      metres: { width: 0, height: 0 },
      lairs: [],
      lurks: [],
      maze: null,
      truck: { home: { x: 0, z: 0 }, joyrideMs: 0 },
      stand: null,
      recyclers: [],
      ponds: [],
      bushes: [],
      dealer: null,
      gron: null,
      disk: null,
      undercroft: null,
      moat: null,
      rings: [],
      payphones: [],
    })
    // The current version still requires them all.
    expect(parse({ ...older, v: PROTOCOL_VERSION })).toBeNull()
    expect(parse({ ...hello, dealer: 'wick' })).toBeNull()
    expect(parse({ ...hello, gron: 'gron' })).toBeNull()
    expect(parse({ ...hello, gron: null })).toEqual({ ...hello, gron: null })
    expect(parse({ ...hello, disk: 'floppy' })).toBeNull()
    expect(
      parse({ ...hello, moat: { place: hello.maze, floor: 'deep' } })
    ).toBeNull()
    expect(parse({ ...hello, moat: null })).toEqual({ ...hello, moat: null })
    expect(parse({ ...hello, maze: null, stand: null })).toEqual({
      ...hello,
      maze: null,
      stand: null,
    })
  })

  it('parses the dev frame that places a shadowman', () => {
    expect(parse({ type: 'dev', op: 'shadowman', x: 1, z: -2 })).toEqual({
      type: 'dev',
      op: 'shadowman',
      x: 1,
      z: -2,
    })
    expect(parse({ type: 'dev', op: 'shadowman', x: 1 })).toBeNull()
    // A spider or a spiderling when it says so, and only by its kind.
    expect(
      parse({ type: 'dev', op: 'shadowman', x: 1, z: -2, kind: 'spider' })
    ).toEqual({ type: 'dev', op: 'shadowman', x: 1, z: -2, kind: 'spider' })
    expect(
      parse({ type: 'dev', op: 'shadowman', x: 1, z: -2, kind: 'spiderling' })
    ).toEqual({ type: 'dev', op: 'shadowman', x: 1, z: -2, kind: 'spiderling' })
    expect(
      parse({ type: 'dev', op: 'shadowman', x: 1, z: -2, kind: 'yes' })
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

  it('parses a waypoints frame of up to WAYPOINT_MAX points', () => {
    const pins = [{ x: 1, z: -2 }]
    expect(parse({ type: 'waypoints', points: pins })).toEqual({
      type: 'waypoints',
      points: pins,
    })
    expect(parse({ type: 'waypoints', points: [] })).toEqual({
      type: 'waypoints',
      points: [],
    })
    const many = Array.from({ length: WAYPOINT_MAX + 1 }, () => pins[0])
    expect(parse({ type: 'waypoints', points: many })).toBeNull()
    expect(parse({ type: 'waypoints', points: [{ x: 1 }] })).toBeNull()
    expect(parse({ type: 'waypoints', points: 'here' })).toBeNull()
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
    for (const type of ['board', 'hop-out', 'portal', 'rename']) {
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
    expect(parse({ type: 'stand-stock', kind: 'cabbage', count: 3 })).toEqual({
      type: 'stand-stock',
      kind: 'cabbage',
      count: 3,
    })
    expect(parse({ type: 'stand-stock', kind: 'cabbage', count: 0 })).toBeNull()
    expect(parse({ type: 'stand-stock', kind: 7, count: 1 })).toBeNull()
    expect(parse({ type: 'stand-collect', extra: 1 })).toEqual({
      type: 'stand-collect',
    })
    expect(parse({ type: 'stand-upgrade' })).toEqual({ type: 'stand-upgrade' })
    // The Recycling Center (rule 33): a known line, or nothing.
    expect(parse({ type: 'research', extra: 1 })).toEqual({ type: 'research' })
    expect(parse({ type: 'recycle', line: 'dimes' })).toEqual({
      type: 'recycle',
      line: 'dimes',
    })
    expect(parse({ type: 'recycle', line: 'beam' })).toBeNull()
    // Which fish cook is the valley's to check; a count is whole and one
    // or more.
    expect(parse({ type: 'cook', kind: 'bluegill', count: 3 })).toEqual({
      type: 'cook',
      kind: 'bluegill',
      count: 3,
    })
    expect(parse({ type: 'cook', kind: 'bluegill', count: 0 })).toBeNull()
    expect(parse({ type: 'cook', kind: 'bluegill', count: 1.5 })).toBeNull()
    expect(parse({ type: 'cook', count: 1 })).toBeNull()
    // Fishing at the firefly pond (rule 36).
    expect(parse({ type: 'angler' })).toEqual({ type: 'angler' })
    expect(parse({ type: 'tackle' })).toEqual({ type: 'tackle' })
    expect(parse({ type: 'dig' })).toEqual({ type: 'dig' })
    expect(parse({ type: 'cast', bait: 'berries' })).toEqual({
      type: 'cast',
      bait: 'berries',
    })
    expect(parse({ type: 'cast', bait: 'cabbage' })).toBeNull()
    expect(parse({ type: 'reel', landed: false })).toEqual({
      type: 'reel',
      landed: false,
    })
    expect(parse({ type: 'reel', landed: 'yes' })).toBeNull()
    expect(parse({ type: 'jar-slurm', station: 2, slot: 9, index: 1 })).toEqual(
      { type: 'jar-slurm', station: 2, slot: 9, index: 1 }
    )
    expect(
      parse({ type: 'jar-slurm', station: 2, slot: 9.5, index: 1 })
    ).toBeNull()
    // The moat's go by MOAT_STATION; no other station below 0.
    expect(
      parse({ type: 'jar-slurm', station: MOAT_STATION, slot: 9, index: 1 })
    ).toEqual({ type: 'jar-slurm', station: MOAT_STATION, slot: 9, index: 1 })
    expect(
      parse({ type: 'jar-slurm', station: -2, slot: 9, index: 1 })
    ).toBeNull()
    // The toolbox and the torch (rule 39).
    expect(parse({ type: 'toolbox' })).toEqual({ type: 'toolbox' })
    expect(parse({ type: 'torch', index: 3 })).toEqual({
      type: 'torch',
      index: 3,
    })
    expect(parse({ type: 'torch', index: -1 })).toBeNull()
    expect(parse({ type: 'torch', index: 1.5 })).toBeNull()
    expect(parse({ type: 'torch' })).toBeNull()
    // A hello says where the stand stands, or that there is none.
    expect(parse({ ...hello, stand: null })).toEqual({ ...hello, stand: null })
    expect(parse({ ...hello, stand: { x: 'here' } })).toBeNull()
    // And where each station's recycling machine stands, one a station
    // (rule 33).
    expect(parse({ ...hello, recyclers: 'machine' })).toBeNull()
    expect(parse({ ...hello, recyclers: hello.recyclers.slice(1) })).toBeNull()
    // And the firefly ponds, none or more (rule 36).
    expect(parse({ ...hello, ponds: [] })).toEqual({ ...hello, ponds: [] })
    expect(parse({ ...hello, ponds: null })).toBeNull()
    expect(parse({ ...hello, ponds: [{ x: 1, z: 2 }] })).toBeNull()
    expect(parse({ ...hello, ponds: Array(9).fill(hello.ponds[0]) })).toBeNull()
    // And the spiders' lairs, none or more, each with a reach (rule 11).
    const lair = { x: 10, z: -20, radius: 45 }
    expect(parse({ ...hello, lairs: [lair] })).toEqual({
      ...hello,
      lairs: [lair],
    })
    expect(parse({ ...hello, lairs: null })).toBeNull()
    expect(parse({ ...hello, lairs: [{ x: 1, z: 2 }] })).toBeNull()
    expect(parse({ ...hello, lairs: [{ ...lair, radius: 0 }] })).toBeNull()
    expect(parse({ ...hello, lairs: [{ ...lair, x: NaN }] })).toBeNull()
    expect(parse({ ...hello, lairs: Array(9).fill(lair) })).toBeNull()
    // And the lurks, none or more, each a place (rule 11).
    expect(parse({ ...hello, lurks: [] })).toEqual({ ...hello, lurks: [] })
    expect(parse({ ...hello, lurks: null })).toBeNull()
    expect(parse({ ...hello, lurks: [{ x: 1 }] })).toBeNull()
    expect(
      parse({ ...hello, lurks: Array(65).fill({ x: 1, z: 2 }) })
    ).toBeNull()
    // A ring on every lot (rule 28), no fewer.
    expect(parse({ ...hello, rings: hello.rings.slice(1) })).toBeNull()
    // And where the squatter deals, or that there is none (rule 25).
    expect(parse({ ...hello, dealer: null })).toEqual({
      ...hello,
      dealer: null,
    })
    expect(parse({ ...hello, dealer: { z: 1 } })).toBeNull()
    expect(
      parse({
        type: 'deal',
        kind: 'mushrooms',
        offer: { pbr: 3, marlboro: 12 },
        extra: 1,
      })
    ).toEqual({
      type: 'deal',
      kind: 'mushrooms',
      offer: { pbr: 3, marlboro: 12 },
    })
    expect(parse({ type: 'deal', kind: 'lsd' })).toBeNull()
    expect(parse({ type: 'deal', kind: 'lsd', pay: 'pbr' })).toBeNull()
    expect(parse({ type: 'deal', kind: 4, offer: { pbr: 1 } })).toBeNull()
    expect(parse({ type: 'deal', kind: 'lsd', offer: {} })).toBeNull()
    expect(parse({ type: 'deal', kind: 'lsd', offer: [3] })).toBeNull()
    expect(parse({ type: 'deal', kind: 'lsd', offer: { pbr: 0 } })).toBeNull()
    expect(parse({ type: 'deal', kind: 'lsd', offer: { pbr: 1.5 } })).toBeNull()
    expect(parse({ type: 'deal', kind: 'lsd', offer: { pbr: '2' } })).toBeNull()
    const many = Object.fromEntries(
      Array.from({ length: 17 }, (_, i) => [`k${i}`, 1])
    )
    expect(parse({ type: 'deal', kind: 'lsd', offer: many })).toBeNull()
    expect(parse({ type: 'quest', quest: 'rose', step: 'lay' })).toEqual({
      type: 'quest',
      quest: 'rose',
      step: 'lay',
    })
    expect(parse({ type: 'quest', quest: 'rose', step: 'pick' })).toBeNull()
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
      parse({ type: 'call', from: { x: 1, z: 2, extra: true }, to: { x: 3 } })
    ).toEqual({ type: 'call', from: { x: 1, z: 2 } })
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
    expect(parse({ type: 'call', from: { x: 1 } })).toBeNull()
    expect(parse({ type: 'call', from: { x: MAX_COORD + 1, z: 4 } })).toBeNull()
    // Too long a frame, too big a count.
    expect(parseClientMessage(`"${'x'.repeat(FRAME_MAX)}"`)).toBeNull()
    expect(
      parse({ type: 'drop', kind: 'joints', count: COUNT_MAX + 1 })
    ).toBeNull()
    expect(parse({ type: 'drop', kind: 'joints', count: COUNT_MAX })).toEqual({
      type: 'drop',
      kind: 'joints',
      count: COUNT_MAX,
    })
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
    const room = (within: unknown) =>
      parse({
        ...hello,
        pickups: [{ kind: 'joints', count: 1, x: 0, z: 0, within }],
      })
    const square = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
    ]
    expect(room(square)).toMatchObject({
      pickups: [{ kind: 'joints', within: square }],
    })
    expect(room(square.slice(0, 2))).toBeNull()
    expect(room(Array.from({ length: 9 }, () => square[0]))).toBeNull()
    expect(room([...square.slice(0, 2), { x: 'a', z: 0 }])).toBeNull()
    expect(room([...square.slice(0, 2), 7])).toBeNull()
    expect(room('room')).toBeNull()
    expect(
      parse({ ...hello, pickups: [{ kind: '', count: 1, x: 0, z: 0 }] })
    ).toBeNull()
    expect(
      parse({ ...hello, pickups: [{ kind: 'joints', count: 1.5, x: 0, z: 0 }] })
    ).toBeNull()
    expect(
      parse({ ...hello, pickups: [{ kind: 'joints', count: 1, x: 0 }] })
    ).toBeNull()
    expect(
      parse({ ...hello, pickups: [{ kind: 'joints', count: 1, x: 0, z: NaN }] })
    ).toBeNull()
    expect(parse({ ...hello, bushes: [{ x: 1 }] })).toBeNull()
    expect(parse({ ...hello, bushes: 7 })).toBeNull()
    expect(
      parse({
        ...hello,
        bushes: Array.from({ length: 17 }, () => ({ x: 0, z: 0 })),
      })
    ).toBeNull()
    expect(parse({ ...hello, pickups: [null] })).toBeNull()
    expect(
      parse({
        ...hello,
        pickups: Array.from({ length: PICKUPS_MAX + 1 }, () => ({
          kind: 'cabbage',
          count: 1,
          x: 0,
          z: 0,
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
