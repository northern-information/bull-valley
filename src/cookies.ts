// HTTP cookies for the account session: parse a Cookie header, write a
// Set-Cookie header. Pure, imported by the Worker (worker/auth.ts) and its
// tests. Every cookie the valley sets is HttpOnly, SameSite=Lax and scoped
// to the whole origin; `secure` is on over https and off for a dev server
// on http, which Safari would otherwise refuse to store.

// The cookies the account session uses. The names are one place so the
// Worker and its tests never disagree.
export const COOKIE = {
  // Access token: a short-lived JWT naming the account.
  token: 'bv_token',
  // Refresh token: a long-lived JWT that mints new access tokens.
  refresh: 'bv_refresh',
  // Pending signup: the provider profile of a new raider who has not yet
  // said the magic word.
  pending: 'bv_pending',
  // OAuth CSRF state and PKCE verifier, for the five minutes a sign-in
  // round trip takes.
  state: 'bv_state',
  pkce: 'bv_pkce',
  // The account a Link Another Account round trip is linking to.
  link: 'bv_link',
  // Where to land after the round trip.
  redirect: 'bv_redirect',
} as const

export interface CookieOptions {
  // Lifetime in seconds. 0 clears the cookie.
  maxAge: number
  // Set over https. A dev server on http must leave it off.
  secure: boolean
}

// The cookies a request carries, by name. Later duplicates win, as
// browsers send the most specific cookie first; the valley sets one
// cookie per name, so there are none.
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const name = part.slice(0, eq).trim()
    if (!name) continue
    const value = part.slice(eq + 1).trim()
    try {
      out[name] = decodeURIComponent(value)
    } catch {
      out[name] = value
    }
  }
  return out
}

// One Set-Cookie header value. Values are URL-encoded, so a JWT (which has
// no reserved characters) passes through unchanged.
export function serializeCookie(
  name: string,
  value: string,
  { maxAge, secure }: CookieOptions
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

// A Set-Cookie header value that removes the cookie.
export function clearCookie(name: string, secure: boolean): string {
  return serializeCookie(name, '', { maxAge: 0, secure })
}
