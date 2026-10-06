import { describe, expect, it } from 'vitest'
import {
  confirmSignup,
  fetchMe,
  fetchProviders,
  refreshSession,
  renameUsername,
  saveHotbar,
  saveLook,
  setUsername,
  signOut,
  unlinkProvider,
  usernameAvailable,
} from '../../src/auth.ts'
import { copy } from '../../src/copy.ts'
import { assign, EMPTY_HOTBAR } from '../../src/hotbar.ts'

interface Seen {
  url: string
  init?: RequestInit
}

// A fetch that answers every call with one canned response.
function answer(status: number, body: unknown = {}) {
  const seen: Seen[] = []
  const impl = ((url: string, init?: RequestInit) => {
    seen.push({ url, init })
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  }) as unknown as typeof fetch
  return { impl, seen }
}

const down = (() =>
  Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch

describe('fetchMe', () => {
  it('returns the answer, sending the cookies', async () => {
    const me = { account: null, pending: null }
    const { impl, seen } = answer(200, me)
    expect(await fetchMe(impl)).toEqual(me)
    expect(seen[0].url).toBe('/auth/me')
    expect(seen[0].init?.credentials).toBe('same-origin')
  })

  it('is null when the valley cannot be reached', async () => {
    expect(await fetchMe(down)).toBeNull()
    expect(await fetchMe(answer(500).impl)).toBeNull()
  })
})

describe('fetchProviders', () => {
  it('lists them, or none', async () => {
    expect(
      await fetchProviders(answer(200, { providers: ['dev', 'github'] }).impl)
    ).toEqual(['dev', 'github'])
    expect(await fetchProviders(down)).toEqual([])
    expect(await fetchProviders(answer(503).impl)).toEqual([])
  })
})

describe('refreshSession', () => {
  it('says whether there is a session', async () => {
    const { impl, seen } = answer(200, { ok: true })
    expect(await refreshSession(impl)).toBe(true)
    expect(seen[0].init?.method).toBe('POST')
    expect(await refreshSession(answer(200, { ok: false }).impl)).toBe(false)
  })

  it('leaves a network failure to the socket', async () => {
    expect(await refreshSession(down)).toBe(true)
    expect(await refreshSession(answer(502).impl)).toBe(true)
  })
})

describe('confirmSignup', () => {
  it('reports the outcome with the server message', async () => {
    expect(await confirmSignup(answer(200).impl)).toEqual({ ok: true })
    expect(await confirmSignup(answer(401, { error: 'Expired' }).impl)).toEqual(
      { ok: false, error: 'Expired' }
    )
    expect(await confirmSignup(down)).toEqual({
      ok: false,
      error: copy('auth.unreachable'),
    })
  })

  it('marks a rate limit as one to wait out', async () => {
    expect(
      await confirmSignup(answer(429, { error: 'Too many tries.' }).impl)
    ).toEqual({ ok: false, limited: true, error: 'Too many tries.' })
  })
})

describe('saveLook', () => {
  it('puts the look, and falls back to its own message', async () => {
    const { impl, seen } = answer(200)
    const look = { outfit: 'church', finish: 'cherry' } as const
    expect(await saveLook(look, impl)).toEqual({ ok: true })
    expect(seen[0].url).toBe('/auth/look')
    expect(seen[0].init?.method).toBe('PUT')
    expect(JSON.parse(seen[0].init?.body as string)).toEqual(look)
    expect(await saveLook(look, answer(500).impl)).toEqual({
      ok: false,
      limited: false,
      error: copy('auth.look_failed'),
    })
    expect(await saveLook(look, down)).toEqual({
      ok: false,
      error: copy('auth.unreachable'),
    })
  })
})

describe('saveHotbar', () => {
  it('puts the bar, and tells a rate limit apart', async () => {
    const { impl, seen } = answer(200)
    const bar = assign(EMPTY_HOTBAR, 0, 'camel')
    expect(await saveHotbar(bar, impl)).toEqual({ ok: true })
    expect(seen[0].url).toBe('/auth/hotbar')
    expect(seen[0].init?.method).toBe('PUT')
    expect(JSON.parse(seen[0].init?.body as string)).toEqual({ hotbar: bar })
    expect(await saveHotbar(bar, answer(500).impl)).toEqual({
      ok: false,
      limited: false,
      error: copy('auth.hotbar_failed'),
    })
    expect(
      await saveHotbar(bar, answer(429, { error: 'Slow down.' }).impl)
    ).toEqual({ ok: false, limited: true, error: 'Slow down.' })
    expect(await saveHotbar(bar, down)).toEqual({
      ok: false,
      error: copy('auth.unreachable'),
    })
  })
})

describe('renameUsername', () => {
  it('puts the new name, and tells taken and limited apart', async () => {
    const { impl, seen } = answer(200, { username: 'Gron_Made' })
    expect(await renameUsername('Gron_Made', impl)).toEqual({ ok: true })
    expect(seen[0]).toMatchObject({ url: '/auth/username' })
    expect(seen[0].init?.method).toBe('PUT')
    expect(seen[0].init?.body).toBe('{"username":"Gron_Made"}')
    expect(
      await renameUsername('x', answer(409, { error: 'Taken' }).impl)
    ).toEqual({ ok: false, taken: true, error: 'Taken' })
    expect(
      await renameUsername('x', answer(429, { error: 'Slow' }).impl)
    ).toEqual({ ok: false, limited: true, error: 'Slow' })
    expect(
      await renameUsername('x', answer(400, { error: 'Bad' }).impl)
    ).toEqual({ ok: false, limited: false, error: 'Bad' })
    expect(await renameUsername('x', down)).toMatchObject({ ok: false })
  })
})

describe('setUsername', () => {
  it('posts the username and tells a taken one apart', async () => {
    const { impl, seen } = answer(200, { username: 'Dave' })
    expect(await setUsername('Dave', impl)).toEqual({ ok: true })
    expect(seen[0].init?.body).toBe('{"username":"Dave"}')
    expect(
      await setUsername('Dave', answer(409, { error: 'Taken' }).impl)
    ).toEqual({ ok: false, taken: true, error: 'Taken' })
    expect(await setUsername('Dave', answer(400, 'not json').impl)).toEqual({
      ok: false,
      error: copy('auth.username_failed'),
    })
    expect(await setUsername('Dave', down)).toMatchObject({ ok: false })
  })
})

describe('usernameAvailable', () => {
  it('asks by the encoded handle', async () => {
    const { impl, seen } = answer(200, { available: true })
    expect(await usernameAvailable('a b', impl)).toEqual({ available: true })
    expect(seen[0].url).toBe('/auth/username/a%20b/available')
    expect(await usernameAvailable('x', down)).toBeNull()
    expect(await usernameAvailable('x', answer(500).impl)).toBeNull()
  })

  it('tells a rate limit apart from an unreachable valley', async () => {
    expect(await usernameAvailable('x', answer(429).impl)).toEqual({
      available: false,
      reason: 'limited',
    })
  })
})

describe('unlinkProvider', () => {
  it('deletes the provider and reports a refusal', async () => {
    const { impl, seen } = answer(200, { ok: true })
    expect(await unlinkProvider('github', impl)).toEqual({ ok: true })
    expect(seen[0].url).toBe('/auth/providers/github')
    expect(seen[0].init?.method).toBe('DELETE')
    expect(
      await unlinkProvider('github', answer(400, { error: 'Last one' }).impl)
    ).toEqual({ ok: false, error: 'Last one' })
    expect(await unlinkProvider('github', down)).toEqual({
      ok: false,
      error: copy('auth.unreachable'),
    })
  })
})

describe('signOut', () => {
  it('posts, and shrugs off a failure', async () => {
    const { impl, seen } = answer(200, { ok: true })
    await signOut(impl)
    expect(seen[0]).toMatchObject({ url: '/auth/logout' })
    await expect(signOut(down)).resolves.toBeUndefined()
  })
})
