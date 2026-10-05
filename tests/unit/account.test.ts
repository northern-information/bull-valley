import { describe, expect, it } from 'vitest'
import {
  authReturnOf,
  devSignInUrl,
  isOAuthProvider,
  isProvider,
  isValidUsername,
  landingUrl,
  linkable,
  linkUrl,
  OAUTH_PROVIDERS,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  signInUrl,
  stripAuthQuery,
  validateRedirect,
} from '../../src/account.ts'

const FAILED = 'Sign-in failed'

describe('linking', () => {
  it('sends the popup to the link login, landing on the closing page', () => {
    expect(linkUrl('github')).toBe(
      '/auth/link/github/login?redirect=%2Fauth-done.html'
    )
    expect(linkUrl('dev', 'dev-x1')).toBe(
      '/auth/link/dev/login?redirect=%2Fauth-done.html&userId=dev-x1'
    )
    // Only the dev provider takes an identity from the page.
    expect(linkUrl('google', 'dev-x1')).toBe(
      '/auth/link/google/login?redirect=%2Fauth-done.html'
    )
    // A blocked popup lands back on the game instead.
    expect(linkUrl('github', undefined, '/?valley=a')).toBe(
      '/auth/link/github/login?redirect=%2F%3Fvalley%3Da'
    )
  })

  it('offers what the account lacks, and Dev always', () => {
    expect(linkable(['google', 'discord', 'github'], ['github'])).toEqual([
      'google',
      'discord',
    ])
    expect(linkable(['dev', 'github'], ['dev'])).toEqual(['dev', 'github'])
    expect(linkable(['github'], ['github'])).toEqual([])
  })
})

describe('the client side of a round trip', () => {
  it('reads how the round trip went', () => {
    expect(authReturnOf('?auth=success', FAILED)).toEqual({ auth: 'success' })
    expect(authReturnOf('?valley=a&auth=pending_signup', FAILED)).toEqual({
      auth: 'pending_signup',
    })
    expect(authReturnOf('?auth=linked', FAILED)).toEqual({ auth: 'linked' })
    expect(authReturnOf('?auth_error=access_denied', FAILED)).toEqual({
      error: 'access_denied',
    })
    expect(authReturnOf('?auth_error=', FAILED)).toEqual({ error: FAILED })
    expect(authReturnOf('?auth=hacked', FAILED)).toBeNull()
    expect(authReturnOf('', FAILED)).toBeNull()
  })

  it('strips only its own flags', () => {
    expect(stripAuthQuery('?valley=a&auth=success&skipSplash')).toBe(
      '?valley=a&skipSplash='
    )
    expect(stripAuthQuery('?auth_error=x')).toBe('')
    expect(stripAuthQuery('')).toBe('')
  })

  it('sends each provider button to its login, with the way back', () => {
    expect(signInUrl('github', '/?valley=a')).toBe(
      '/auth/github/login?redirect=%2F%3Fvalley%3Da'
    )
    expect(signInUrl('dev', '/')).toBe('/auth/dev/form?redirect=%2F')
  })

  it('builds the one-request dev sign-in', () => {
    const url = new URL(
      devSignInUrl({ userId: 'u1', username: 'Raider', redirect: '/?x=1' }),
      'http://localhost'
    )
    expect(url.pathname).toBe('/auth/dev/login')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      userId: 'u1',
      username: 'Raider',
      accept: '1',
      redirect: '/?x=1',
    })
  })
})

describe('providers', () => {
  it('knows the three OAuth providers and the dev stand-in', () => {
    for (const id of OAUTH_PROVIDERS) {
      expect(isOAuthProvider(id)).toBe(true)
      expect(isProvider(id)).toBe(true)
    }
    expect(isOAuthProvider('dev')).toBe(false)
    expect(isProvider('dev')).toBe(true)
    expect(isProvider('facebook')).toBe(false)
    expect(isProvider(3)).toBe(false)
  })

  it('has a label and a color for each', () => {
    for (const id of [...OAUTH_PROVIDERS, 'dev'] as const) {
      expect(PROVIDER_LABELS[id]).toBeTruthy()
      expect(PROVIDER_COLORS[id]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('isValidUsername', () => {
  it('takes 3 to 16 letters, digits and underscores', () => {
    expect(isValidUsername('Dave')).toBe(true)
    expect(isValidUsername('d_1')).toBe(true)
    expect(isValidUsername('x'.repeat(16))).toBe(true)
  })

  it('refuses anything else', () => {
    expect(isValidUsername('ab')).toBe(false)
    expect(isValidUsername('x'.repeat(17))).toBe(false)
    expect(isValidUsername('Dave Coleman')).toBe(false)
    expect(isValidUsername('Dävid')).toBe(false)
    expect(isValidUsername('dave!')).toBe(false)
    expect(isValidUsername('')).toBe(false)
    expect(isValidUsername(null)).toBe(false)
  })
})

describe('validateRedirect', () => {
  it('allows the game with its query and the popup page bare', () => {
    expect(validateRedirect('/')).toBe('/')
    expect(validateRedirect('/?valley=spec-1&skipSplash')).toBe(
      '/?valley=spec-1&skipSplash='
    )
    expect(validateRedirect('/auth-done.html')).toBe('/auth-done.html')
    expect(validateRedirect('/auth-done.html?x=1')).toBe('/auth-done.html')
  })

  it('drops a stale auth flag from the query', () => {
    expect(validateRedirect('/?auth=success&valley=a')).toBe('/?valley=a')
    expect(validateRedirect('/?auth_error=x')).toBe('/')
  })

  it('refuses other paths and other origins', () => {
    expect(validateRedirect('/akashic')).toBeNull()
    expect(validateRedirect('/auth/google/login')).toBeNull()
    expect(validateRedirect('//evil.example/')).toBeNull()
    expect(validateRedirect('/\\evil.example/')).toBeNull()
    expect(validateRedirect('https://evil.example/')).toBeNull()
    expect(validateRedirect('')).toBeNull()
    expect(validateRedirect(undefined)).toBeNull()
  })
})

describe('landingUrl', () => {
  it('adds the auth flag to the kept query', () => {
    expect(
      landingUrl('https://bvsw.net', '/?valley=a', { auth: 'success' })
    ).toBe('https://bvsw.net/?valley=a&auth=success')
    expect(landingUrl('http://localhost:5174', null, { auth: 'linked' })).toBe(
      'http://localhost:5174/?auth=linked'
    )
  })

  it('carries an error message', () => {
    expect(
      landingUrl('https://bvsw.net', '/auth-done.html', { error: 'no go' })
    ).toBe('https://bvsw.net/auth-done.html?auth_error=no+go')
  })
})
