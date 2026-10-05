import { describe, expect, it } from 'vitest'
import {
  clearCookie,
  COOKIE,
  parseCookies,
  serializeCookie,
} from '../../src/cookies.ts'

describe('parseCookies', () => {
  it('reads every pair, trimming and decoding', () => {
    expect(parseCookies('a=1; bv_token=x.y.z;  c=hello%20there')).toEqual({
      a: '1',
      bv_token: 'x.y.z',
      c: 'hello there',
    })
  })

  it('keeps a value that is not valid percent-encoding', () => {
    expect(parseCookies('a=%E0%A4%A')).toEqual({ a: '%E0%A4%A' })
  })

  it('skips parts with no name or no equals sign', () => {
    expect(parseCookies('=1; junk; b=2; c=')).toEqual({ b: '2', c: '' })
  })

  it('is empty for a missing header', () => {
    expect(parseCookies(null)).toEqual({})
    expect(parseCookies('')).toEqual({})
  })
})

describe('serializeCookie', () => {
  it('is HttpOnly, Lax, whole-origin, and Secure over https', () => {
    expect(
      serializeCookie(COOKIE.token, 'x.y.z', { maxAge: 900, secure: true })
    ).toBe(
      'bv_token=x.y.z; Max-Age=900; Path=/; HttpOnly; SameSite=Lax; Secure'
    )
  })

  it('leaves Secure off for a dev server on http', () => {
    expect(
      serializeCookie(COOKIE.state, 'abc', { maxAge: 300, secure: false })
    ).toBe('bv_state=abc; Max-Age=300; Path=/; HttpOnly; SameSite=Lax')
  })

  it('encodes the value and floors the age', () => {
    const header = serializeCookie('n', 'a b;c', { maxAge: 1.9, secure: false })
    expect(header.startsWith('n=a%20b%3Bc; Max-Age=1;')).toBe(true)
    expect(parseCookies(header.split(';')[0])).toEqual({ n: 'a b;c' })
  })

  it('clears with a zero age', () => {
    expect(clearCookie(COOKIE.refresh, true)).toBe(
      'bv_refresh=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure'
    )
  })
})
