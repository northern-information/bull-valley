// The /auth routes: sign in with a provider, confirm a new account through
// the age and terms gates, choose a username, keep the session fresh, link
// and unlink providers, sign out. Cookies are the session; the client
// never sees a token. Same origin as the game, so there is no CORS and the
// browser sends the cookies on the socket upgrade too (identityFor).
//
// GET  /auth/providers                      the providers this server offers
// GET  /auth/:provider/login                start a sign-in round trip
// GET  /auth/:provider/callback             the provider sends the browser back
// GET  /auth/me                             who is signed in (always 200)
// POST /auth/confirm-signup                 pass the gates; create the account
// POST /auth/username                       choose the username, once
// PUT  /auth/look                           the character and guitar finish
// GET  /auth/username/:username/available   is this handle free
// POST /auth/refresh                        a fresh access cookie (always 200)
// POST /auth/logout                         clear the session
// GET  /auth/link/:provider/login           link another provider (popup)
// DELETE /auth/providers/:provider          unlink one; never the last
// GET  /auth/dev/form, /auth/dev/login      dev server only: no secrets needed

import {
  AUTH_PATH,
  isOAuthProvider,
  isProvider,
  isValidUsername,
  landingUrl,
  OAUTH_PROVIDERS,
  PROVIDER_LABELS,
  validateRedirect,
} from '../src/account.ts'
import { isSelectable } from '../src/characters.ts'
import {
  clearCookie,
  COOKIE,
  parseCookies,
  serializeCookie,
} from '../src/cookies.ts'
import { copy } from '../src/copy.ts'
import { isFinish } from '../src/finishes.ts'
import { appOrigin, isDevHost, jwtSecret } from './env.ts'
import {
  authorizeUrl,
  credentials,
  exchangeCode,
  fetchProfile,
  pkceChallenge,
  providerKey,
  randomToken,
  sanitizeProfile,
} from './oauth.ts'
import {
  LIMITED_MESSAGE,
  RETRY_AFTER_SECONDS,
  tierFor,
  unlimited,
} from './ratelimit.ts'
import { ACCESS_TTL, PENDING_TTL, REFRESH_TTL, Tokens } from './tokens.ts'
import type {
  AccountWire,
  AuthReturn,
  MeResponse,
  Provider,
  ProvidersResponse,
} from '../src/account.ts'
import type { Account, AccountStore, LinkedProvider } from './accounts.ts'
import type { WorkerEnv } from './env.ts'
import type { Profile } from './oauth.ts'
import type { Limiter } from './ratelimit.ts'
import type { AccessClaims } from './tokens.ts'

// Set on the socket upgrade by the Worker once the access cookie verifies;
// ValleyDO reads them. Never taken from the client.
export const ACCOUNT_HEADER = 'x-bv-account'
export const NAME_HEADER = 'x-bv-name'

// How long a sign-in round trip may take.
const ROUND_TRIP_TTL = 5 * 60

export interface AuthDeps {
  store: AccountStore
  fetch: typeof fetch
  now?: () => number
  // The rate limits (worker/ratelimit.ts); none when left out.
  limit?: Limiter
}

export function isAuthPath(pathname: string): boolean {
  return pathname === AUTH_PATH || pathname.startsWith(`${AUTH_PATH}/`)
}

// The signed-in raider on a request, for the socket upgrade: the account
// and the username the valley shows. Null until a username is chosen.
export async function identityFor(
  request: Request,
  env: WorkerEnv,
  now: () => number = Date.now
): Promise<{ account: string; name: string } | null> {
  const url = new URL(request.url)
  const secret = jwtSecret(env, isDevHost(url.hostname))
  if (!secret) return null
  const cookies = parseCookies(request.headers.get('Cookie'))
  const claims = await new Tokens(secret, now).verifyAccess(
    cookies[COOKIE.token]
  )
  if (!claims?.username) return null
  return { account: claims.accountId, name: claims.username }
}

export async function handleAuth(
  request: Request,
  env: WorkerEnv,
  deps: AuthDeps
): Promise<Response> {
  const url = new URL(request.url)
  const dev = isDevHost(url.hostname)
  const secret = jwtSecret(env, dev)
  if (!secret) {
    return json({ error: copy('auth.not_configured') }, 503)
  }
  const handler = new AuthHandler(request, url, env, deps, secret, dev)
  return handler.route()
}

function json(body: object, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(JSON.stringify(body), { status, headers })
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location })
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(null, { status: 302, headers })
}

function html(body: string): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

class AuthHandler {
  private readonly request: Request
  private readonly url: URL
  private readonly env: WorkerEnv
  private readonly dev: boolean
  private readonly tokens: Tokens
  private readonly cookies: Record<string, string>
  private readonly secure: boolean
  private readonly origin: string
  private readonly store: AccountStore
  private readonly fetchImpl: typeof fetch
  private readonly limit: Limiter
  private readonly now: () => number

  constructor(
    request: Request,
    url: URL,
    env: WorkerEnv,
    deps: AuthDeps,
    secret: string,
    dev: boolean
  ) {
    this.request = request
    this.url = url
    this.env = env
    this.dev = dev
    this.now = deps.now ?? Date.now
    this.store = deps.store
    this.fetchImpl = deps.fetch
    this.limit = deps.limit ?? unlimited
    this.tokens = new Tokens(secret, this.now)
    this.cookies = parseCookies(request.headers.get('Cookie'))
    this.secure = url.protocol === 'https:'
    this.origin = appOrigin(env, url)
  }

  async route(): Promise<Response> {
    const { method } = this.request
    const parts = this.url.pathname
      .slice(AUTH_PATH.length)
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent)
    const [first, second, third] = parts

    // SameSite=Lax keeps the cookies off cross-site POSTs already; the
    // Origin check is belt and braces for the mutations.
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      const origin = this.request.headers.get('Origin')
      if (origin !== null && origin !== this.url.origin) {
        return json({ error: copy('auth.cross_origin') }, 403)
      }
    }

    const tier = tierFor(method, parts)
    if (tier && !(await this.limit(tier, await this.limitKey()))) {
      return this.limited(method)
    }

    if (parts.length === 1) {
      if (first === 'providers' && method === 'GET') return this.providers()
      if (first === 'me' && method === 'GET') return this.me()
      if (first === 'refresh' && method === 'POST') return this.refresh()
      if (first === 'logout' && method === 'POST') return this.logout()
      if (first === 'confirm-signup' && method === 'POST') {
        return this.confirmSignup()
      }
      if (first === 'username' && method === 'POST') return this.setUsername()
      if (first === 'username' && method === 'PUT') {
        return this.setUsername(true)
      }
      if (first === 'look' && method === 'PUT') return this.setLook()
    }
    if (parts.length === 3 && first === 'username' && third === 'available') {
      if (method === 'GET') return this.available(second)
    }
    if (parts.length === 3 && first === 'link' && third === 'login') {
      if (method === 'GET') return this.linkLogin(second)
    }
    if (parts.length === 2 && first === 'providers' && method === 'DELETE') {
      return this.unlink(second)
    }
    if (this.dev && parts.length === 2 && first === 'dev' && method === 'GET') {
      if (second === 'form') return this.devForm()
      if (second === 'login') return this.devLogin()
    }
    if (parts.length === 2 && method === 'GET' && isOAuthProvider(first)) {
      if (second === 'login') return this.login(first)
      if (second === 'callback') return this.callback(first)
    }
    return json({ error: 'Not found' }, 404)
  }

  // --- Rate limits -----------------------------------------------------------

  // Who a request counts against: the signed-in account, else the account
  // a refresh cookie names, else the provider identity of a pending signup,
  // else the client address. Addresses are shared behind carrier NAT, so
  // they are the last resort.
  private async limitKey(): Promise<string> {
    const claims = await this.access()
    if (claims) return `account:${claims.accountId}`
    const refreshed = await this.tokens.verifyRefresh(
      this.cookies[COOKIE.refresh]
    )
    if (refreshed) return `account:${refreshed}`
    const pending = await this.tokens.verifyPending(
      this.cookies[COOKIE.pending]
    )
    if (pending) {
      return `pending:${providerKey(pending.provider, pending.profile.id)}`
    }
    const ip = this.request.headers.get('CF-Connecting-IP') ?? 'unknown'
    return `ip:${ip}`
  }

  // A limited request: a page navigation (a sign-in or link starting)
  // lands back on the game with the message; a call from the page gets a
  // 429 it can show.
  private limited(method: string): Response {
    if (method === 'GET' && !this.url.pathname.includes('/username/')) {
      const back = validateRedirect(this.url.searchParams.get('redirect'))
      return redirect(landingUrl(this.origin, back, { error: LIMITED_MESSAGE }))
    }
    const res = json({ error: LIMITED_MESSAGE }, 429)
    res.headers.set('Retry-After', String(RETRY_AFTER_SECONDS))
    return res
  }

  // --- Reading the session -------------------------------------------------

  private cookie(name: string, value: string, maxAge: number): string {
    return serializeCookie(name, value, { maxAge, secure: this.secure })
  }

  private clear(name: string): string {
    return clearCookie(name, this.secure)
  }

  private async sessionCookies(account: Account): Promise<string[]> {
    return [
      this.cookie(
        COOKIE.token,
        await this.tokens.signAccess({
          accountId: account.accountId,
          username: account.username,
          role: account.role,
        }),
        ACCESS_TTL
      ),
      this.cookie(
        COOKIE.refresh,
        await this.tokens.signRefresh(account.accountId),
        REFRESH_TTL
      ),
    ]
  }

  private clearSession(): string[] {
    return [this.clear(COOKIE.token), this.clear(COOKIE.refresh)]
  }

  // The access claims, or null when the access cookie is missing or stale.
  private access(): Promise<AccessClaims | null> {
    return this.tokens.verifyAccess(this.cookies[COOKIE.token])
  }

  // The access claims, sliding the session on the refresh cookie when the
  // access cookie has lapsed. The second value is the cookies to set.
  private async session(): Promise<[AccessClaims | null, string[]]> {
    const claims = await this.access()
    if (claims) return [claims, []]
    const accountId = await this.tokens.verifyRefresh(
      this.cookies[COOKIE.refresh]
    )
    if (!accountId) return [null, []]
    const account = await this.store.get(accountId)
    if (!account) return [null, this.clearSession()]
    return [
      {
        accountId: account.accountId,
        username: account.username,
        role: account.role,
      },
      [
        this.cookie(
          COOKIE.token,
          await this.tokens.signAccess({
            accountId: account.accountId,
            username: account.username,
            role: account.role,
          }),
          ACCESS_TTL
        ),
      ],
    ]
  }

  private async accountWire(account: Account): Promise<AccountWire> {
    const providers = await this.store.providersOf(account.accountId)
    const primary =
      providers.find((p) => p.providerKey === account.primaryProvider) ??
      providers[0]
    return {
      accountId: account.accountId,
      username: account.username,
      role: account.role,
      displayName: primary?.displayName ?? 'Raider',
      avatarUrl: primary?.avatarUrl ?? null,
      providers: providers.map((p) => ({
        provider: p.provider,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        linkedAt: p.linkedAt,
      })),
      look: await this.store.lookOf(account.accountId),
    }
  }

  // --- Landing back on the game -------------------------------------------

  private landing(flag: { auth: AuthReturn } | { error: string }): Response {
    const kept = validateRedirect(this.cookies[COOKIE.redirect])
    return redirect(landingUrl(this.origin, kept, flag), [
      this.clear(COOKIE.redirect),
    ])
  }

  private redirectCookie(): string[] {
    const wanted = validateRedirect(this.url.searchParams.get('redirect'))
    return wanted ? [this.cookie(COOKIE.redirect, wanted, ROUND_TRIP_TTL)] : []
  }

  private callbackUrl(provider: Provider): string {
    return `${this.origin}${AUTH_PATH}/${provider}/callback`
  }

  // --- Routes ----------------------------------------------------------------

  private providers(): Response {
    const offered: Provider[] = OAUTH_PROVIDERS.filter(
      (provider) => credentials(this.env, provider) !== null
    )
    if (this.dev) offered.unshift('dev')
    return json({ providers: offered } satisfies ProvidersResponse)
  }

  private async me(): Promise<Response> {
    const [claims, cookies] = await this.session()
    if (claims) {
      const account = await this.store.get(claims.accountId)
      if (account) {
        const body: MeResponse = {
          account: await this.accountWire(account),
          pending: null,
        }
        return json(body, 200, cookies)
      }
    }
    const pending = await this.tokens.verifyPending(
      this.cookies[COOKIE.pending]
    )
    const body: MeResponse = {
      account: null,
      pending: pending
        ? {
            provider: pending.provider,
            displayName: pending.profile.displayName,
            avatarUrl: pending.profile.avatarUrl,
          }
        : null,
    }
    return json(body, 200, cookies)
  }

  private async refresh(): Promise<Response> {
    const accountId = await this.tokens.verifyRefresh(
      this.cookies[COOKIE.refresh]
    )
    const account = accountId ? await this.store.get(accountId) : null
    if (!account) return json({ ok: false }, 200, this.clearSession())
    return json({ ok: true }, 200, [
      this.cookie(
        COOKIE.token,
        await this.tokens.signAccess({
          accountId: account.accountId,
          username: account.username,
          role: account.role,
        }),
        ACCESS_TTL
      ),
    ])
  }

  private logout(): Response {
    return json({ ok: true }, 200, [
      ...this.clearSession(),
      this.clear(COOKIE.pending),
    ])
  }

  private async login(provider: Exclude<Provider, 'dev'>): Promise<Response> {
    const creds = credentials(this.env, provider)
    if (!creds) {
      return json(
        {
          error: copy('auth.provider_not_configured', {
            provider: PROVIDER_LABELS[provider],
          }),
        },
        503
      )
    }
    const state = randomToken()
    const verifier = randomToken()
    const location = authorizeUrl(provider, {
      clientId: creds.clientId,
      redirectUri: this.callbackUrl(provider),
      state,
      challenge: await pkceChallenge(verifier),
    })
    return redirect(location, [
      this.cookie(COOKIE.state, state, ROUND_TRIP_TTL),
      this.cookie(COOKIE.pkce, verifier, ROUND_TRIP_TTL),
      // A plain sign-in forgets any link intent left from a closed popup.
      this.clear(COOKIE.link),
      ...this.redirectCookie(),
    ])
  }

  private async callback(
    provider: Exclude<Provider, 'dev'>
  ): Promise<Response> {
    const query = this.url.searchParams
    const error = query.get('error')
    if (error) return this.landing({ error })
    const code = query.get('code')
    if (!code) return json({ error: copy('auth.missing_code') }, 400)
    const state = this.cookies[COOKIE.state]
    if (!state || state !== query.get('state')) {
      return json({ error: copy('auth.state_mismatch') }, 400)
    }
    const verifier = this.cookies[COOKIE.pkce] ?? ''
    const creds = credentials(this.env, provider)
    if (!creds) {
      return json(
        {
          error: copy('auth.provider_not_configured', {
            provider: PROVIDER_LABELS[provider],
          }),
        },
        503
      )
    }

    // The round-trip cookies are spent either way.
    const spent = [
      this.clear(COOKIE.state),
      this.clear(COOKIE.pkce),
      this.clear(COOKIE.link),
    ]

    // A link round trip names the account to link to; it counts only when
    // that account is the one signed in.
    let linkTo: string | null = null
    const intent = this.cookies[COOKIE.link]
    if (intent) {
      const claims = await this.access()
      if (claims && claims.accountId === intent) linkTo = intent
    }

    let profile: Profile
    try {
      const token = await exchangeCode(this.fetchImpl, provider, {
        code,
        redirectUri: this.callbackUrl(provider),
        verifier,
        credentials: creds,
      })
      profile = await fetchProfile(this.fetchImpl, provider, token)
    } catch (err) {
      console.warn('Sign-in failed:', provider, err)
      return withCookies(
        this.landing({
          error: copy('auth.provider_failed', {
            provider: PROVIDER_LABELS[provider],
          }),
        }),
        spent
      )
    }

    if (linkTo) {
      return withCookies(
        await this.finishLink(linkTo, provider, profile),
        spent
      )
    }
    return withCookies(await this.finishLogin(provider, profile), spent)
  }

  // A provider identity arrives: sign its account in, or hold the profile
  // until the gates are passed.
  private async finishLogin(
    provider: Provider,
    profile: Profile
  ): Promise<Response> {
    const key = providerKey(provider, profile.id)
    const linked = await this.store.findByProvider(key)
    if (linked) {
      const account = await this.store.get(linked.accountId)
      if (account) {
        await this.store.updateProfile(
          key,
          profile.displayName,
          profile.avatarUrl
        )
        await this.store.touchLogin(account.accountId, this.now())
        return withCookies(this.landing({ auth: 'success' }), [
          ...(await this.sessionCookies(account)),
          this.clear(COOKIE.pending),
        ])
      }
    }
    const pending = await this.tokens.signPending({ provider, profile })
    return withCookies(this.landing({ auth: 'pending_signup' }), [
      this.cookie(COOKIE.pending, pending, PENDING_TTL),
    ])
  }

  private async finishLink(
    accountId: string,
    provider: Provider,
    profile: Profile
  ): Promise<Response> {
    const result = await this.store.linkProvider(
      this.linked(accountId, provider, profile)
    )
    if (result === 'ok') return this.landing({ auth: 'linked' })
    return this.landing({
      error:
        result === 'already-linked'
          ? copy('auth.already_linked', { provider: PROVIDER_LABELS[provider] })
          : copy('auth.linked_elsewhere', {
              provider: PROVIDER_LABELS[provider],
            }),
    })
  }

  private linked(
    accountId: string,
    provider: Provider,
    profile: Profile
  ): LinkedProvider {
    return {
      providerKey: providerKey(provider, profile.id),
      accountId,
      provider,
      providerId: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      linkedAt: this.now(),
    }
  }

  // A new account from a provider profile. Returns the account signed in
  // to: the new one, or the one that claimed the provider meanwhile.
  private async createAccount(
    provider: Provider,
    profile: Profile
  ): Promise<Account> {
    const key = providerKey(provider, profile.id)
    const existing = await this.store.findByProvider(key)
    if (existing) {
      const account = await this.store.get(existing.accountId)
      if (account) return account
    }
    const now = this.now()
    const account: Account = {
      accountId: crypto.randomUUID(),
      username: null,
      role: 'user',
      primaryProvider: key,
      createdAt: now,
      lastLoginAt: now,
    }
    await this.store.create(
      account,
      this.linked(account.accountId, provider, profile)
    )
    return account
  }

  private async confirmSignup(): Promise<Response> {
    const pending = await this.tokens.verifyPending(
      this.cookies[COOKIE.pending]
    )
    if (!pending) {
      return json({ error: copy('auth.expired') }, 401, [
        this.clear(COOKIE.pending),
      ])
    }
    const account = await this.createAccount(pending.provider, pending.profile)
    return json({ account: await this.accountWire(account) }, 200, [
      ...(await this.sessionCookies(account)),
      this.clear(COOKIE.pending),
    ])
  }

  // POST chooses the first username, once; PUT (`rename`, from Gron)
  // changes it, any time.
  private async setUsername(rename = false): Promise<Response> {
    const claims = await this.access()
    if (!claims) return json({ error: copy('auth.sign_in_first') }, 401)
    const body = (await this.request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    const username = body?.username
    if (!isValidUsername(username)) {
      return json({ error: copy('auth.username_rule') }, 400)
    }
    const result = rename
      ? await this.store.renameUsername(claims.accountId, username)
      : await this.store.setUsername(claims.accountId, username)
    switch (result) {
      case 'ok': {
        // The access cookie carries the username; reissue it.
        const account = await this.store.get(claims.accountId)
        return json(
          { username },
          200,
          account ? await this.sessionCookies(account) : []
        )
      }
      case 'taken':
        return json({ error: copy('auth.username_taken') }, 409)
      case 'already-set':
        return json({ error: copy('auth.username_set') }, 400)
      case 'missing':
        return json(
          { error: copy('auth.account_not_found') },
          401,
          this.clearSession()
        )
    }
  }

  // The character and guitar finish chosen at the select or at Gron.
  private async setLook(): Promise<Response> {
    const claims = await this.access()
    if (!claims) return json({ error: copy('auth.sign_in_first') }, 401)
    const body = (await this.request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    const outfit = body?.outfit
    const finish = body?.finish
    if (!isSelectable(outfit) || !isFinish(finish)) {
      return json({ error: copy('auth.look_rule') }, 400)
    }
    if (!(await this.store.setLook(claims.accountId, { outfit, finish }))) {
      return json(
        { error: copy('auth.account_not_found') },
        401,
        this.clearSession()
      )
    }
    return json({ look: { outfit, finish } })
  }

  private async available(username: string): Promise<Response> {
    if (!isValidUsername(username)) {
      return json({ available: false, reason: 'invalid' })
    }
    const available = await this.store.usernameAvailable(username)
    return json(available ? { available } : { available, reason: 'taken' })
  }

  private async linkLogin(provider: string): Promise<Response> {
    const claims = await this.access()
    if (!claims) return json({ error: copy('auth.sign_in_first') }, 401)
    if (this.dev && provider === 'dev') return this.devLink(claims)
    if (!isOAuthProvider(provider)) return json({ error: 'Not found' }, 404)
    const res = await this.login(provider)
    if (res.status !== 302) return res
    return withCookies(res, [
      this.cookie(COOKIE.link, claims.accountId, ROUND_TRIP_TTL),
    ])
  }

  private async unlink(provider: string): Promise<Response> {
    const claims = await this.access()
    if (!claims) return json({ error: copy('auth.sign_in_first') }, 401)
    if (!isProvider(provider)) return json({ error: 'Not found' }, 404)
    const result = await this.store.unlinkProvider(claims.accountId, provider)
    switch (result) {
      case 'ok':
        return json({ ok: true })
      case 'last-provider':
        return json({ error: copy('auth.unlink_last') }, 400)
      case 'not-linked':
        return json(
          {
            error: copy('auth.not_linked', {
              provider: PROVIDER_LABELS[provider],
            }),
          },
          404
        )
    }
  }

  // --- Dev provider ------------------------------------------------------------

  private devProfile(): Profile {
    const query = this.url.searchParams
    const id = query.get('userId') || 'dev-user'
    return sanitizeProfile({
      id: id.startsWith('dev:') ? id.slice(4) : id,
      displayName: query.get('name') || 'Dev Raider',
      avatarUrl: null,
    })
  }

  // Dev sign-in is one request, so the redirect is read straight from the
  // query. `accept=1` passes the gates and `username=` chooses the handle,
  // so a test or a `?skipSplash` boot can arrive signed in.
  private async devLogin(): Promise<Response> {
    const query = this.url.searchParams
    const profile = this.devProfile()
    const kept = validateRedirect(query.get('redirect'))
    const key = providerKey('dev', profile.id)
    const linked = await this.store.findByProvider(key)
    if (!linked && query.get('accept') !== '1') {
      const pending = await this.tokens.signPending({
        provider: 'dev',
        profile,
      })
      return redirect(
        landingUrl(this.origin, kept, { auth: 'pending_signup' }),
        [this.cookie(COOKIE.pending, pending, PENDING_TTL)]
      )
    }
    const account = await this.createAccount('dev', profile)
    const username = query.get('username')
    if (account.username === null && isValidUsername(username)) {
      const result = await this.store.setUsername(account.accountId, username)
      if (result === 'ok') account.username = username
    }
    await this.store.touchLogin(account.accountId, this.now())
    return redirect(landingUrl(this.origin, kept, { auth: 'success' }), [
      ...(await this.sessionCookies(account)),
      this.clear(COOKIE.pending),
    ])
  }

  private async devLink(claims: AccessClaims): Promise<Response> {
    const query = this.url.searchParams
    const profile = sanitizeProfile({
      id: query.get('userId') || 'dev-user-2',
      displayName: query.get('name') || 'Dev Raider 2',
      avatarUrl: null,
    })
    const kept = validateRedirect(query.get('redirect'))
    const res = await this.finishLink(claims.accountId, 'dev', profile)
    // finishLink lands by the redirect cookie; a dev link has none.
    const flag = res.headers.get('Location')?.includes('auth=linked')
      ? ({ auth: 'linked' } as const)
      : {
          error: copy('auth.linked_elsewhere', {
            provider: PROVIDER_LABELS.dev,
          }),
        }
    return redirect(landingUrl(this.origin, kept, flag))
  }

  private devForm(): Response {
    const redirectTo = validateRedirect(this.url.searchParams.get('redirect'))
    return html(devFormPage(redirectTo))
  }
}

function withCookies(res: Response, cookies: string[]): Response {
  if (cookies.length === 0) return res
  const out = new Response(res.body, res)
  for (const cookie of cookies) out.headers.append('Set-Cookie', cookie)
  return out
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// The dev sign-in form: pick a user id (a new one takes the new-raider path
// through the gates; a known one signs straight in). Dev servers only.
function devFormPage(redirectTo: string | null): string {
  const redirectField = redirectTo
    ? `<input type="hidden" name="redirect" value="${escapeHtml(redirectTo)}">`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dev Sign-In</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #000; color: #f3eee4; font: 16px/1.5 ui-monospace, monospace; }
  form { display: grid; gap: 12px; width: min(320px, 90vw); text-align: center; }
  h1 { font-size: 18px; letter-spacing: 0.3em; text-transform: uppercase; color: #ffaa00; margin: 0 0 8px; }
  label { display: grid; gap: 4px; text-align: left; font-size: 13px; color: #9fb3c8; }
  input[type=text] { font: inherit; padding: 8px 10px; background: #111; color: #f3eee4; border: 1px solid #555; }
  button { font: inherit; text-transform: uppercase; padding: 10px; background: #2e7d32; color: #f3eee4; border: 1px solid #f3eee4; box-shadow: 4px 4px 0 #000; cursor: pointer; }
  p { font-size: 12px; color: #777; margin: 0; }
</style>
</head>
<body>
<form method="get" action="${AUTH_PATH}/dev/login">
  <h1>Dev Sign-In</h1>
  <label>User ID <input type="text" name="userId" value="dev-user" autofocus autocomplete="off" spellcheck="false"></label>
  <label>Display name <input type="text" name="name" value="Dev Raider" autocomplete="off" spellcheck="false"></label>
  ${redirectField}
  <button type="submit">Sign In</button>
  <p>A new user ID walks the new-raider path; a known one signs straight in.</p>
</form>
</body>
</html>
`
}
