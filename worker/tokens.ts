// The session tokens: HS256 JWTs signed with the Worker's secret. Three
// kinds, told apart by a `typ` claim so one can never pass for another:
// access (names the account, short-lived, read on every request and on the
// socket upgrade), refresh (mints new access tokens for a month), and
// pending (a new raider's provider profile, held until the
// raider says the magic word and the account is created).

import { jwtVerify, SignJWT } from 'jose'
import type { Provider } from '../src/account.ts'
import type { Profile } from './oauth.ts'

const ISSUER = 'bull-valley-shadow-wars'

// Lifetimes in seconds. The access token is short so a sign-out or a role
// change takes effect within minutes; the refresh token carries the month.
export const ACCESS_TTL = 15 * 60
export const REFRESH_TTL = 30 * 24 * 60 * 60
export const PENDING_TTL = 24 * 60 * 60

export interface AccessClaims {
  accountId: string
  // Null until the raider chooses a username.
  username: string | null
  role: string
}

export interface PendingClaims {
  provider: Provider
  profile: Profile
}

type Kind = 'access' | 'refresh' | 'pending'

export class Tokens {
  private readonly key: Uint8Array
  private readonly now: () => number

  constructor(secret: string, now: () => number = Date.now) {
    this.key = new TextEncoder().encode(secret)
    this.now = now
  }

  signAccess(claims: AccessClaims): Promise<string> {
    return this.sign(
      'access',
      { username: claims.username, role: claims.role },
      claims.accountId,
      ACCESS_TTL
    )
  }

  signRefresh(accountId: string): Promise<string> {
    return this.sign('refresh', {}, accountId, REFRESH_TTL)
  }

  signPending(claims: PendingClaims): Promise<string> {
    return this.sign(
      'pending',
      { provider: claims.provider, profile: claims.profile },
      null,
      PENDING_TTL
    )
  }

  async verifyAccess(token: string | undefined): Promise<AccessClaims | null> {
    const payload = await this.verify('access', token)
    if (!payload || typeof payload.sub !== 'string') return null
    const username = payload.username
    const role = payload.role
    return {
      accountId: payload.sub,
      username: typeof username === 'string' ? username : null,
      role: typeof role === 'string' ? role : 'user',
    }
  }

  // The account a refresh token belongs to.
  async verifyRefresh(token: string | undefined): Promise<string | null> {
    const payload = await this.verify('refresh', token)
    return payload && typeof payload.sub === 'string' ? payload.sub : null
  }

  async verifyPending(
    token: string | undefined
  ): Promise<PendingClaims | null> {
    const payload = await this.verify('pending', token)
    if (!payload) return null
    const provider = payload.provider
    const profile = payload.profile as Partial<Profile> | undefined
    if (
      typeof provider !== 'string' ||
      !profile ||
      typeof profile.id !== 'string' ||
      typeof profile.displayName !== 'string'
    ) {
      return null
    }
    return {
      provider: provider as Provider,
      profile: {
        id: profile.id,
        displayName: profile.displayName,
        avatarUrl:
          typeof profile.avatarUrl === 'string' ? profile.avatarUrl : null,
      },
    }
  }

  private sign(
    typ: Kind,
    claims: Record<string, unknown>,
    subject: string | null,
    ttl: number
  ): Promise<string> {
    const at = Math.floor(this.now() / 1000)
    const jwt = new SignJWT({ ...claims, typ })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setIssuedAt(at)
      .setExpirationTime(at + ttl)
    if (subject) jwt.setSubject(subject)
    return jwt.sign(this.key)
  }

  private async verify(
    typ: Kind,
    token: string | undefined
  ): Promise<Record<string, unknown> | null> {
    if (!token) return null
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: ['HS256'],
        currentDate: new Date(this.now()),
      })
      return payload.typ === typ ? payload : null
    } catch {
      return null
    }
  }
}
