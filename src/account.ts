// The account protocol between the game and the Worker's /auth routes:
// one file, imported by the client (auth.ts) and the Worker (worker/auth.ts),
// so the two can never drift. Pure: no DOM, no Workers types, no Three.
// The WebSocket frames are protocol.ts's; this is the HTTP side.

// The sign-in providers a raider may use. `dev` exists only on a dev
// server, where it stands in for a real provider so nothing needs a secret.
export const OAUTH_PROVIDERS = ['google', 'discord', 'github'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]
export type Provider = OAuthProvider | 'dev'

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return typeof value === 'string' && OAUTH_PROVIDERS.some((id) => id === value)
}

export function isProvider(value: unknown): value is Provider {
  return value === 'dev' || isOAuthProvider(value)
}

// How each provider shows on the sign-in card.
export const PROVIDER_LABELS: Record<Provider, string> = {
  google: 'Google',
  discord: 'Discord',
  github: 'GitHub',
  dev: 'Dev',
}

export const PROVIDER_COLORS: Record<Provider, string> = {
  google: '#ea4335',
  discord: '#5865f2',
  github: '#f0f0f0',
  dev: '#ffaa00',
}

// A username is the account's public handle, unique across the valley
// (case-insensitively) and set once. Narrower than a typed name
// (protocol.ts isValidName), since two lookalike handles would be two
// raiders nobody could tell apart.
export const USERNAME_MIN = 3
export const USERNAME_MAX = 16
const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/

export function isValidUsername(value: unknown): value is string {
  return typeof value === 'string' && USERNAME_RE.test(value)
}

// The HTTP routes for accounts live under this path (worker/auth.ts).
export const AUTH_PATH = '/auth'

// --- Wire shapes -----------------------------------------------------------

// A provider as it shows on the account panel.
export interface ProviderWire {
  provider: Provider
  displayName: string
  avatarUrl: string | null
  linkedAt: number
}

// The signed-in account.
export interface AccountWire {
  accountId: string
  // Null until the raider chooses one; the socket is refused until then.
  username: string | null
  role: string
  // The display name and avatar of the primary provider.
  displayName: string
  avatarUrl: string | null
  providers: ProviderWire[]
}

// The profile a new raider arrived with, held until the gates are passed.
export interface PendingWire {
  provider: Provider
  displayName: string
  avatarUrl: string | null
}

// GET /auth/me. Always 200: signed out is an answer, not an error.
export interface MeResponse {
  account: AccountWire | null
  pending: PendingWire | null
}

// GET /auth/providers: the providers this server can sign in with.
export interface ProvidersResponse {
  providers: Provider[]
}

// GET /auth/username/:username/available.
export interface AvailableResponse {
  available: boolean
  // Why not, when it is not: the handle is malformed or taken.
  reason?: 'invalid' | 'taken'
}

// POST /auth/refresh. Always 200; `ok` false means there is no session.
export interface RefreshResponse {
  ok: boolean
}

// The flags the Worker appends to the page URL when a sign-in round trip
// lands back on the game.
export const AUTH_PARAM = 'auth'
export const AUTH_ERROR_PARAM = 'auth_error'
export const AUTH_RETURNS = ['success', 'pending_signup', 'linked'] as const
export type AuthReturn = (typeof AUTH_RETURNS)[number]

// Where a round trip may land: the game (its query string kept, so a dev
// server's ?valley= survives) or the popup's closing page. Anything else,
// including a protocol-relative URL, is refused.
export const REDIRECT_PATHS = ['/', '/auth-done.html'] as const

export function validateRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null
  if (value.startsWith('//') || value.startsWith('/\\')) return null
  let url: URL
  try {
    url = new URL(value, 'http://redirect.invalid')
  } catch {
    return null
  }
  if (url.origin !== 'http://redirect.invalid') return null
  if (!REDIRECT_PATHS.some((path) => path === url.pathname)) return null
  // Only the game keeps a query string, and never a stale auth flag.
  if (url.pathname !== '/') return url.pathname
  url.searchParams.delete(AUTH_PARAM)
  url.searchParams.delete(AUTH_ERROR_PARAM)
  return url.pathname + url.search
}

// The page URL to land on, with the auth flag added to whatever query the
// redirect kept.
export function landingUrl(
  origin: string,
  redirect: string | null,
  flag: { auth: AuthReturn } | { error: string }
): string {
  const url = new URL(redirect ?? '/', origin)
  if ('auth' in flag) url.searchParams.set(AUTH_PARAM, flag.auth)
  else url.searchParams.set(AUTH_ERROR_PARAM, flag.error)
  return url.toString()
}
