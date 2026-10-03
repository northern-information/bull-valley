import { test as base, expect } from '@playwright/test'
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

// From a fresh load to the character select: start and skip the
// colophon, then skip the logo.
export async function toCharacterSelect(page: Page): Promise<void> {
  // The first press starts the colophon, the second skips it.
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  // The logo arms once the colophon has lifted.
  await expect(page.getByAltText('Bull Valley Shadow Wars')).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.locator('.bv-select-ui')).toBeVisible()
}

// From a fresh load to the intro dialog, choosing at the character select
// after `steps` presses of →, as `name`. A fresh context has no saved
// name, so the field starts focused and empty; Escape hands the arrows
// back to the turntable.
export async function passTitles(
  page: Page,
  steps = 0,
  name = 'Raider'
): Promise<void> {
  await toCharacterSelect(page)
  const field = page.locator('[data-bv="select-player-name"]')
  await field.fill(name)
  await page.keyboard.press('Escape')
  for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('.bv-select')).toHaveCount(0)
}

export interface BeginOptions {
  // The valley (Durable Object) to join. Specs run in parallel against one
  // dev server, so each page gets a valley of its own unless a spec wants
  // two pages to meet.
  valley?: string
  // The name typed at the character select.
  name?: string
}

export function freshValley(prefix = 'spec'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// Load the game, pass the titles, and begin the raid. Under webdriver the
// dev build starts without pointer lock.
export async function beginRaid(
  page: Page,
  steps = 0,
  { valley = freshValley(), name = 'Raider' }: BeginOptions = {}
): Promise<void> {
  await page.goto(`/?valley=${encodeURIComponent(valley)}`)
  await passTitles(page, steps, name)
  // boot() sets the dev hook last, after the input listeners; the button
  // reads "Click to Play" before boot starts, so its text is not a signal.
  await expect
    .poll(() => page.evaluate(() => !!window.__bv), { timeout: 30_000 })
    .toBe(true)
  // The valley answers (or does not) within CONFIG.net.connectTimeoutMs.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.net.status))
    .not.toBe('connecting')
  const begin = page.locator('[data-bv="begin"]')
  await expect(begin).toBeEnabled()
  await begin.click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)
}
