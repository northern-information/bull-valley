import { describe, expect, it } from 'vitest'
import { itemById } from '../../src/items.ts'
import { holdsKey, isLock, LOCKS, passes } from '../../src/keys.ts'

describe('keys', () => {
  it('opens each lock with a key item', () => {
    for (const lock of Object.values(LOCKS)) {
      expect(itemById(lock.key)?.category).toBe('key-item')
    }
    expect(isLock('vault-back-room')).toBe(true)
    expect(isLock('front-door')).toBe(false)
  })

  it('lets through whoever carries the key, or whoever is already inside', () => {
    expect(holdsKey('vault-back-room', { 'vault-key': 1 })).toBe(true)
    expect(holdsKey('vault-back-room', { 'vault-key': 0 })).toBe(false)
    expect(holdsKey('vault-back-room', {})).toBe(false)
    expect(passes('vault-back-room', { 'vault-key': 1 }, false)).toBe(true)
    expect(passes('vault-back-room', {}, false)).toBe(false)
    // Never shut in: a raider who lost the key behind it can leave.
    expect(passes('vault-back-room', {}, true)).toBe(true)
  })
})
