import { describe, expect, it } from 'vitest'
import www, { apexUrl } from '../../worker/www.ts'

const env = { APP_ORIGIN: 'https://bvsw.net' }

describe('the www redirect', () => {
  it('keeps the path and the query string', () => {
    expect(
      apexUrl(
        new Request('https://www.bvsw.net/terms.html?a=1'),
        env.APP_ORIGIN
      )
    ).toBe('https://bvsw.net/terms.html?a=1')
  })

  it('sends the bare host to the apex root', () => {
    expect(apexUrl(new Request('https://www.bvsw.net'), env.APP_ORIGIN)).toBe(
      'https://bvsw.net/'
    )
  })

  it('sends bvsw.gay to the same path on bvsw.net', () => {
    expect(
      apexUrl(new Request('https://bvsw.gay/akashic?x=2'), env.APP_ORIGIN)
    ).toBe('https://bvsw.net/akashic?x=2')
  })

  it('answers every request with a permanent redirect', () => {
    const res = www.fetch(
      new Request('https://www.bvsw.net/auth/me', { method: 'POST' }),
      env
    )
    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toBe('https://bvsw.net/auth/me')
  })
})
