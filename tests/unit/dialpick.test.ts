import { describe, expect, it } from 'vitest'
import { pickApp, switchUrl } from '../../src/dialpick.ts'

const MOUSE = { coarse: false, fine: true }
const PHONE = { coarse: true, fine: false }
const TABLET_WITH_PEN = { coarse: true, fine: true }

describe('pickApp', () => {
  it('dials up from a phone and walks the valley from a desk', () => {
    expect(pickApp('', PHONE)).toBe('dialup')
    expect(pickApp('', MOUSE)).toBe('valley')
    // Anything with a fine pointer anywhere walks.
    expect(pickApp('', TABLET_WITH_PEN)).toBe('valley')
  })

  it('takes the page at its word', () => {
    expect(pickApp('?dialup', MOUSE)).toBe('dialup')
    expect(pickApp('?valley3d', PHONE)).toBe('valley')
    expect(pickApp('?valley=spec-1&dialup', MOUSE)).toBe('dialup')
  })
})

describe('switchUrl', () => {
  it('keeps the page and swaps the app', () => {
    const at = { pathname: '/', search: '?valley=v1&dialup', hash: '#x' }
    expect(switchUrl(at, 'valley')).toBe('/?valley=v1&valley3d#x')
    expect(switchUrl({ ...at, search: '' }, 'dialup')).toBe('/?dialup#x')
    expect(
      pickApp(new URL(switchUrl(at, 'valley'), 'http://x').search, PHONE)
    ).toBe('valley')
  })
})
