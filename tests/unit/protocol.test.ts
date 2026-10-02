import { describe, expect, it } from 'vitest'
import { OUTFIT_IDS } from '../../src/outfits.ts'
import {
  CLOSE,
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
  it('knows every outfit and nothing else', () => {
    for (const id of OUTFIT_IDS) expect(isOutfitId(id)).toBe(true)
    expect(isOutfitId('tuxedo')).toBe(false)
    expect(isOutfitId(undefined)).toBe(false)
  })

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
    expect(parsePeerState(null)).toBeNull()
    expect(parsePeerState('state')).toBeNull()
  })
})

describe('parseClientMessage', () => {
  it('parses hello, state and ping', () => {
    expect(
      parseClientMessage(
        JSON.stringify({
          type: 'hello',
          v: PROTOCOL_VERSION,
          name: 'Dave',
          outfit: 'coleman',
        })
      )
    ).toEqual({ type: 'hello', v: 1, name: 'Dave', outfit: 'coleman' })
    expect(
      parseClientMessage(JSON.stringify({ type: 'state', ...state }))
    ).toEqual({ type: 'state', ...state })
    expect(
      parseClientMessage(JSON.stringify({ type: 'ping', t: 12.5 }))
    ).toEqual({
      type: 'ping',
      t: 12.5,
    })
  })

  it('lets the server judge a bad name or outfit in a hello', () => {
    const hello = parseClientMessage(
      JSON.stringify({ type: 'hello', v: 1, name: '', outfit: 'tuxedo' })
    )
    expect(hello?.type).toBe('hello')
  })

  it('returns null for anything malformed', () => {
    expect(parseClientMessage('not json')).toBeNull()
    expect(parseClientMessage('42')).toBeNull()
    expect(parseClientMessage('null')).toBeNull()
    expect(parseClientMessage(JSON.stringify({ type: 'dance' }))).toBeNull()
    expect(
      parseClientMessage(JSON.stringify({ type: 'hello', v: '1' }))
    ).toBeNull()
    expect(
      parseClientMessage(
        JSON.stringify({ type: 'hello', v: 1.5, name: 'a', outfit: 'player' })
      )
    ).toBeNull()
    expect(
      parseClientMessage(
        JSON.stringify({ type: 'hello', v: 1, name: 7, outfit: 'player' })
      )
    ).toBeNull()
    expect(
      parseClientMessage(JSON.stringify({ type: 'state', ...state, x: NaN }))
    ).toBeNull()
    expect(
      parseClientMessage(JSON.stringify({ type: 'ping', t: 'now' }))
    ).toBeNull()
  })
})

describe('parseServerMessage', () => {
  it('passes typed frames through and drops garbage', () => {
    expect(
      parseServerMessage(JSON.stringify({ type: 'peer-left', id: 'a' }))
    ).toEqual({
      type: 'peer-left',
      id: 'a',
    })
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
