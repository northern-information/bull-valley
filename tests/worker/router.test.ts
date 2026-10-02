import { describe, expect, it } from 'vitest'
import { VALLEY_NAME } from '../../src/protocol.ts'
import worker, { DEV_HEADER, isDevHost, valleyFor } from '../../worker/index.ts'

function env(): Env & { calls: string[]; fetched: Request[] } {
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
    const res = await worker.fetch(
      new Request('https://example.workers.dev/ws', {
        headers: { Upgrade: 'websocket' },
      }),
      e
    )
    expect(await res.text()).toBe('upgraded')
    expect(e.calls).toEqual([VALLEY_NAME])
    expect(e.fetched).toHaveLength(1)
    // Only a dev host gets the dev stamp, and never from the client.
    expect(e.fetched[0].headers.get(DEV_HEADER)).toBeNull()
    await worker.fetch(
      new Request('http://localhost:5174/ws?valley=spec-9', {
        headers: { Upgrade: 'websocket' },
      }),
      e
    )
    expect(e.calls.at(-1)).toBe('spec-9')
    expect(e.fetched[1].headers.get(DEV_HEADER)).toBe('1')
    await worker.fetch(
      new Request('https://example.workers.dev/ws', {
        headers: { Upgrade: 'websocket', [DEV_HEADER]: '1' },
      }),
      e
    )
    expect(e.fetched[2].headers.get(DEV_HEADER)).toBeNull()
  })

  it('hands everything else to the assets', async () => {
    const e = env()
    const res = await worker.fetch(
      new Request('https://example.workers.dev/nothing-here'),
      e
    )
    expect(await res.text()).toBe('asset')
    expect(e.calls).toEqual(['assets /nothing-here'])
  })
})
