import { describe, expect, it } from 'vitest'
import {
  ACCESS_TTL,
  PENDING_TTL,
  REFRESH_TTL,
  Tokens,
} from '../../worker/tokens.ts'

const T0 = Date.parse('2026-10-03T12:00:00Z')
const clock = (at: number) => () => at
const SECRET = 'a-secret-for-the-tests'

const access = { accountId: 'acct-1', username: 'Dave', role: 'user' }
const pending = {
  provider: 'github' as const,
  profile: { id: '12345', displayName: 'Dave', avatarUrl: null },
}

describe('Tokens', () => {
  it('round-trips each kind', async () => {
    const tokens = new Tokens(SECRET, clock(T0))
    expect(await tokens.verifyAccess(await tokens.signAccess(access))).toEqual(
      access
    )
    expect(await tokens.verifyRefresh(await tokens.signRefresh('acct-1'))).toBe(
      'acct-1'
    )
    expect(
      await tokens.verifyPending(await tokens.signPending(pending))
    ).toEqual(pending)
  })

  it('keeps a null username', async () => {
    const tokens = new Tokens(SECRET, clock(T0))
    const claims = { ...access, username: null }
    expect(await tokens.verifyAccess(await tokens.signAccess(claims))).toEqual(
      claims
    )
  })

  it('never lets one kind pass for another', async () => {
    const tokens = new Tokens(SECRET, clock(T0))
    const a = await tokens.signAccess(access)
    const r = await tokens.signRefresh('acct-1')
    const p = await tokens.signPending(pending)
    expect(await tokens.verifyAccess(r)).toBeNull()
    expect(await tokens.verifyAccess(p)).toBeNull()
    expect(await tokens.verifyRefresh(a)).toBeNull()
    expect(await tokens.verifyRefresh(p)).toBeNull()
    expect(await tokens.verifyPending(a)).toBeNull()
    expect(await tokens.verifyPending(r)).toBeNull()
  })

  it('expires each kind on its own clock', async () => {
    const signer = new Tokens(SECRET, clock(T0))
    const a = await signer.signAccess(access)
    const r = await signer.signRefresh('acct-1')
    const p = await signer.signPending(pending)
    const just = (ttl: number) =>
      new Tokens(SECRET, clock(T0 + ttl * 1000 - 1000))
    const past = (ttl: number) =>
      new Tokens(SECRET, clock(T0 + ttl * 1000 + 1000))
    expect(await just(ACCESS_TTL).verifyAccess(a)).not.toBeNull()
    expect(await past(ACCESS_TTL).verifyAccess(a)).toBeNull()
    expect(await just(REFRESH_TTL).verifyRefresh(r)).toBe('acct-1')
    expect(await past(REFRESH_TTL).verifyRefresh(r)).toBeNull()
    expect(await just(PENDING_TTL).verifyPending(p)).not.toBeNull()
    expect(await past(PENDING_TTL).verifyPending(p)).toBeNull()
  })

  it('refuses another secret, garbage, and nothing', async () => {
    const tokens = new Tokens(SECRET, clock(T0))
    const other = new Tokens('another-secret', clock(T0))
    const a = await tokens.signAccess(access)
    expect(await other.verifyAccess(a)).toBeNull()
    expect(await tokens.verifyAccess('not.a.jwt')).toBeNull()
    expect(await tokens.verifyAccess('')).toBeNull()
    expect(await tokens.verifyAccess(undefined)).toBeNull()
    expect(await tokens.verifyRefresh(undefined)).toBeNull()
    expect(await tokens.verifyPending(undefined)).toBeNull()
  })

  it('refuses a pending token with no profile id', async () => {
    const tokens = new Tokens(SECRET, clock(T0))
    const p = await tokens.signPending({
      provider: 'github',
      profile: { id: '', displayName: 'x', avatarUrl: null },
    })
    // An empty id is a string, so it verifies; the router refuses it on
    // the profile side. A missing one does not verify at all.
    expect(await tokens.verifyPending(p)).not.toBeNull()
    const bad = await tokens.signPending({
      provider: 'github',
      profile: { displayName: 'x' } as never,
    })
    expect(await tokens.verifyPending(bad)).toBeNull()
  })
})
