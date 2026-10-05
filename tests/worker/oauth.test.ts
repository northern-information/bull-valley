import { describe, expect, it } from 'vitest'
import {
  authorizeUrl,
  credentials,
  exchangeCode,
  fetchProfile,
  OAUTH,
  pkceChallenge,
  providerKey,
  randomToken,
  sanitizeProfile,
} from '../../worker/oauth.ts'

const creds = { clientId: 'cid', clientSecret: 'csec' }

// A fetch that answers from a table of URL -> response, recording calls.
function fakeFetch(answers: Record<string, () => Response>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    calls.push({ url, init })
    const answer = answers[url]
    return Promise.resolve(
      answer ? answer() : new Response('nope', { status: 404 })
    )
  }) as typeof fetch
  return { impl, calls }
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('credentials', () => {
  it('needs both halves', () => {
    expect(credentials({}, 'google')).toBeNull()
    expect(credentials({ GOOGLE_CLIENT_ID: 'a' }, 'google')).toBeNull()
    expect(
      credentials(
        { GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' },
        'google'
      )
    ).toEqual({ clientId: 'a', clientSecret: 'b' })
    expect(
      credentials(
        { DISCORD_CLIENT_ID: 'c', DISCORD_CLIENT_SECRET: 'd' },
        'discord'
      )
    ).toEqual({ clientId: 'c', clientSecret: 'd' })
    expect(
      credentials(
        { GITHUB_CLIENT_ID: 'e', GITHUB_CLIENT_SECRET: 'f' },
        'github'
      )
    ).toEqual({ clientId: 'e', clientSecret: 'f' })
  })
})

describe('tokens and PKCE', () => {
  it('makes 32 random URL-safe bytes', () => {
    const a = randomToken()
    const b = randomToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })

  it('derives the S256 challenge of RFC 7636 appendix B', async () => {
    expect(
      await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    ).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('keys a provider identity', () => {
    expect(providerKey('github', '12345')).toBe('github:12345')
  })
})

describe('authorizeUrl', () => {
  const params = {
    clientId: 'cid',
    redirectUri: 'https://bvsw.net/auth/google/callback',
    state: 'st',
    challenge: 'ch',
  }

  it('carries the code flow with PKCE', () => {
    const url = new URL(authorizeUrl('google', params))
    expect(url.origin + url.pathname).toBe(OAUTH.google.authorizeUrl)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      redirect_uri: 'https://bvsw.net/auth/google/callback',
      response_type: 'code',
      scope: 'openid profile',
      state: 'st',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
    })
  })

  it('asks Discord to skip the consent screen it already knows', () => {
    const url = new URL(authorizeUrl('discord', params))
    expect(url.searchParams.get('prompt')).toBe('none')
    expect(url.searchParams.get('scope')).toBe('identify')
    expect(
      new URL(authorizeUrl('github', params)).searchParams.get('prompt')
    ).toBeNull()
  })
})

describe('exchangeCode', () => {
  const exchange = {
    code: 'the-code',
    redirectUri: 'https://bvsw.net/auth/github/callback',
    verifier: 'the-verifier',
    credentials: creds,
  }

  it('posts the code and the verifier as a form, and takes the token', async () => {
    const fetch = fakeFetch({
      [OAUTH.github.tokenUrl]: () => jsonRes({ access_token: 'tok' }),
    })
    expect(await exchangeCode(fetch.impl, 'github', exchange)).toBe('tok')
    const [call] = fetch.calls
    expect(call.init?.method).toBe('POST')
    const headers = call.init?.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(headers.Accept).toBe('application/json')
    expect(
      Object.fromEntries(
        new URLSearchParams(
          typeof call.init?.body === 'string' ? call.init.body : ''
        )
      )
    ).toEqual({
      client_id: 'cid',
      client_secret: 'csec',
      code: 'the-code',
      redirect_uri: 'https://bvsw.net/auth/github/callback',
      grant_type: 'authorization_code',
      code_verifier: 'the-verifier',
    })
  })

  it('throws on a refusal, an error body, or no token', async () => {
    const refused = fakeFetch({
      [OAUTH.github.tokenUrl]: () =>
        jsonRes({ error: 'bad_verification_code' }),
    })
    await expect(
      exchangeCode(refused.impl, 'github', exchange)
    ).rejects.toThrow(/bad_verification_code/)
    const status = fakeFetch({
      [OAUTH.github.tokenUrl]: () => new Response('down', { status: 502 }),
    })
    await expect(exchangeCode(status.impl, 'github', exchange)).rejects.toThrow(
      /token exchange failed/
    )
    const empty = fakeFetch({ [OAUTH.github.tokenUrl]: () => jsonRes({}) })
    await expect(exchangeCode(empty.impl, 'github', exchange)).rejects.toThrow()
  })
})

describe('fetchProfile', () => {
  it('sends the bearer token and maps each provider', async () => {
    const fetch = fakeFetch({
      [OAUTH.google.profileUrl]: () =>
        jsonRes({ id: 'g1', name: 'Gale', picture: 'https://g/p.png' }),
      [OAUTH.discord.profileUrl]: () =>
        jsonRes({
          id: 'd1',
          username: 'disc',
          global_name: 'Disco',
          avatar: 'abc',
        }),
      [OAUTH.github.profileUrl]: () =>
        jsonRes({
          id: 12345,
          login: 'octo',
          name: null,
          avatar_url: 'https://gh/a.png',
        }),
    })
    expect(await fetchProfile(fetch.impl, 'google', 'tok')).toEqual({
      id: 'g1',
      displayName: 'Gale',
      avatarUrl: 'https://g/p.png',
    })
    expect(await fetchProfile(fetch.impl, 'discord', 'tok')).toEqual({
      id: 'd1',
      displayName: 'Disco',
      avatarUrl: 'https://cdn.discordapp.com/avatars/d1/abc.png',
    })
    expect(await fetchProfile(fetch.impl, 'github', 'tok')).toEqual({
      id: '12345',
      displayName: 'octo',
      avatarUrl: 'https://gh/a.png',
    })
    const headers = fetch.calls[0].init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(headers['User-Agent']).toBe('bull-valley-shadow-wars')
  })

  it('throws on a refusal or a profile with no id', async () => {
    const refused = fakeFetch({
      [OAUTH.google.profileUrl]: () => new Response('no', { status: 401 }),
    })
    await expect(fetchProfile(refused.impl, 'google', 'tok')).rejects.toThrow(
      /profile fetch failed/
    )
    const noId = fakeFetch({
      [OAUTH.google.profileUrl]: () => jsonRes({ name: 'Nobody' }),
    })
    await expect(fetchProfile(noId.impl, 'google', 'tok')).rejects.toThrow(
      /no id/
    )
  })
})

describe('sanitizeProfile', () => {
  it('strips control characters and bounds the lengths', () => {
    const clean = sanitizeProfile({
      id: ' 12\u0000345 ',
      displayName: 'Da​ve\n',
      avatarUrl: null,
    })
    expect(clean).toEqual({ id: '12345', displayName: 'Dave', avatarUrl: null })
    const long = sanitizeProfile({
      id: 'x'.repeat(300),
      displayName: 'y'.repeat(300),
      avatarUrl: 'https://a/' + 'z'.repeat(3000),
    })
    expect(long.id).toHaveLength(255)
    expect(long.displayName).toHaveLength(200)
    expect(long.avatarUrl).toBeNull()
  })

  it('keeps only an https avatar', () => {
    expect(
      sanitizeProfile({
        id: '1',
        displayName: 'a',
        avatarUrl: 'http://a/b.png',
      }).avatarUrl
    ).toBeNull()
    expect(
      sanitizeProfile({ id: '1', displayName: 'a', avatarUrl: 'javascript:x' })
        .avatarUrl
    ).toBeNull()
    expect(
      sanitizeProfile({ id: '1', displayName: 'a', avatarUrl: 'not a url' })
        .avatarUrl
    ).toBeNull()
    expect(
      sanitizeProfile({
        id: '1',
        displayName: 'a',
        avatarUrl: 'https://a/b.png',
      }).avatarUrl
    ).toBe('https://a/b.png')
  })

  it('names a raider with no display name', () => {
    expect(
      sanitizeProfile({ id: '1', displayName: '  ', avatarUrl: null })
        .displayName
    ).toBe('Raider')
  })
})
