import { copy } from './copy.ts'
import { beginRaid, expect, freshRaider, test } from './fixtures.ts'

// Your Name, in the pause overlay's Settings beside Account and Sign Out:
// a new username, checked as you type, then saved, and the valley knows
// the raider by it.

test('Your Name in Settings changes the name the valley knows', async ({
  page,
}) => {
  // One long flow (sign in, rename, chat) through a full valley.
  test.slow()
  await beginRaid(page)
  // Letting the pointer go opens the overlay on its menu.
  await page.evaluate(() => document.exitPointerLock())
  await page.locator('[data-bv="overlay-settings"]').click()
  await page.locator('[data-bv="intro-name"]').click()
  const dialog = page.getByRole('dialog', {
    name: copy('name.title'),
    exact: true,
  })
  await expect(dialog).toBeVisible()

  const field = dialog.locator('[data-bv="name-username"]')
  const name = freshRaider('Renamed').username
  await field.fill(name)
  await expect(dialog.locator('[data-bv="name-status"]')).toHaveText(
    copy('username.available')
  )
  await dialog.getByRole('button', { name: copy('name.change_name') }).click()
  await expect(dialog.locator('[data-bv="name-status"]')).toHaveText(
    copy('name.renamed', { name })
  )
  // The overlay's Raiding As follows it.
  await expect(page.locator('[data-bv="intro-username"]')).toHaveText(name)
  await dialog.locator('[data-bv="name-close"]').click()
  await expect(dialog).toHaveCount(0)

  // The valley knows the new name: a chat line comes back from it under
  // the name the valley read from the account.
  await page.locator('[data-bv="begin"]').click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)
  await page.keyboard.press('Enter')
  await page.keyboard.type('a new name says hello')
  await page.keyboard.press('Enter')
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__bv?.chat.find((line) => line.text === 'a new name says hello')
      )
    )
    .toMatchObject({ name })
})
