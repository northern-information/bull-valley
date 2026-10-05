import { describe, expect, it } from 'vitest'
import {
  isOAuthProvider,
  isProvider,
  isValidUsername,
  landingUrl,
  OAUTH_PROVIDERS,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  validateRedirect,
} from '../../src/account.ts'

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
      landingUrl('https://bvsw.gay', '/?valley=a', { auth: 'success' })
    ).toBe('https://bvsw.gay/?valley=a&auth=success')
    expect(landingUrl('http://localhost:5174', null, { auth: 'linked' })).toBe(
      'http://localhost:5174/?auth=linked'
    )
  })

  it('carries an error message', () => {
    expect(
      landingUrl('https://bvsw.gay', '/auth-done.html', { error: 'no go' })
    ).toBe('https://bvsw.gay/auth-done.html?auth_error=no+go')
  })
})
