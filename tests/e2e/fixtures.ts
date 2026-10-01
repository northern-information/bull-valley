import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Every spec fails on a console error or an uncaught page error.
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        // HTTP failures are logged below with their URL.
        if (msg.text().startsWith('Failed to load resource')) return
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('response', (res) => {
        // The site has no favicon; Chromium asks for one anyway.
        if (new URL(res.url()).pathname === '/favicon.ico') return
        if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`)
      })
      page.on('pageerror', (err) => errors.push(err.message))
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

// Load the game, skip the colophon splash, and begin the raid. Under
// webdriver the dev build starts without pointer lock.
export async function beginRaid(page: Page): Promise<void> {
  await page.goto('/')
  await page.keyboard.press('Space')
  // boot() sets the dev hook last, after the input listeners; the button
  // reads "Click to Play" before boot starts, so its text is not a signal.
  await expect
    .poll(() => page.evaluate(() => !!window.__bv), { timeout: 30_000 })
    .toBe(true)
  const begin = page.locator('[data-bv="begin"]')
  await expect(begin).toBeEnabled()
  await begin.click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)
}
