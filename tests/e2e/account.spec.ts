import {
  expect,
  freshRaider,
  freshValley,
  signIn,
  test,
  toCharacterSelect,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// The account step between the logo and the character select. A visitor
// with no session meets the sign-in card; the Dev provider stands in for a
// real one and walks the new-raider path: the round trip lands back past
// the titles, on Choose Your Username, behind the age and terms gates.

// Colophon, then logo, then the account step's sign-in face.
async function toSignIn(page: Page): Promise<void> {
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  await expect(page.getByAltText('Bull Valley Shadow Wars')).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.locator('[data-face="sign-in"]')).toBeVisible()
}

// Through the Dev provider as a new raider, back to Choose Your Username.
async function arriveNew(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign In with Dev' }).click()
  await page.getByLabel('User ID').fill(freshRaider().userId)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.locator('[data-face="username"]')).toBeVisible()
}

test('a new raider signs in, passes the gates, and chooses a username', async ({
  page,
  browser,
}) => {
  // Someone else already has a username, to find it taken.
  const other = await browser.newContext()
  const taken = await signIn(await other.newPage())
  await other.close()

  const valley = freshValley('account')
  await page.goto(`/?valley=${valley}`)
  await toSignIn(page)
  await expect(page.locator('.bv-select-ui')).toBeHidden()
  await arriveNew(page)
  // The round trip's flag is gone from the address; the rest stays.
  expect(new URL(page.url()).search).toBe(`?valley=${valley}`)

  const field = page.locator('[data-bv="account-username"]')
  const status = page.locator('.bv-account-status')
  const confirm = page.locator('[data-bv="account-confirm"]')
  const age = page.getByLabel('I am 13 years or older')
  const terms = page.getByLabel('I agree to the Terms of Service')
  await expect(field).toBeFocused()
  await expect(confirm).toBeDisabled()

  await field.fill('ab')
  await expect(status).toHaveAttribute('data-tone', 'bad')
  await field.fill(taken.username.toUpperCase())
  await expect(status).toHaveText('Taken')
  const mine = freshRaider('New').username
  await field.fill(mine)
  await expect(status).toHaveText('Available')
  // Both gates stand between an available name and an account.
  await expect(confirm).toBeDisabled()
  await age.check()
  await expect(confirm).toBeDisabled()

  // The terms open in place, and Escape closes them, not the step.
  await page.locator('[data-bv="account-terms-link"]').click()
  const panel = page.getByRole('dialog', { name: 'Terms of Service' })
  await expect(panel).toBeVisible()
  await expect(
    page.frameLocator('.bv-terms iframe').getByRole('heading', {
      name: 'Terms of Service',
    })
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page.locator('[data-face="username"]')).toBeVisible()

  await terms.check()
  await expect(confirm).toBeEnabled()
  await field.press('Enter')
  await expect(page.locator('.bv-account')).toHaveCount(0)
  await expect(page.locator('[data-bv="select-username"]')).toHaveText(mine)

  // Sign Out at the select starts over at the sign-in card.
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('[data-bv="select-sign-out"]').click(),
  ])
  await toSignIn(page)
})

test('Cancel at Choose Your Username signs out', async ({ page }) => {
  await page.goto('/')
  await toSignIn(page)
  await arriveNew(page)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-face="sign-in"]')).toBeVisible()
  expect(
    await page.evaluate(() => fetch('/auth/me').then((r) => r.json()))
  ).toEqual({ account: null, pending: null })
})

test('the account panel links a second identity and unlinks one', async ({
  page,
}) => {
  const raider = await signIn(page)
  await page.goto(`/?valley=${freshValley('panel')}`)
  await toCharacterSelect(page)
  await page.locator('[data-bv="select-account"]').click()
  const panel = page.getByRole('dialog', { name: 'Account', exact: true })
  const linked = panel.locator('[data-bv="panel-linked"] li')
  const status = panel.locator('[data-bv="panel-status"]')
  await expect(panel.locator('[data-bv="panel-username"]')).toHaveText(
    raider.username
  )
  // One provider is the only way in, so it cannot be unlinked.
  await expect(linked).toHaveCount(1)
  await expect(linked).toContainText('Only Way In')
  await expect(panel.getByRole('button', { name: /^Unlink/ })).toHaveCount(0)

  // While the panel is open, the select's keys do nothing.
  const character = page.locator('.bv-select-name')
  const before = await character.textContent()
  await page.keyboard.press('ArrowRight')
  await expect(character).toHaveText(before ?? '')

  // Linking runs in a popup that reports back and closes itself.
  const opened = page.waitForEvent('popup')
  await panel.getByRole('button', { name: 'Link Dev' }).click()
  const popup = await opened
  if (!popup.isClosed()) await popup.waitForEvent('close')
  await expect(linked).toHaveCount(2)
  await expect(status).toHaveText('Linked.')

  await panel
    .getByRole('button', { name: /^Unlink/ })
    .first()
    .click()
  await expect(status).toHaveText('Unlinked Dev.')
  await expect(linked).toHaveCount(1)
  await expect(linked).toContainText('Only Way In')

  // Escape closes the panel and gives the select its keys back.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await expect(character).not.toHaveText(before ?? '')
})
