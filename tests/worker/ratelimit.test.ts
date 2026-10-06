import { describe, expect, it, vi } from 'vitest'
import { limiterFrom, tierFor, unlimited } from '../../worker/ratelimit.ts'

describe('tierFor', () => {
  it('holds the routes that start a sign-in or change an account to strict', () => {
    expect(tierFor('GET', ['github', 'login'])).toBe('strict')
    expect(tierFor('GET', ['link', 'discord', 'login'])).toBe('strict')
    expect(tierFor('POST', ['confirm-signup'])).toBe('strict')
    expect(tierFor('POST', ['username'])).toBe('strict')
    expect(tierFor('PUT', ['username'])).toBe('strict')
    expect(tierFor('DELETE', ['providers', 'github'])).toBe('strict')
  })

  it('holds what a page calls as it goes to loose', () => {
    expect(tierFor('GET', ['username', 'Dave', 'available'])).toBe('loose')
    expect(tierFor('POST', ['refresh'])).toBe('loose')
    expect(tierFor('PUT', ['look'])).toBe('loose')
    expect(tierFor('PUT', ['hotbar'])).toBe('loose')
  })

  it('leaves reading, signing out, callbacks, and the dev provider alone', () => {
    expect(tierFor('GET', ['me'])).toBeNull()
    expect(tierFor('GET', ['providers'])).toBeNull()
    expect(tierFor('POST', ['logout'])).toBeNull()
    expect(tierFor('GET', ['github', 'callback'])).toBeNull()
    expect(tierFor('GET', ['dev', 'login'])).toBeNull()
    expect(tierFor('GET', ['dev', 'form'])).toBeNull()
    expect(tierFor('GET', ['link', 'dev', 'login'])).toBe('strict')
    expect(tierFor('GET', ['nothing', 'here', 'at', 'all'])).toBeNull()
  })
})

describe('limiterFrom', () => {
  const binding = (success: boolean) => ({
    limit: vi.fn(() => Promise.resolve({ success })),
  })

  it('asks the tier binding, under a key that names the tier', async () => {
    const strict = binding(false)
    const loose = binding(true)
    const limit = limiterFrom({ AUTH_STRICT: strict, AUTH_LOOSE: loose })
    expect(await limit('strict', 'account:a1')).toBe(false)
    expect(strict.limit).toHaveBeenCalledWith({ key: 'strict:account:a1' })
    expect(await limit('loose', 'ip:1.2.3.4')).toBe(true)
    expect(loose.limit).toHaveBeenCalledWith({ key: 'loose:ip:1.2.3.4' })
  })

  it('lets requests through without bindings, or when the limiter fails', async () => {
    expect(await limiterFrom({})('strict', 'x')).toBe(true)
    const broken = {
      limit: () => Promise.reject(new Error('down')),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await limiterFrom({ AUTH_STRICT: broken })('strict', 'x')).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    expect(await unlimited('loose', 'x')).toBe(true)
  })
})
