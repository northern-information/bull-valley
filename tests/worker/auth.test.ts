import { describe, expect, it } from 'vitest'
import { COOKIE, parseCookies } from '../../src/cookies.ts'
import { copy } from '../../src/copy.ts'
import { assign, EMPTY_HOTBAR } from '../../src/hotbar.ts'
import { MemoryAccountStore } from '../../worker/accounts.ts'
import { handleAuth, identityFor } from '../../worker/auth.ts'
import { DEV_JWT_SECRET } from '../../worker/env.ts'
import { OAUTH } from '../../worker/oauth.ts'
import { ACCESS_TTL, Tokens } from '../../worker/tokens.ts'
import type { MeResponse } from '../../src/account.ts'
import type { WorkerEnv } from '../../worker/env.ts'
import type { Limiter, Tier } from '../../worker/ratelimit.ts'

const SECRET = 'auth-test-secret'
const T0 = Date.parse('2026-10-03T12:00:00Z')
const PROD = 'https://bvsw.net'
const DEV = 'http://localhost:5174'
// The magic word a new account takes.
const WORD = { magicWord: 'berries' }

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    APP_ORIGIN: PROD,
    JWT_SECRET: SECRET,
    GITHUB_CLIENT_ID: 'gh-id',
    GITHUB_CLIENT_SECRET: 'gh-secret',
    DB: {} as unknown as D1Database,
    // The limits are injected per call (`limit`); these are never reached.
    AUTH_STRICT: {} as unknown as RateLimit,
    AUTH_LOOSE: {} as unknown as RateLimit,
    VALLEY: {} as unknown as Env['VALLEY'],
    ASSETS: {} as unknown as Fetcher,
    ...overrides,
  }
}

// A provider that hands out a token for any code and one fixed profile.
function provider(profile: Record<string, unknown>) {
  const calls: { url: string; body: Record<string, string> }[] = []
  const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const body = Object.fromEntries(
      new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
    )
    calls.push({ url, body })
    if (url === OAUTH.github.tokenUrl) {
      return Promise.resolve(Response.json({ access_token: 'gh-token' }))
    }
    if (url === OAUTH.github.profileUrl) {
      return Promise.resolve(Response.json(profile))
    }
    return Promise.resolve(new Response('nope', { status: 404 }))
  }) as typeof fetch
  return { impl, calls }
}

// A browser's cookie jar across a sequence of requests.
class Jar {
  cookies: Record<string, string> = {}
  header(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('; ')
  }
  take(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';')
      const parsed = parseCookies(pair)
      const [name, value] = Object.entries(parsed)[0]
      const gone = attrs.some((a) => a.trim() === 'Max-Age=0')
      if (gone) delete this.cookies[name]
      else this.cookies[name] = value
    }
  }
}

interface Call {
  method?: string
  origin?: string
  jar?: Jar
  body?: unknown
  headers?: Record<string, string>
  env?: WorkerEnv
  store?: MemoryAccountStore
  fetch?: typeof fetch
  now?: number
  limit?: Limiter
}

const store = new MemoryAccountStore()

async function call(path: string, opts: Call = {}) {
  const jar = opts.jar ?? new Jar()
  const headers: Record<string, string> = { ...opts.headers }
  const cookie = jar.header()
  if (cookie) headers.Cookie = cookie
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const req = new Request(`${opts.origin ?? PROD}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const res = await handleAuth(req, opts.env ?? env(), {
    store: opts.store ?? store,
    fetch: opts.fetch ?? (() => Promise.reject(new Error('no fetch'))),
    now: () => opts.now ?? T0,
    limit: opts.limit,
  })
  jar.take(res)
  return { res, jar, location: res.headers.get('Location') }
}

// A GitHub sign-in round trip for a profile, landing with the given flag.
async function signIn(
  jar: Jar,
  profile: Record<string, unknown>,
  s = store,
  redirect?: string
) {
  const gh = provider(profile)
  const login = await call(
    `/auth/github/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`,
    { jar, store: s }
  )
  const state = new URL(login.location ?? '').searchParams.get('state')
  const back = await call(`/auth/github/callback?code=c&state=${state}`, {
    jar,
    store: s,
    fetch: gh.impl,
  })
  return { ...back, gh }
}

const me = async (jar: Jar, s = store) =>
  (await call('/auth/me', { jar, store: s })).res.json<MeResponse>()

describe('providers', () => {
  it('offers the configured providers, and dev on a dev server', async () => {
    const { res } = await call('/auth/providers')
    expect(await res.json()).toEqual({ providers: ['github'] })
    const dev = await call('/auth/providers', { origin: DEV })
    expect(await dev.res.json()).toEqual({ providers: ['dev', 'github'] })
    const none = await call('/auth/providers', {
      env: env({ GITHUB_CLIENT_ID: undefined }),
    })
    expect(await none.res.json()).toEqual({ providers: [] })
  })

  it('refuses to serve accounts in production without a secret', async () => {
    const { res } = await call('/auth/providers', {
      env: env({ JWT_SECRET: undefined }),
    })
    expect(res.status).toBe(503)
    const dev = await call('/auth/providers', {
      origin: DEV,
      env: env({ JWT_SECRET: undefined }),
    })
    expect(dev.res.status).toBe(200)
  })

  it('is 404 for anything it does not know', async () => {
    expect((await call('/auth/facebook/login')).res.status).toBe(404)
    expect((await call('/auth/nothing')).res.status).toBe(404)
    expect((await call('/auth/me', { method: 'POST' })).res.status).toBe(404)
    // The dev provider does not exist in production.
    expect((await call('/auth/dev/login')).res.status).toBe(404)
    expect((await call('/auth/dev/form')).res.status).toBe(404)
  })
})

describe('login', () => {
  it('sends the browser to the provider with state and PKCE in cookies', async () => {
    const { res, jar, location } = await call('/auth/github/login')
    expect(res.status).toBe(302)
    const url = new URL(location ?? '')
    expect(url.origin + url.pathname).toBe(OAUTH.github.authorizeUrl)
    expect(url.searchParams.get('client_id')).toBe('gh-id')
    expect(url.searchParams.get('redirect_uri')).toBe(
      `${PROD}/auth/github/callback`
    )
    expect(url.searchParams.get('state')).toBe(jar.cookies[COOKIE.state])
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(jar.cookies[COOKIE.pkce]).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(jar.cookies[COOKIE.redirect]).toBeUndefined()
    // Production cookies are Secure; a dev server's are not.
    expect(res.headers.getSetCookie()[0]).toContain('Secure')
    const dev = await call('/auth/github/login', { origin: DEV })
    expect(dev.res.headers.getSetCookie()[0]).not.toContain('Secure')
    expect(new URL(dev.location ?? '').searchParams.get('redirect_uri')).toBe(
      `${DEV}/auth/github/callback`
    )
  })

  it('remembers an allowed redirect and ignores others', async () => {
    const kept = await call('/auth/github/login?redirect=%2F%3Fvalley%3Da')
    expect(kept.jar.cookies[COOKIE.redirect]).toBe('/?valley=a')
    const dropped = await call('/auth/github/login?redirect=%2Fakashic')
    expect(dropped.jar.cookies[COOKIE.redirect]).toBeUndefined()
  })

  it('is 503 for a provider with no credentials', async () => {
    const { res } = await call('/auth/google/login')
    expect(res.status).toBe(503)
  })
})

describe('callback', () => {
  it('refuses a missing code or a state that does not match', async () => {
    const jar = new Jar()
    await call('/auth/github/login', { jar })
    expect(
      (await call('/auth/github/callback?state=x', { jar })).res.status
    ).toBe(400)
    expect(
      (await call('/auth/github/callback?code=c&state=wrong', { jar })).res
        .status
    ).toBe(400)
    const fresh = await call('/auth/github/callback?code=c&state=x')
    expect(fresh.res.status).toBe(400)
  })

  it('lands with the provider error', async () => {
    const { res, location } = await call(
      '/auth/github/callback?error=access_denied'
    )
    expect(res.status).toBe(302)
    expect(location).toBe(`${PROD}/?auth_error=access_denied`)
  })

  it('holds a new raider as pending until the gates are passed', async () => {
    const s = new MemoryAccountStore()
    const jar = new Jar()
    const { location, gh } = await signIn(jar, { id: 1, login: 'newbie' }, s)
    expect(location).toBe(`${PROD}/?auth=pending_signup`)
    expect(jar.cookies[COOKIE.pending]).toBeDefined()
    expect(jar.cookies[COOKIE.token]).toBeUndefined()
    expect(jar.cookies[COOKIE.state]).toBeUndefined()
    expect(jar.cookies[COOKIE.pkce]).toBeUndefined()
    expect(s.accounts.size).toBe(0)
    // The exchange carried the verifier the login set.
    expect(gh.calls[0].body.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(gh.calls[0].body.redirect_uri).toBe(`${PROD}/auth/github/callback`)
    expect(await me(jar, s)).toEqual({
      account: null,
      pending: { provider: 'github', displayName: 'newbie', avatarUrl: null },
    })
  })

  it('signs a returning raider straight in and lands where asked', async () => {
    const s = new MemoryAccountStore()
    const first = new Jar()
    await signIn(first, { id: 7, login: 'ret' }, s)
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar: first,
      store: s,
    })
    const again = new Jar()
    const { location } = await signIn(
      again,
      { id: 7, login: 'ret', name: 'Returning', avatar_url: 'https://a/b.png' },
      s,
      '/?valley=a'
    )
    expect(location).toBe(`${PROD}/?valley=a&auth=success`)
    expect(again.cookies[COOKIE.token]).toBeDefined()
    expect(again.cookies[COOKIE.refresh]).toBeDefined()
    expect(again.cookies[COOKIE.redirect]).toBeUndefined()
    const who = await me(again, s)
    expect(who.account?.displayName).toBe('Returning')
    expect(who.account?.avatarUrl).toBe('https://a/b.png')
    expect(who.account?.providers).toHaveLength(1)
  })

  it('lands with an error when the provider fails', async () => {
    const jar = new Jar()
    const login = await call('/auth/github/login', { jar })
    const state = new URL(login.location ?? '').searchParams.get('state')
    const broken = (() =>
      Promise.resolve(new Response('down', { status: 502 }))) as typeof fetch
    const { location } = await call(
      `/auth/github/callback?code=c&state=${state}`,
      { jar, fetch: broken }
    )
    const landed = new URL(location ?? '')
    expect(landed.origin + landed.pathname).toBe(`${PROD}/`)
    expect(landed.searchParams.get('auth_error')).toBe(
      copy('auth.provider_failed', { provider: 'GitHub' })
    )
    expect(jar.cookies[COOKIE.state]).toBeUndefined()
  })
})

describe('confirm-signup and username', () => {
  it('creates the account, signs in, and takes a username once', async () => {
    const s = new MemoryAccountStore()
    const jar = new Jar()
    await signIn(jar, { id: 2, login: 'two' }, s)
    expect(
      (await call('/auth/confirm-signup', { body: WORD, method: 'POST' })).res
        .status
    ).toBe(401)
    const confirm = await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar,
      store: s,
    })
    expect(confirm.res.status).toBe(200)
    expect(jar.cookies[COOKIE.pending]).toBeUndefined()
    expect(jar.cookies[COOKIE.token]).toBeDefined()
    expect(s.accounts.size).toBe(1)
    const who = await me(jar, s)
    expect(who.account?.username).toBeNull()
    expect(who.pending).toBeNull()
    // Not a raider the valley lets in yet.
    const noName = new Request(`${PROD}/ws`, {
      headers: { Cookie: jar.header() },
    })
    expect(await identityFor(noName, env(), () => T0)).toBeNull()

    const bad = await call('/auth/username', {
      method: 'POST',
      jar,
      store: s,
      body: { username: 'no spaces' },
    })
    expect(bad.res.status).toBe(400)
    const ok = await call('/auth/username', {
      method: 'POST',
      jar,
      store: s,
      body: { username: 'Dave' },
    })
    expect(ok.res.status).toBe(200)
    expect((await me(jar, s)).account?.username).toBe('Dave')
    // The reissued access cookie now names the raider.
    const named = new Request(`${PROD}/ws`, {
      headers: { Cookie: jar.header() },
    })
    expect(await identityFor(named, env(), () => T0)).toEqual({
      account: who.account?.accountId,
      name: 'Dave',
    })
    const twice = await call('/auth/username', {
      method: 'POST',
      jar,
      store: s,
      body: { username: 'Other' },
    })
    expect(twice.res.status).toBe(400)

    const other = new Jar()
    await signIn(other, { id: 3, login: 'three' }, s)
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar: other,
      store: s,
    })
    const clash = await call('/auth/username', {
      method: 'POST',
      jar: other,
      store: s,
      body: { username: 'DAVE' },
    })
    expect(clash.res.status).toBe(409)
  })

  it('creates the account only for the magic word', async () => {
    const s = new MemoryAccountStore()
    const jar = new Jar()
    await signIn(jar, { id: 6, login: 'six' }, s)
    for (const body of [undefined, {}, { magicWord: 'cabbages' }]) {
      const wrong = await call('/auth/confirm-signup', {
        method: 'POST',
        jar,
        store: s,
        body,
      })
      expect(wrong.res.status).toBe(403)
      expect(await wrong.res.json()).toEqual({
        error: copy('auth.magic_word_wrong'),
      })
    }
    // A wrong word keeps the pending signup, for another try.
    expect(jar.cookies[COOKIE.pending]).toBeDefined()
    expect(s.accounts.size).toBe(0)
    const right = await call('/auth/confirm-signup', {
      method: 'POST',
      jar,
      store: s,
      body: { magicWord: '  Berries ' },
    })
    expect(right.res.status).toBe(200)
    expect(s.accounts.size).toBe(1)
  })

  it('confirming twice (two tabs) lands on the same account', async () => {
    const s = new MemoryAccountStore()
    const jar = new Jar()
    await signIn(jar, { id: 4, login: 'four' }, s)
    const pending = jar.cookies[COOKIE.pending]
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar,
      store: s,
    })
    const tab2 = new Jar()
    tab2.cookies[COOKIE.pending] = pending
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar: tab2,
      store: s,
    })
    expect(s.accounts.size).toBe(1)
  })

  it('a confirm that loses the race to the insert signs in to the winner', async () => {
    const s = new MemoryAccountStore()
    const jar = new Jar()
    await signIn(jar, { id: 5, login: 'five' }, s)
    const pending = jar.cookies[COOKIE.pending]
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar,
      store: s,
    })
    const [winner] = s.accounts.keys()
    // The second tab looks before the first one's insert lands.
    const find = s.findByProvider.bind(s)
    let misses = 1
    s.findByProvider = (key) =>
      misses-- > 0 ? Promise.resolve(null) : find(key)
    const tab2 = new Jar()
    tab2.cookies[COOKIE.pending] = pending
    const { res } = await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar: tab2,
      store: s,
    })
    expect(res.status).toBe(200)
    expect(s.accounts.size).toBe(1)
    const body = await res.json<{ account: { accountId: string } }>()
    expect(body.account).toMatchObject({ accountId: winner })
  })

  it('changes a username at Gron, and the session names the new one', async () => {
    const s = new MemoryAccountStore()
    const jar = new Jar()
    await signIn(jar, { id: 41, login: 'fortyone' }, s)
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar,
      store: s,
    })
    await call('/auth/username', {
      method: 'POST',
      jar,
      store: s,
      body: { username: 'First' },
    })
    const other = new Jar()
    await signIn(other, { id: 42, login: 'fortytwo' }, s)
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar: other,
      store: s,
    })
    await call('/auth/username', {
      method: 'POST',
      jar: other,
      store: s,
      body: { username: 'Taken' },
    })
    const put = (username: string) =>
      call('/auth/username', {
        method: 'PUT',
        jar,
        store: s,
        body: { username },
      })
    expect((await put('taken')).res.status).toBe(409)
    expect((await put('no spaces')).res.status).toBe(400)
    expect((await put('Second')).res.status).toBe(200)
    expect((await me(jar, s)).account?.username).toBe('Second')
    const upgrade = new Request(`${PROD}/ws`, {
      headers: { Cookie: jar.header() },
    })
    expect((await identityFor(upgrade, env(), () => T0))?.name).toBe('Second')
    expect(
      (
        await call('/auth/username', {
          method: 'PUT',
          store: s,
          body: { username: 'Nobody' },
        })
      ).res.status
    ).toBe(401)
  })

  it('keeps the character and finish on the account', async () => {
    const s = new MemoryAccountStore()
    const jar = new Jar()
    await signIn(jar, { id: 43, login: 'fortythree' }, s)
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar,
      store: s,
    })
    expect((await me(jar, s)).account?.look).toEqual({
      outfit: null,
      finish: null,
    })
    const put = (body: unknown, j: Jar | undefined = jar) =>
      call('/auth/look', { method: 'PUT', jar: j, store: s, body })
    expect((await put({ outfit: 'church', finish: 'cherry' })).res.status).toBe(
      200
    )
    expect((await me(jar, s)).account?.look).toEqual({
      outfit: 'church',
      finish: 'cherry',
    })
    // Off the roster, out of the table, or missing: refused, nothing moves.
    expect((await put({ outfit: 'marx', finish: 'cherry' })).res.status).toBe(
      400
    )
    expect((await put({ outfit: 'church', finish: 'plaid' })).res.status).toBe(
      400
    )
    expect((await put({ outfit: 'church' })).res.status).toBe(400)
    expect((await me(jar, s)).account?.look.outfit).toBe('church')
    expect(
      (await put({ outfit: 'church', finish: 'cherry' }, new Jar())).res.status
    ).toBe(401)
  })

  it('keeps the hotbar on the account', async () => {
    const s = new MemoryAccountStore()
    const jar = new Jar()
    await signIn(jar, { id: 44, login: 'fortyfour' }, s)
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar,
      store: s,
    })
    expect((await me(jar, s)).account?.hotbar).toEqual(EMPTY_HOTBAR)
    const put = (body: unknown, j: Jar | undefined = jar) =>
      call('/auth/hotbar', { method: 'PUT', jar: j, store: s, body })
    const bar = assign(EMPTY_HOTBAR, 2, 'camel')
    expect((await put({ hotbar: bar })).res.status).toBe(200)
    expect((await me(jar, s)).account?.hotbar).toEqual(bar)
    // An unknown item, the wrong length, or missing: refused, nothing moves.
    expect(
      (await put({ hotbar: assign(EMPTY_HOTBAR, 0, 'anvil') })).res.status
    ).toBe(400)
    expect((await put({ hotbar: ['camel'] })).res.status).toBe(400)
    expect((await put({})).res.status).toBe(400)
    expect((await me(jar, s)).account?.hotbar).toEqual(bar)
    expect((await put({ hotbar: bar }, new Jar())).res.status).toBe(401)
  })

  it('answers whether a handle is free', async () => {
    const s = new MemoryAccountStore()
    const jar = new Jar()
    await signIn(jar, { id: 5, login: 'five' }, s)
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar,
      store: s,
    })
    await call('/auth/username', {
      method: 'POST',
      jar,
      store: s,
      body: { username: 'Taken' },
    })
    const ask = async (name: string) =>
      (await call(`/auth/username/${name}/available`, { store: s })).res.json()
    expect(await ask('taken')).toEqual({ available: false, reason: 'taken' })
    expect(await ask('ab')).toEqual({ available: false, reason: 'invalid' })
    expect(await ask('Free_1')).toEqual({ available: true })
  })

  it('requires a session to choose a username', async () => {
    const { res } = await call('/auth/username', {
      method: 'POST',
      body: { username: 'Dave' },
    })
    expect(res.status).toBe(401)
  })
})

describe('session', () => {
  async function signedIn(s = new MemoryAccountStore()) {
    const jar = new Jar()
    await signIn(jar, { id: 6, login: 'six' }, s)
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar,
      store: s,
    })
    return { jar, s }
  }

  it('is signed out by default, without an error status', async () => {
    const { res } = await call('/auth/me')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ account: null, pending: null })
  })

  it('slides the session on the refresh cookie when the access cookie lapses', async () => {
    const { jar, s } = await signedIn()
    const later = T0 + (ACCESS_TTL + 60) * 1000
    const stale = new Tokens(SECRET, () => later)
    expect(await stale.verifyAccess(jar.cookies[COOKIE.token])).toBeNull()
    const { res } = await call('/auth/me', { jar, store: s, now: later })
    const body = await res.json<MeResponse>()
    expect(body.account?.accountId).toBeDefined()
    expect(await stale.verifyAccess(jar.cookies[COOKIE.token])).not.toBeNull()
  })

  it('refreshes on request and says so when it cannot', async () => {
    const { jar, s } = await signedIn()
    delete jar.cookies[COOKIE.token]
    const ok = await call('/auth/refresh', { method: 'POST', jar, store: s })
    expect(await ok.res.json()).toEqual({ ok: true })
    expect(jar.cookies[COOKIE.token]).toBeDefined()
    const none = await call('/auth/refresh', { method: 'POST' })
    expect(none.res.status).toBe(200)
    expect(await none.res.json()).toEqual({ ok: false })
    // An account that no longer exists is signed out.
    const gone = new Jar()
    gone.cookies[COOKIE.refresh] = jar.cookies[COOKIE.refresh]
    const missing = await call('/auth/refresh', {
      method: 'POST',
      jar: gone,
      store: new MemoryAccountStore(),
    })
    expect(await missing.res.json()).toEqual({ ok: false })
    expect(gone.cookies[COOKIE.refresh]).toBeUndefined()
  })

  it('signs out by clearing the cookies', async () => {
    const { jar, s } = await signedIn()
    await call('/auth/logout', { method: 'POST', jar, store: s })
    expect(jar.cookies).toEqual({})
    expect(await me(jar, s)).toEqual({ account: null, pending: null })
  })

  it('refuses a mutation from another origin', async () => {
    const { res } = await call('/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    })
    expect(res.status).toBe(403)
    const same = await call('/auth/logout', {
      method: 'POST',
      headers: { Origin: PROD },
    })
    expect(same.res.status).toBe(200)
  })
})

describe('linking', () => {
  async function withAccount(id: number, s: MemoryAccountStore) {
    const jar = new Jar()
    await signIn(jar, { id, login: `user${id}` }, s)
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar,
      store: s,
    })
    return jar
  }

  // A link round trip through a second GitHub identity (the only provider
  // with credentials in these tests).
  async function link(
    jar: Jar,
    s: MemoryAccountStore,
    profile: Record<string, unknown>
  ) {
    const start = await call(
      '/auth/link/github/login?redirect=%2Fauth-done.html',
      {
        jar,
        store: s,
      }
    )
    expect(start.res.status).toBe(302)
    const state = new URL(start.location ?? '').searchParams.get('state')
    return call(`/auth/github/callback?code=c&state=${state}`, {
      jar,
      store: s,
      fetch: provider(profile).impl,
    })
  }

  it('needs a session', async () => {
    expect((await call('/auth/link/github/login')).res.status).toBe(401)
    expect(
      (await call('/auth/providers/github', { method: 'DELETE' })).res.status
    ).toBe(401)
  })

  it('links another identity to the signed-in account and lands on the popup page', async () => {
    const s = new MemoryAccountStore()
    const jar = await withAccount(10, s)
    expect(jar.cookies[COOKIE.link]).toBeUndefined()
    const { location } = await link(jar, s, { id: 11, login: 'second' })
    expect(location).toBe(`${PROD}/auth-done.html?auth=linked`)
    expect(jar.cookies[COOKIE.link]).toBeUndefined()
    const who = await me(jar, s)
    expect(who.account?.providers.map((p) => p.displayName)).toEqual([
      'user10',
      'second',
    ])
  })

  it('refuses an identity another raider already uses', async () => {
    const s = new MemoryAccountStore()
    const a = await withAccount(12, s)
    await withAccount(13, s)
    const { location } = await link(a, s, { id: 13, login: 'user13' })
    expect(location).toContain('auth_error=')
    expect((await me(a, s)).account?.providers).toHaveLength(1)
  })

  it('treats a link intent that does not match the session as a sign-in', async () => {
    const s = new MemoryAccountStore()
    const jar = await withAccount(14, s)
    const start = await call('/auth/link/github/login', { jar, store: s })
    const state = new URL(start.location ?? '').searchParams.get('state')
    // The session changed hands before the provider came back.
    const other = await withAccount(15, s)
    jar.cookies[COOKIE.token] = other.cookies[COOKIE.token]
    const { location } = await call(
      `/auth/github/callback?code=c&state=${state}`,
      { jar, store: s, fetch: provider({ id: 16, login: 'sixteen' }).impl }
    )
    expect(location).toBe(`${PROD}/?auth=pending_signup`)
  })

  it('signs one raider in under one username through all three providers', async () => {
    const s = new MemoryAccountStore()
    const all = env({
      GOOGLE_CLIENT_ID: 'g-id',
      GOOGLE_CLIENT_SECRET: 'g-secret',
      DISCORD_CLIENT_ID: 'd-id',
      DISCORD_CLIENT_SECRET: 'd-secret',
    })
    const profiles = {
      github: { id: 21, login: 'octo' },
      google: { id: 'g-21', name: 'Goo' },
      discord: { id: 'd-21', username: 'dis' },
    } as const
    // Any provider's token and profile, for the one being asked.
    const fetchAll = ((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      for (const [name, spec] of Object.entries(OAUTH)) {
        if (url === spec.tokenUrl) {
          return Promise.resolve(Response.json({ access_token: 't' }))
        }
        if (url === spec.profileUrl) {
          return Promise.resolve(
            Response.json(profiles[name as keyof typeof profiles])
          )
        }
      }
      return Promise.resolve(new Response('nope', { status: 404 }))
    }) as typeof fetch
    // A round trip through a provider: a sign-in, or a link from `jar`.
    const trip = async (
      jar: Jar,
      name: keyof typeof profiles,
      linking = false
    ) => {
      const start = await call(
        linking ? `/auth/link/${name}/login` : `/auth/${name}/login`,
        { jar, store: s, env: all }
      )
      const state = new URL(start.location ?? '').searchParams.get('state')
      return call(`/auth/${name}/callback?code=c&state=${state}`, {
        jar,
        store: s,
        env: all,
        fetch: fetchAll,
      })
    }

    const jar = new Jar()
    await trip(jar, 'github')
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar,
      store: s,
      env: all,
    })
    await call('/auth/username', {
      method: 'POST',
      jar,
      store: s,
      env: all,
      body: { username: 'Triple' },
    })
    expect((await trip(jar, 'google', true)).location).toContain('auth=linked')
    expect((await trip(jar, 'discord', true)).location).toContain('auth=linked')
    const accountId = (await me(jar, s)).account?.accountId
    expect(
      (await me(jar, s)).account?.providers.map((p) => p.provider)
    ).toEqual(['github', 'google', 'discord'])

    // A fresh browser through any of the three lands on the same raider,
    // with no magic word asked: only a new account takes it.
    for (const name of ['github', 'google', 'discord'] as const) {
      const fresh = new Jar()
      expect((await trip(fresh, name)).location).toBe(`${PROD}/?auth=success`)
      const who = await me(fresh, s)
      expect(who.account?.accountId).toBe(accountId)
      expect(who.account?.username).toBe('Triple')
    }
    expect(s.accounts.size).toBe(1)
  })

  it('unlinks any provider but the last', async () => {
    const s = new MemoryAccountStore()
    const jar = await withAccount(17, s)
    const last = await call('/auth/providers/github', {
      method: 'DELETE',
      jar,
      store: s,
    })
    expect(last.res.status).toBe(400)
    const unknown = await call('/auth/providers/facebook', {
      method: 'DELETE',
      jar,
      store: s,
    })
    expect(unknown.res.status).toBe(404)
    // Link a dev identity (dev server) and unlink the github one.
    const dev = await call(
      '/auth/link/dev/login?userId=buddy&redirect=%2Fauth-done.html',
      { jar, store: s, origin: DEV }
    )
    expect(dev.location).toBe(`${DEV}/auth-done.html?auth=linked`)
    // With two linked, a provider that is not one of them is a 404.
    const notLinked = await call('/auth/providers/google', {
      method: 'DELETE',
      jar,
      store: s,
    })
    expect(notLinked.res.status).toBe(404)
    const ok = await call('/auth/providers/github', {
      method: 'DELETE',
      jar,
      store: s,
    })
    expect(ok.res.status).toBe(200)
    const who = await me(jar, s)
    expect(who.account?.providers.map((p) => p.provider)).toEqual(['dev'])
    expect(who.account?.displayName).toBe('Dev Raider 2')
  })
})

describe('dev provider', () => {
  it('serves the form and walks a new raider through the gates', async () => {
    const s = new MemoryAccountStore()
    const form = await call('/auth/dev/form?redirect=%2F%3Fvalley%3Da', {
      origin: DEV,
    })
    expect(form.res.headers.get('Content-Type')).toContain('text/html')
    expect(await form.res.text()).toContain(
      'name="redirect" value="/?valley=a"'
    )
    const jar = new Jar()
    const { location } = await call(
      '/auth/dev/login?userId=newdev&redirect=%2F%3Fvalley%3Da',
      { jar, store: s, origin: DEV }
    )
    expect(location).toBe(`${DEV}/?valley=a&auth=pending_signup`)
    expect(s.accounts.size).toBe(0)
    const who = await me(jar, s)
    expect(who.pending?.provider).toBe('dev')
    // Dev cookies verify with the dev secret when none is configured.
    const bare = await call('/auth/me', {
      jar,
      store: s,
      origin: DEV,
      env: env({ JWT_SECRET: undefined }),
    })
    expect(bare.res.status).toBe(200)
    expect(new Tokens(DEV_JWT_SECRET)).toBeDefined()
  })

  it('arrives signed in with a username when asked to accept the gates', async () => {
    const s = new MemoryAccountStore()
    const jar = new Jar()
    const { location } = await call(
      '/auth/dev/login?userId=quick&username=Quick&accept=1&redirect=%2F%3FskipSplash',
      { jar, store: s, origin: DEV }
    )
    expect(location).toBe(`${DEV}/?skipSplash=&auth=success`)
    const who = await me(jar, s)
    expect(who.account?.username).toBe('Quick')
    const back = await call('/auth/dev/login?userId=quick', {
      jar: new Jar(),
      store: s,
      origin: DEV,
    })
    expect(back.location).toBe(`${DEV}/?auth=success`)
    expect(s.accounts.size).toBe(1)
    // A taken username leaves the account unnamed rather than failing.
    const clash = new Jar()
    await call('/auth/dev/login?userId=other&username=quick&accept=1', {
      jar: clash,
      store: s,
      origin: DEV,
    })
    expect((await me(clash, s)).account?.username).toBeNull()
  })
})

describe('rate limits', () => {
  // A limiter that records what it was asked and answers `allow`.
  function recorder(allow: boolean) {
    const asked: { tier: Tier; key: string }[] = []
    const limit: Limiter = (tier, key) => {
      asked.push({ tier, key })
      return Promise.resolve(allow)
    }
    return { limit, asked }
  }

  it('counts a request against the most specific identity it has', async () => {
    const s = new MemoryAccountStore()
    const { limit, asked } = recorder(true)
    // Nobody yet: the client address.
    await call('/auth/username/Dave/available', {
      store: s,
      limit,
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    })
    expect(asked.at(-1)).toEqual({ tier: 'loose', key: 'ip:203.0.113.7' })
    // A pending signup: its provider identity.
    const jar = new Jar()
    await signIn(jar, { id: 31, login: 'thirtyone' }, s)
    await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      jar,
      store: s,
      limit,
    })
    expect(asked.at(-1)).toEqual({ tier: 'strict', key: 'pending:github:31' })
    // Signed in: the account.
    const accountId = (await me(jar, s)).account?.accountId
    await call('/auth/username', {
      method: 'POST',
      jar,
      store: s,
      limit,
      body: { username: 'ThirtyOne' },
    })
    expect(asked.at(-1)).toEqual({
      tier: 'strict',
      key: `account:${accountId}`,
    })
    // A lapsed access cookie still counts against the account it refreshes.
    delete jar.cookies[COOKIE.token]
    await call('/auth/refresh', { method: 'POST', jar, store: s, limit })
    expect(asked.at(-1)).toEqual({
      tier: 'loose',
      key: `account:${accountId}`,
    })
  })

  it('answers a limited call from the page with a 429 it can show', async () => {
    const { limit } = recorder(false)
    const confirm = await call('/auth/confirm-signup', {
      body: WORD,
      method: 'POST',
      limit,
    })
    expect(confirm.res.status).toBe(429)
    expect(confirm.res.headers.get('Retry-After')).toBe('60')
    expect(await confirm.res.json()).toEqual({
      error: copy('auth.limited'),
    })
    const check = await call('/auth/username/Dave/available', { limit })
    expect(check.res.status).toBe(429)
  })

  it('lands a limited sign-in back on the game with the message', async () => {
    const { limit } = recorder(false)
    const { res, location, jar } = await call(
      '/auth/github/login?redirect=%2F%3Fvalley%3Da',
      { limit }
    )
    expect(res.status).toBe(302)
    expect(location).toBe(
      `${PROD}/?valley=a&auth_error=Too+many+tries.+Wait+a+minute+and+try+again.`
    )
    // Nothing of a round trip was started.
    expect(jar.cookies[COOKIE.state]).toBeUndefined()
  })

  it('never limits reading, signing out, the callback, or the dev provider', async () => {
    const { limit, asked } = recorder(false)
    expect((await call('/auth/me', { limit })).res.status).toBe(200)
    expect((await call('/auth/providers', { limit })).res.status).toBe(200)
    expect(
      (await call('/auth/logout', { method: 'POST', limit })).res.status
    ).toBe(200)
    expect(
      (await call('/auth/github/callback?error=access_denied', { limit })).res
        .status
    ).toBe(302)
    const dev = await call('/auth/dev/login?userId=free', {
      origin: DEV,
      limit,
      store: new MemoryAccountStore(),
    })
    expect(dev.location).toBe(`${DEV}/?auth=pending_signup`)
    expect(asked).toEqual([])
  })
})
