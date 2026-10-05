import { describe, expect, it } from 'vitest'
import { COOKIE } from '../../src/cookies.ts'
import { VALLEY_NAME } from '../../src/protocol.ts'
import { ACCOUNT_HEADER, NAME_HEADER } from '../../worker/auth.ts'
import worker, { DEV_HEADER, isDevHost, valleyFor } from '../../worker/index.ts'
import { Tokens } from '../../worker/tokens.ts'
import type { WorkerEnv } from '../../worker/env.ts'

const SECRET = 'router-test-secret'

function env(): WorkerEnv & { calls: string[]; fetched: Request[] } {
  const calls: string[] = []
  const fetched: Request[] = []
  const stub = {
    fetch(request: Request) {
      fetched.push(request)
      return Promise.resolve(new Response('upgraded'))
    },
  }
  return {
    calls,
    fetched,
    APP_ORIGIN: 'https://bvsw.gay',
    JWT_SECRET: SECRET,
    // The account routes that touch the database are tested in auth.test.ts
    // against the in-memory store; the router never reaches it here.
    DB: {} as unknown as D1Database,
    AUTH_STRICT: { limit: () => Promise.resolve({ success: true }) },
    AUTH_LOOSE: { limit: () => Promise.resolve({ success: true }) },
    VALLEY: {
      idFromName(name: string) {
        calls.push(name)
        return name as unknown as DurableObjectId
      },
      get() {
        return stub
      },
    } as unknown as Env['VALLEY'],
    ASSETS: {
      fetch(request: Request) {
        calls.push(`assets ${new URL(request.url).pathname}`)
        return Promise.resolve(new Response('asset'))
      },
    } as unknown as Fetcher,
  }
}

// Typed as the Worker receives it; an inline `new Request` gets this from
// the handler's parameter, a helper does not.
const upgrade = (
  url: string,
  headers: Record<string, string> = {}
): Request<unknown, IncomingRequestCfProperties> =>
  new Request(url, { headers: { Upgrade: 'websocket', ...headers } })

describe('router', () => {
  it('knows the dev hosts', () => {
    expect(isDevHost('localhost')).toBe(true)
    expect(isDevHost('127.0.0.1')).toBe(true)
    expect(isDevHost('bull-valley-shadow-wars.example.workers.dev')).toBe(false)
  })

  it('picks a valley by name only on a dev host', () => {
    expect(valleyFor(new URL('http://localhost:5174/ws?valley=spec-1'))).toBe(
      'spec-1'
    )
    expect(valleyFor(new URL('http://localhost:5174/ws'))).toBe(VALLEY_NAME)
    expect(valleyFor(new URL('http://localhost:5174/ws?valley=../x'))).toBe(
      VALLEY_NAME
    )
    expect(
      valleyFor(new URL('https://example.workers.dev/ws?valley=spec-1'))
    ).toBe(VALLEY_NAME)
  })

  it('upgrades /ws into the valley and refuses plain requests', async () => {
    const e = env()
    const plain = await worker.fetch(
      new Request('https://example.workers.dev/ws'),
      e
    )
    expect(plain.status).toBe(426)
    const res = await worker.fetch(upgrade('https://example.workers.dev/ws'), e)
    expect(await res.text()).toBe('upgraded')
    expect(e.calls).toEqual([VALLEY_NAME])
    expect(e.fetched).toHaveLength(1)
    // Only a dev host gets the dev stamp, and never from the client.
    expect(e.fetched[0].headers.get(DEV_HEADER)).toBeNull()
    await worker.fetch(upgrade('http://localhost:5174/ws?valley=spec-9'), e)
    expect(e.calls.at(-1)).toBe('spec-9')
    expect(e.fetched[1].headers.get(DEV_HEADER)).toBe('1')
    await worker.fetch(
      upgrade('https://example.workers.dev/ws', { [DEV_HEADER]: '1' }),
      e
    )
    expect(e.fetched[2].headers.get(DEV_HEADER)).toBeNull()
  })

  it('stamps the signed-in raider on the upgrade from the access cookie', async () => {
    const e = env()
    const tokens = new Tokens(SECRET)
    const token = await tokens.signAccess({
      accountId: 'acct-1',
      username: 'Dave',
      role: 'user',
    })
    await worker.fetch(
      upgrade('https://bvsw.gay/ws', { Cookie: `${COOKIE.token}=${token}` }),
      e
    )
    expect(e.fetched[0].headers.get(ACCOUNT_HEADER)).toBe('acct-1')
    expect(e.fetched[0].headers.get(NAME_HEADER)).toBe('Dave')
  })

  it('never takes the identity stamps from the client', async () => {
    const e = env()
    await worker.fetch(
      upgrade('https://bvsw.gay/ws', {
        [ACCOUNT_HEADER]: 'acct-9',
        [NAME_HEADER]: 'Mallory',
      }),
      e
    )
    expect(e.fetched[0].headers.get(ACCOUNT_HEADER)).toBeNull()
    expect(e.fetched[0].headers.get(NAME_HEADER)).toBeNull()
    // A forged or stale token stamps nothing either.
    await worker.fetch(
      upgrade('https://bvsw.gay/ws', { Cookie: `${COOKIE.token}=not.a.jwt` }),
      e
    )
    expect(e.fetched[1].headers.get(ACCOUNT_HEADER)).toBeNull()
    // Nor does an account that has not chosen a username yet.
    const token = await new Tokens(SECRET).signAccess({
      accountId: 'acct-2',
      username: null,
      role: 'user',
    })
    await worker.fetch(
      upgrade('https://bvsw.gay/ws', { Cookie: `${COOKIE.token}=${token}` }),
      e
    )
    expect(e.fetched[2].headers.get(ACCOUNT_HEADER)).toBeNull()
  })

  it('answers the account routes itself', async () => {
    const e = env()
    const res = await worker.fetch(
      new Request('https://bvsw.gay/auth/providers'),
      e
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ providers: [] })
    const missing = await worker.fetch(
      new Request('https://bvsw.gay/auth/nothing'),
      e
    )
    expect(missing.status).toBe(404)
    expect(e.calls).toEqual([])
  })

  it('hands everything else to the assets', async () => {
    const e = env()
    const res = await worker.fetch(
      new Request('https://example.workers.dev/nothing-here'),
      e
    )
    expect(await res.text()).toBe('asset')
    expect(e.calls).toEqual(['assets /nothing-here'])
    // /authentic is not an account route.
    await worker.fetch(new Request('https://example.workers.dev/authentic'), e)
    expect(e.calls.at(-1)).toBe('assets /authentic')
  })
})
