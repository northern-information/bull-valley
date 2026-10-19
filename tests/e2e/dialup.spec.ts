import { devices, expect, test } from '@playwright/test'
import { copy } from './copy.ts'
import { beginRaid, freshRaider, freshValley, signIn } from './fixtures.ts'
import type { Browser, Page } from '@playwright/test'

// Bull Valley Dial-Up (sharedworld.ts rule 29): a phone opens on the
// modem, dials the valley, and tends the account from wherever it is.

// A phone: Chromium's own mobile emulation, so the full Chromium the
// other specs drive does the work.
async function phone(browser: Browser): Promise<Page> {
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 5']
  const context = await browser.newContext(pixel)
  return context.newPage()
}

// Tap through the modem: one tap dials, a second skips the handshake.
async function dialIn(page: Page): Promise<void> {
  const modem = page.locator('.bv-modem')
  await expect(modem).toContainText(copy('dialup.tap'))
  await modem.click()
  await modem.click()
  await expect(page.locator('.bv-dial')).toBeVisible({ timeout: 15_000 })
}

test('a phone dials up instead of walking the valley, with no three.js', async ({
  browser,
}) => {
  const page = await phone(browser)
  const asked: string[] = []
  page.on('request', (req) => asked.push(req.url()))
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await expect(page).toHaveTitle(copy('dialup.title'))
  await dialIn(page)
  await expect(page.locator('.bv-modem')).toHaveCount(0)
  expect(asked.some((url) => /deps\/three\b|\/three\.module/.test(url))).toBe(
    false
  )
  // The way back to the valley.
  await expect(page.locator('.bv-dial-switch')).toHaveAttribute(
    'href',
    /valley3d/
  )
})

test('a phone no one is signed in on gets a login', async ({ browser }) => {
  const page = await phone(browser)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await page.locator('.bv-modem').click()
  await expect(page.locator('.bv-modem-screen')).toContainText(
    copy('dialup.modem.login'),
    { timeout: 15_000 }
  )
  await expect(page.locator('.bv-account')).toBeVisible({ timeout: 15_000 })
})

test('stows from the pack, takes it back out of the locker, and keeps the hotbar', async ({
  browser,
}) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  await page.locator('.bv-dial-tab[data-tab="pack"]').click()
  const pack = page.locator('.bv-dial-item[data-kind="marlboro"]')
  await pack.locator('summary').click()
  await pack.getByRole('button', { name: copy('dialup.pack.stow_one') }).click()
  // The locker, from the lobby, wherever the raider is.
  await page.locator('.bv-dial-tab[data-tab="lobby"]').click()
  await page.locator('.bv-dial-card[data-card="locker"]').click()
  const stowed = page.locator(
    '.bv-dial-sheet .bv-dial-item[data-kind="marlboro"]'
  )
  await expect(stowed).toBeVisible()
  await stowed.locator('summary').click()
  await stowed
    .getByRole('button', { name: copy('dialup.pack.take_all') })
    .click()
  await expect(stowed).toHaveCount(0)
  await page.getByRole('button', { name: copy('dialup.back') }).click()
  // A slot on the hotbar, kept on the account.
  await page.locator('.bv-dial-tab[data-tab="pack"]').click()
  const joint = page.locator('.bv-dial-item[data-kind="joints"]')
  await joint.locator('summary').click()
  await joint.getByRole('button', { name: copy('dialup.pack.hotbar') }).click()
  await page.locator('.bv-dial-slot[data-slot="2"]').click()
  await expect(page.locator('.bv-dial-toast')).toHaveText(
    copy('dialup.pack.hotbar_saved', {
      item: copy('items.joints.label'),
      slot: 3,
    })
  )
})

test('opens the Cabbage Stand from anywhere', async ({ browser }) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  await page.locator('.bv-dial-card[data-card="stand"]').click()
  await expect(page.locator('.bv-stand')).toBeVisible()
  await expect(page.locator('#bv-stand-title')).toHaveText(copy('stand.title'))
})

test('a raider in the valley hears a phone dial in', async ({ browser }) => {
  const valley = freshValley('dial')
  const desk = await (await browser.newContext()).newPage()
  await beginRaid(desk, 0, { valley })
  const page = await phone(browser)
  const raider = await signIn(page, freshRaider('Phone'))
  await page.goto(`/?valley=${encodeURIComponent(valley)}`)
  await dialIn(page)
  await expect
    .poll(() =>
      desk.evaluate(() => window.__bv?.chat.map((line) => line.text) ?? [])
    )
    .toContain(copy('log.peer_dialed', { name: raider.username }))
})
