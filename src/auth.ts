// The game's side of the /auth routes (worker/auth.ts): who is signed in,
// keeping the session fresh, confirming a new account, choosing a username,
// signing out. Same origin, so the session cookies ride along on every call
// and the page never sees a token. The shapes are account.ts's.

import { AUTH_PATH } from './account.ts'
import type {
  AvailableResponse,
  MeResponse,
  Provider,
  ProvidersResponse,
  RefreshResponse,
} from './account.ts'

type Fetch = typeof fetch

const post = (fetchImpl: Fetch, path: string, body?: unknown) =>
  fetchImpl(`${AUTH_PATH}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const get = (fetchImpl: Fetch, path: string) =>
  fetchImpl(`${AUTH_PATH}${path}`, { credentials: 'same-origin' })

// The server's error message, or a fallback.
async function errorOf(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    return typeof body.error === 'string' ? body.error : fallback
  } catch {
    return fallback
  }
}

// Who is signed in, or null when the valley cannot be reached. The server
// slides a lapsed session on the refresh cookie as it answers.
export async function fetchMe(
  fetchImpl: Fetch = fetch
): Promise<MeResponse | null> {
  try {
    const res = await get(fetchImpl, '/me')
    if (!res.ok) return null
    return (await res.json()) as MeResponse
  } catch {
    return null
  }
}

// The providers this server signs in with. Empty when it cannot be reached.
export async function fetchProviders(
  fetchImpl: Fetch = fetch
): Promise<Provider[]> {
  try {
    const res = await get(fetchImpl, '/providers')
    if (!res.ok) return []
    return ((await res.json()) as ProvidersResponse).providers
  } catch {
    return []
  }
}

// A fresh access cookie before a socket opens. False only when the server
// says there is no session; a network failure is left to the socket's own
// retries.
export async function refreshSession(
  fetchImpl: Fetch = fetch
): Promise<boolean> {
  try {
    const res = await post(fetchImpl, '/refresh')
    if (!res.ok) return true
    return ((await res.json()) as RefreshResponse).ok
  } catch {
    return true
  }
}

export type Outcome = { ok: true } | { ok: false; error: string }

// Pass the age and terms gates: the account is created and signed in.
export async function confirmSignup(
  fetchImpl: Fetch = fetch
): Promise<Outcome> {
  try {
    const res = await post(fetchImpl, '/confirm-signup')
    if (res.ok) return { ok: true }
    return {
      ok: false,
      error: await errorOf(res, 'Your sign-in has expired; sign in again'),
    }
  } catch {
    return { ok: false, error: 'The valley cannot be reached' }
  }
}

export type UsernameOutcome =
  Outcome | { ok: false; taken: true; error: string }

export async function setUsername(
  username: string,
  fetchImpl: Fetch = fetch
): Promise<UsernameOutcome> {
  try {
    const res = await post(fetchImpl, '/username', { username })
    if (res.ok) return { ok: true }
    const error = await errorOf(res, 'That username could not be set')
    return res.status === 409
      ? { ok: false, taken: true, error }
      : { ok: false, error }
  } catch {
    return { ok: false, error: 'The valley cannot be reached' }
  }
}

// Null when the server cannot be asked.
export async function usernameAvailable(
  username: string,
  fetchImpl: Fetch = fetch
): Promise<AvailableResponse | null> {
  try {
    const res = await get(
      fetchImpl,
      `/username/${encodeURIComponent(username)}/available`
    )
    if (!res.ok) return null
    return (await res.json()) as AvailableResponse
  } catch {
    return null
  }
}

export async function signOut(fetchImpl: Fetch = fetch): Promise<void> {
  try {
    await post(fetchImpl, '/logout')
  } catch {
    // The cookies stay until the server is back; the page reloads anyway.
  }
}
