import { describe, expect, it } from 'vitest'
import { OUTFIT_IDS } from '../../src/outfits.ts'
import {
  CLOSE,
  isExtractKind,
  isOutfitId,
  isValidName,
  MAX_COORD,
  NAME_MAX,
  normalizeName,
  parseClientMessage,
  parsePeerState,
  parseServerMessage,
  PEER_POSES,
  PROTOCOL_VERSION,
} from '../../src/protocol.ts'

const state = { x: 1.5, y: 0.25, z: -2, yaw: 0.3, pose: 'walk', riding: false }
const hello = {
  type: 'hello',
  v: PROTOCOL_VERSION,
  name: 'Dave',
  outfit: 'coleman',
  pickups: 70,
  stations: 5,
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

describe('outfits, poses and extracts', () => {
  it('knows every outfit and nothing else', () => {
    for (const id of OUTFIT_IDS) expect(isOutfitId(id)).toBe(true)
    expect(isOutfitId('tuxedo')).toBe(false)
    expect(isOutfitId(undefined)).toBe(false)
  })

  it('has no seated pose yet', () => {
    expect(PEER_POSES).toEqual(['stand', 'walk', 'crouch'])
  })

  it('knows the three ways out', () => {
    for (const kind of ['truck', 'fuel', 'keep']) {
      expect(isExtractKind(kind)).toBe(true)
    }
    expect(isExtractKind('tunnel')).toBe(false)
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
    expect(parsePeerState(null)).toBeNull()
    expect(parsePeerState('state')).toBeNull()
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

  it('lets the server judge a bad name or outfit in a hello', () => {
    const judged = parse({ ...hello, name: '', outfit: 'tuxedo' })
    expect(judged?.type).toBe('hello')
  })

  it('parses the raid frames', () => {
    for (const type of ['board', 'unboard', 'hop-out']) {
      expect(parse({ type })).toEqual({ type })
    }
    expect(parse({ type: 'buy', station: 2, kind: 'pbr' })).toEqual({
      type: 'buy',
      station: 2,
      kind: 'pbr',
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
    expect(parse({ type: 'extract', kind: 'keep' })).toEqual({
      type: 'extract',
      kind: 'keep',
    })
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
    expect(parse({ type: 'buy', station: -1, kind: 'pbr' })).toBeNull()
    expect(parse({ type: 'buy', station: 1.5, kind: 'pbr' })).toBeNull()
    expect(parse({ type: 'buy', station: 1, kind: '' })).toBeNull()
    expect(parse({ type: 'buy', station: 1, kind: 7 })).toBeNull()
    expect(parse({ type: 'buy', station: 1 })).toBeNull()
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
    expect(parse({ type: 'extract', kind: 'tunnel' })).toBeNull()
    expect(parse({ type: 'dev', op: 'hurry' })).toBeNull()
    expect(parse({ type: 'dev', op: 'hurry', seconds: NaN })).toBeNull()
    expect(parse({ type: 'dev', op: 'explode' })).toBeNull()
  })

  it('returns null for anything malformed', () => {
    expect(parseClientMessage('not json')).toBeNull()
    expect(parseClientMessage('42')).toBeNull()
    expect(parseClientMessage('null')).toBeNull()
    expect(parse({ type: 'dance' })).toBeNull()
    expect(parse({ type: 'hello', v: '1' })).toBeNull()
    expect(parse({ ...hello, v: 1.5 })).toBeNull()
    expect(parse({ ...hello, name: 7 })).toBeNull()
    expect(parse({ ...hello, pickups: undefined })).toBeNull()
    expect(parse({ ...hello, pickups: -1 })).toBeNull()
    expect(parse({ ...hello, pickups: 1.5 })).toBeNull()
    expect(parse({ ...hello, stations: undefined })).toBeNull()
    expect(parse({ ...hello, stations: -1 })).toBeNull()
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
