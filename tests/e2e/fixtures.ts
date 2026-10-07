import { test as base, expect } from '@playwright/test'
import { devSignInUrl } from '../../src/account.ts'
import { copy } from './copy.ts'
import type { Page } from '@playwright/test'

// Collect console errors, failed responses, and uncaught page errors.
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    // HTTP failures are logged below with their URL.
    if (msg.text().startsWith('Failed to load resource')) return
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`)
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

// Every spec fails on a console error or an uncaught page error.
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors = watchErrors(page)
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

// Start and skip the colophon, then skip the logo.
async function skipCards(page: Page): Promise<void> {
  // The first press starts the colophon, the second skips it.
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  // The logo arms once the colophon has lifted.
  await expect(page.getByAltText(copy('titles.logo_alt'))).toBeVisible()
  await page.keyboard.press('Space')
}

// From a fresh load to the character select.
export async function toCharacterSelect(page: Page): Promise<void> {
  await skipCards(page)
  await expect(page.locator('.bv-select-ui')).toBeVisible()
}

// From a load by a raider who has chosen before to the intro dialog: the
// select never shows.
export async function passReturning(page: Page): Promise<void> {
  await skipCards(page)
  await expect(page.locator('.bv-select')).toHaveCount(0)
  await expect(page.locator('[data-bv="begin"]')).toBeVisible()
}

// From a signed-in load to the intro dialog, choosing at the character
// select after `steps` presses of →. Signed in with a username, the account
// step never shows; a raider who has chosen before never sees the select,
// so `steps` must be 0 for them.
export async function passTitles(page: Page, steps = 0): Promise<void> {
  await skipCards(page)
  const select = page.locator('.bv-select')
  const ui = page.locator('.bv-select-ui')
  await expect
    .poll(async () => (await select.count()) === 0 || (await ui.isVisible()))
    .toBe(true)
  if ((await select.count()) === 0) {
    if (steps) throw new Error('A returning raider never sees the select')
    return
  }
  for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('.bv-select')).toHaveCount(0)
}

// A dev-provider account. Specs run in parallel against one accounts
// database, and a username is taken once, so each gets a tagged one.
export interface Raider {
  userId: string
  username: string
}

export function freshRaider(name = 'Raider'): Raider {
  const tag = Math.random().toString(36).slice(2, 7)
  return {
    userId: `e2e-${Date.now().toString(36)}-${tag}`,
    // At most 10 + 1 + 5 = 16, the username limit.
    username: `${name.slice(0, 10)}_${tag}`,
  }
}

// Sign a raider in through the dev provider, past the magic word
// and with a username, landing on the page a sign-in popup closes. The
// cookies are the browser context's, so the next load of the game is
// signed in. Signing the same raider in again finds the same account.
export async function signIn(
  page: Page,
  raider: Raider = freshRaider()
): Promise<Raider> {
  await page.goto(devSignInUrl({ ...raider, redirect: '/auth-done.html' }))
  await expect(page.getByText('Signed in.')).toBeVisible()
  return raider
}

export interface BeginOptions {
  // The valley (Durable Object) to join. Specs run in parallel against one
  // dev server, so each page gets a valley of its own unless a spec wants
  // two pages to meet.
  valley?: string
  // Who to sign in as; a fresh raider unless a spec needs the same account
  // twice. Two pages that must be two raiders need two browser contexts,
  // since the session is a cookie.
  raider?: Raider
}

// After a teleport, until the valley has been told where the raider now
// stands: its shadowmen cross round the place it last heard, and one placed
// far from every raider it knows is gone in its next step.
export async function heardWhere(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bv = window.__bv
        if (!bv?.sent) return Infinity
        const { x, z } = bv.player.pos
        return Math.hypot(bv.sent.x - x, bv.sent.z - z)
      })
    )
    .toBeLessThan(1)
}

export function freshValley(prefix = 'spec'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// Sign in, load the game, pass the titles, and begin the raid. Under
// webdriver the dev build starts without pointer lock. Resolves with the
// raider, whose username is the name the valley shows.
export async function beginRaid(
  page: Page,
  steps = 0,
  { valley = freshValley(), raider = freshRaider() }: BeginOptions = {}
): Promise<Raider> {
  await signIn(page, raider)
  await page.goto(`/?valley=${encodeURIComponent(valley)}`)
  await passTitles(page, steps)
  // boot() sets the dev hook last, after the input listeners; the button
  // reads "Click to Die" before boot starts, so its text is not a signal.
  await expect
    .poll(() => page.evaluate(() => !!window.__bv), { timeout: 30_000 })
    .toBe(true)
  // The valley answers (or does not) within CONFIG.net.connectTimeoutMs.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.net.status))
    .not.toBe('connecting')
  // Raiders are on foot from the start: a quiet valley, where only the
  // shadowmen a spec places come for anyone.
  await page.evaluate(() => window.__bv?.calm())
  const begin = page.locator('[data-bv="begin"]')
  await expect(begin).toBeEnabled()
  await begin.click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)
  return raider
}
