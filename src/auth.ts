// The game's side of the /auth routes (worker/auth.ts): who is signed in,
// keeping the session fresh, confirming a new account, choosing a username,
// saving the character, unlinking a provider, signing out. Same origin, so the session cookies ride along on every call
// and the page never sees a token. The shapes are account.ts's.

import { AUTH_PATH } from './account.ts'
import { copy } from './copy.ts'
import type {
  AvailableResponse,
  HotbarWire,
  LookWire,
  MeResponse,
  Provider,
  ProvidersResponse,
  RefreshResponse,
  SettingsWire,
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

// `limited` is a refusal to wait out (worker/ratelimit.ts), not a failure.
// `retry` is a refusal that leaves the pending signup standing: the wrong
// magic word.
export type Outcome =
  | { ok: true }
  | { ok: false; error: string; limited?: boolean; retry?: boolean }

// The status the /auth routes answer a rate-limited call with.
const TOO_MANY = 429

// The status the server refuses a wrong magic word with.
const FORBIDDEN = 403

// Say the magic word: the account is created and signed in.
export async function confirmSignup(
  magicWord: string,
  fetchImpl: Fetch = fetch
): Promise<Outcome> {
  try {
    const res = await post(fetchImpl, '/confirm-signup', { magicWord })
    if (res.ok) return { ok: true }
    if (res.status === FORBIDDEN) {
      return {
        ok: false,
        retry: true,
        error: await errorOf(res, copy('auth.magic_word_wrong')),
      }
    }
    if (res.status === TOO_MANY) {
      return {
        ok: false,
        limited: true,
        error: await errorOf(res, copy('auth.limited_short')),
      }
    }
    return {
      ok: false,
      error: await errorOf(res, copy('auth.expired')),
    }
  } catch {
    return { ok: false, error: copy('auth.unreachable') }
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
    const error = await errorOf(res, copy('auth.username_failed'))
    return res.status === 409
      ? { ok: false, taken: true, error }
      : { ok: false, error }
  } catch {
    return { ok: false, error: copy('auth.unreachable') }
  }
}

// A new username for an account that has one: Gron's doing. Same rules and
// outcomes as choosing the first; the session cookie is reissued with it.
export async function renameUsername(
  username: string,
  fetchImpl: Fetch = fetch
): Promise<UsernameOutcome> {
  try {
    const res = await fetchImpl(`${AUTH_PATH}/username`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
    if (res.ok) return { ok: true }
    const error = await errorOf(res, copy('auth.rename_failed'))
    if (res.status === 409) return { ok: false, taken: true, error }
    return { ok: false, error, limited: res.status === TOO_MANY }
  } catch {
    return { ok: false, error: copy('auth.unreachable') }
  }
}

// The character and guitar finish, kept on the account so they follow the
// raider to any browser.
export async function saveLook(
  look: LookWire,
  fetchImpl: Fetch = fetch
): Promise<Outcome> {
  try {
    const res = await fetchImpl(`${AUTH_PATH}/look`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(look),
    })
    if (res.ok) return { ok: true }
    return {
      ok: false,
      error: await errorOf(res, copy('auth.look_failed')),
      limited: res.status === TOO_MANY,
    }
  } catch {
    return { ok: false, error: copy('auth.unreachable') }
  }
}

// The item on each number key, kept on the account like the look.
export async function saveHotbar(
  hotbar: HotbarWire,
  fetchImpl: Fetch = fetch
): Promise<Outcome> {
  try {
    const res = await fetchImpl(`${AUTH_PATH}/hotbar`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hotbar }),
    })
    if (res.ok) return { ok: true }
    return {
      ok: false,
      error: await errorOf(res, copy('auth.hotbar_failed')),
      limited: res.status === TOO_MANY,
    }
  } catch {
    return { ok: false, error: copy('auth.unreachable') }
  }
}

// The raider's settings, kept on the account like the hotbar.
export async function saveSettings(
  settings: SettingsWire,
  fetchImpl: Fetch = fetch
): Promise<Outcome> {
  try {
    const res = await fetchImpl(`${AUTH_PATH}/settings`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    })
    if (res.ok) return { ok: true }
    return {
      ok: false,
      error: await errorOf(res, copy('auth.settings_failed')),
      limited: res.status === TOO_MANY,
    }
  } catch {
    return { ok: false, error: copy('auth.unreachable') }
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
    if (res.status === TOO_MANY) return { available: false, reason: 'limited' }
    if (!res.ok) return null
    return (await res.json()) as AvailableResponse
  } catch {
    return null
  }
}

// What to say of a username check: whether the name is free (null when
// the valley could not say), the status line, and its tone. The sign-in
// step and Gron's dialog show the same lines.
export interface Availability {
  available: boolean | null
  line: string
  tone: 'ok' | 'bad'
}

export function availabilityOf(answer: AvailableResponse | null): Availability {
  if (!answer) {
    return { available: null, line: copy('auth.unreachable'), tone: 'bad' }
  }
  if (answer.reason === 'limited') {
    return { available: null, line: copy('username.limited'), tone: 'bad' }
  }
  return answer.available
    ? { available: true, line: copy('username.available'), tone: 'ok' }
    : { available: false, line: copy('username.taken'), tone: 'bad' }
}

// Take a provider off the account. The server refuses the last one.
export async function unlinkProvider(
  provider: Provider,
  fetchImpl: Fetch = fetch
): Promise<Outcome> {
  try {
    const res = await fetchImpl(
      `${AUTH_PATH}/providers/${encodeURIComponent(provider)}`,
      { method: 'DELETE', credentials: 'same-origin' }
    )
    if (res.ok) return { ok: true }
    return {
      ok: false,
      error: await errorOf(res, copy('auth.unlink_failed')),
    }
  } catch {
    return { ok: false, error: copy('auth.unreachable') }
  }
}

export async function signOut(fetchImpl: Fetch = fetch): Promise<void> {
  try {
    await post(fetchImpl, '/logout')
  } catch {
    // The cookies stay until the server is back; the page reloads anyway.
  }
}
