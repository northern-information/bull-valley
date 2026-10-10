import { copy } from './copy.ts'
import {
  expect,
  freshRaider,
  freshValley,
  signIn,
  test,
  toCharacterSelect,
  toMenu,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// The main menu and the account step behind it. A visitor with no session
// is offered Create Account alone, which opens the sign-in card; the Dev
// provider stands in for a real one and walks the new-raider path: the
// round trip lands back past the colophon, on Choose Your Username, behind
// the magic word, and then on the menu with Die.

const menuButton = (page: Page, key: string) =>
  page.getByRole('button', { name: copy(key), exact: true })

// Colophon, then the menu, then Create Account to the sign-in face.
async function toSignIn(page: Page): Promise<void> {
  await toMenu(page)
  await expect(menuButton(page, 'menu.die')).toBeHidden()
  await menuButton(page, 'menu.create_account').click()
  await expect(page.locator('[data-face="sign-in"]')).toBeVisible()
}

// Through the Dev provider as a new raider, back to Choose Your Username.
async function arriveNew(page: Page): Promise<void> {
  await page
    .getByRole('button', {
      name: copy('signin.provider', { provider: 'Dev' }),
    })
    .click()
  await page.getByLabel('User ID').fill(freshRaider().userId)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.locator('[data-face="username"]')).toBeVisible()
}

test('a new raider signs in, says the magic word, and chooses a username', async ({
  page,
  browser,
  errors,
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
  const word = page.getByLabel(copy('username.magic_word'))
  const error = page.locator('[data-face="username"] .bv-account-error')
  await expect(field).toBeFocused()
  await expect(confirm).toBeDisabled()

  await field.fill('ab')
  await expect(status).toHaveAttribute('data-tone', 'bad')
  await field.fill(taken.username.toUpperCase())
  await expect(status).toHaveText(copy('username.taken'))
  const mine = freshRaider('New').username
  await field.fill(mine)
  await expect(status).toHaveText(copy('username.available'))
  // The magic word stands between an available name and an account.
  await expect(confirm).toBeDisabled()
  await word.fill('cabbages')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(error).toHaveText(copy('auth.magic_word_wrong'))
  // The refusal is the one failed request this spec expects.
  expect(errors).toEqual([
    expect.stringMatching(/^403 .*\/auth\/confirm-signup$/),
  ])
  errors.length = 0
  await expect(page.locator('[data-face="username"]')).toBeVisible()

  await word.fill('berries')
  await expect(error).toBeHidden()
  await expect(confirm).toBeEnabled()
  await field.press('Enter')
  await expect(page.locator('.bv-account')).toHaveCount(0)
  // Back on the menu, signed in: Die goes on to the select.
  await expect(menuButton(page, 'menu.create_account')).toBeHidden()
  await menuButton(page, 'menu.die').click()
  await expect(page.locator('[data-bv="select-username"]')).toHaveText(mine)

  // Sign Out at the select starts over at the sign-in card.
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('[data-bv="select-sign-out"]').click(),
  ])
  await toSignIn(page)
})

test('the music volume is kept on the account', async ({ page }) => {
  await signIn(page)
  await page.goto('/')
  await toMenu(page)
  await menuButton(page, 'menu.settings').click()
  const slider = page.locator('.bv-menu [data-bv="setting-music"]')
  await expect(slider).toBeVisible()
  const start = Number(await slider.inputValue())
  const saved = page.waitForRequest(
    (r) => r.url().endsWith('/auth/settings') && r.method() === 'PUT'
  )
  // ← and → move the slider; letting it be saves it.
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  const want = String(start + 10)
  await expect(slider).toHaveValue(want)
  await expect(
    page.locator('.bv-menu [data-bv="setting-music-level"]')
  ).toHaveText(copy('menu.music_level', { percent: want }))
  await saved
  // Another load of the page reads it back from the account.
  await page.goto('/')
  await toMenu(page)
  await menuButton(page, 'menu.settings').click()
  await expect(slider).toHaveValue(want)
})

test('Back on the sign-in card returns to the menu', async ({ page }) => {
  await page.goto('/')
  await toSignIn(page)
  await page.keyboard.press('Escape')
  await expect(menuButton(page, 'menu.create_account')).toBeFocused()
  await menuButton(page, 'menu.create_account').click()
  await expect(page.locator('[data-face="sign-in"]')).toBeVisible()
  await menuButton(page, 'menu.back').click()
  await expect(menuButton(page, 'menu.create_account')).toBeVisible()
})

test('Settings opens the account panel and steps back', async ({ page }) => {
  const raider = await signIn(page)
  await page.goto('/')
  await toMenu(page)
  await expect(menuButton(page, 'menu.die')).toBeFocused()
  // ↓ walks the options.
  await page.keyboard.press('ArrowDown')
  await expect(menuButton(page, 'menu.settings')).toBeFocused()
  await page.keyboard.press('Enter')
  await menuButton(page, 'menu.account').click()
  const panel = page.getByRole('dialog', {
    name: copy('panel.title'),
    exact: true,
  })
  await expect(panel.locator('[data-bv="panel-username"]')).toHaveText(
    raider.username
  )
  // Escape closes the panel first, then steps back out of Settings.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(menuButton(page, 'menu.die')).toBeFocused()
})

test('Quit says to close a tab the page cannot close', async ({ page }) => {
  await signIn(page)
  await page.goto('/')
  await toMenu(page)
  await menuButton(page, 'menu.quit').click()
  await expect(page.getByText(copy('menu.quit_blocked'))).toBeVisible()
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
  const panel = page.getByRole('dialog', {
    name: copy('panel.title'),
    exact: true,
  })
  const linked = panel.locator('[data-bv="panel-linked"] li')
  const status = panel.locator('[data-bv="panel-status"]')
  await expect(panel.locator('[data-bv="panel-username"]')).toHaveText(
    raider.username
  )
  // One provider is the only way in, so it cannot be unlinked.
  await expect(linked).toHaveCount(1)
  await expect(linked).toContainText(copy('panel.only_way_in'))
  await expect(panel.getByRole('button', { name: /^Unlink/ })).toHaveCount(0)

  // While the panel is open, the select's keys do nothing.
  const character = page.locator('.bv-select-name')
  const before = await character.textContent()
  await page.keyboard.press('ArrowRight')
  await expect(character).toHaveText(before ?? '')

  // Linking runs in a popup that reports back and closes itself.
  const opened = page.waitForEvent('popup')
  await panel
    .getByRole('button', {
      name: copy('panel.link', { provider: 'Dev' }),
    })
    .click()
  const popup = await opened
  if (!popup.isClosed()) await popup.waitForEvent('close')
  await expect(linked).toHaveCount(2)
  await expect(status).toHaveText(copy('panel.linked_ok'))

  await panel
    .getByRole('button', { name: /^Unlink/ })
    .first()
    .click()
  await expect(status).toHaveText(copy('panel.unlinked', { provider: 'Dev' }))
  await expect(linked).toHaveCount(1)
  await expect(linked).toContainText(copy('panel.only_way_in'))

  // Escape closes the panel and gives the select its keys back.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await expect(character).not.toHaveText(before ?? '')
})
