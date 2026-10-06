// The OAuth 2.0 authorization-code flow with PKCE against each provider:
// the authorize URL, the code exchange, the profile fetch, and what of the
// profile the valley keeps. Pure apart from the `fetch` the caller hands in,
// so the tests run against canned provider answers.

import { copy } from '../src/copy.ts'
import type { OAuthProvider } from '../src/account.ts'
import type { AuthSecrets } from './env.ts'

// What the valley keeps of a provider profile: the provider's own id for
// the person, a display name, and an avatar. Never the email.
export interface Profile {
  id: string
  displayName: string
  avatarUrl: string | null
}

interface ProviderSpec {
  authorizeUrl: string
  tokenUrl: string
  profileUrl: string
  scopes: string
  // Extra authorize parameters.
  extra?: Record<string, string>
  // The raw profile JSON to the valley's shape, before sanitizing.
  profile(raw: Record<string, unknown>): Profile
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

export const OAUTH: Record<OAuthProvider, ProviderSpec> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: 'openid profile',
    profile: (raw) => ({
      id: str(raw.id) ?? '',
      displayName: str(raw.name) ?? '',
      avatarUrl: str(raw.picture),
    }),
  },
  discord: {
    authorizeUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    profileUrl: 'https://discord.com/api/users/@me',
    scopes: 'identify',
    // Skip the consent screen when Discord already knows the answer.
    extra: { prompt: 'none' },
    profile: (raw) => {
      const id = str(raw.id) ?? ''
      const hash = str(raw.avatar)
      return {
        id,
        displayName: str(raw.global_name) ?? str(raw.username) ?? '',
        avatarUrl:
          id && hash
            ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png`
            : null,
      }
    },
  },
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    profileUrl: 'https://api.github.com/user',
    scopes: 'read:user',
    profile: (raw) => ({
      id: typeof raw.id === 'number' ? String(raw.id) : (str(raw.id) ?? ''),
      displayName: str(raw.name) ?? str(raw.login) ?? '',
      avatarUrl: str(raw.avatar_url),
    }),
  },
}

export interface Credentials {
  clientId: string
  clientSecret: string
}

// The client id and secret for a provider, or null when the Worker has
// none: that provider is then not offered.
export function credentials(
  env: AuthSecrets,
  provider: OAuthProvider
): Credentials | null {
  const pick = (id: string | undefined, secret: string | undefined) =>
    id && secret ? { clientId: id, clientSecret: secret } : null
  switch (provider) {
    case 'google':
      return pick(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
    case 'discord':
      return pick(env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET)
    case 'github':
      return pick(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET)
  }
}

// `provider:id`, the key a linked provider is stored under.
export function providerKey(provider: string, id: string): string {
  return `${provider}:${id}`
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// 32 random bytes, URL-safe: a CSRF state or a PKCE verifier.
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

// The S256 challenge for a PKCE verifier.
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  )
  return base64url(new Uint8Array(digest))
}

export interface AuthorizeParams {
  clientId: string
  redirectUri: string
  state: string
  challenge: string
}

export function authorizeUrl(
  provider: OAuthProvider,
  { clientId, redirectUri, state, challenge }: AuthorizeParams
): string {
  const spec = OAUTH[provider]
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: spec.scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...spec.extra,
  })
  return `${spec.authorizeUrl}?${params.toString()}`
}

export interface ExchangeParams {
  code: string
  redirectUri: string
  verifier: string
  credentials: Credentials
}

// Ten seconds is generous for a provider; past it the sign-in has failed.
const PROVIDER_TIMEOUT_MS = 10_000

// The provider's access token for an authorization code. Throws when the
// provider refuses or does not answer.
export async function exchangeCode(
  fetchImpl: typeof fetch,
  provider: OAuthProvider,
  { code, redirectUri, verifier, credentials }: ExchangeParams
): Promise<string> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  })
  const res = await fetchImpl(OAUTH[provider].tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const token = data.access_token
  if (!res.ok || data.error || typeof token !== 'string' || !token) {
    const why = str(data.error_description) ?? str(data.error) ?? res.statusText
    throw new Error(`${provider} token exchange failed: ${why}`)
  }
  return token
}

// The person's profile, sanitized. Throws when the provider refuses or the
// profile has no id.
export async function fetchProfile(
  fetchImpl: typeof fetch,
  provider: OAuthProvider,
  accessToken: string
): Promise<Profile> {
  const res = await fetchImpl(OAUTH[provider].profileUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      // GitHub requires one.
      'User-Agent': 'bull-valley-shadow-wars',
    },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`${provider} profile fetch failed: ${res.statusText}`)
  }
  const raw = await res.json<Record<string, unknown>>()
  const profile = sanitizeProfile(OAUTH[provider].profile(raw))
  if (!profile.id) throw new Error(`${provider} profile has no id`)
  return profile
}

const ID_MAX = 255
const DISPLAY_NAME_MAX = 200
const AVATAR_URL_MAX = 2048

// What the valley is willing to store: no control characters, bounded
// lengths, and an avatar only over https.
export function sanitizeProfile(profile: Profile): Profile {
  const clean = (value: string) => value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()
  let avatarUrl: string | null = null
  if (profile.avatarUrl) {
    try {
      const url = new URL(profile.avatarUrl)
      if (url.protocol === 'https:' && url.href.length <= AVATAR_URL_MAX) {
        avatarUrl = url.href
      }
    } catch {
      avatarUrl = null
    }
  }
  return {
    id: clean(profile.id).slice(0, ID_MAX),
    displayName:
      clean(profile.displayName).slice(0, DISPLAY_NAME_MAX) ||
      copy('auth.unnamed'),
    avatarUrl,
  }
}
