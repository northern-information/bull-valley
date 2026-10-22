import { copy } from './copy.ts'
import { beginRaid, expect, test } from './fixtures.ts'

// Esc is the browser's: it frees the pointer, and a freed pointer is the
// menu, with the valley playing on under it. It closes nothing else; every
// panel closes on its own key. H opens the controls, Back steps to the
// menu's list, and its Click to Die goes back in.

test('H opens the controls, Back the menu, Click to Die closes it', async ({
  page,
}) => {
  await beginRaid(page)
  const intro = page.locator('.bv-intro')
  await expect(intro).toBeHidden()
  await page.keyboard.press('KeyH')
  await expect(intro).toBeVisible()
  await expect(intro).toHaveAttribute('data-face', 'controls')
  await expect(
    page.getByRole('table', { name: copy('intro.controls_label') })
  ).toBeVisible()
  await page.getByRole('button', { name: copy('overlay.back') }).click()
  await expect(intro).toHaveAttribute('data-face', 'menu')
  await expect(
    page.getByRole('table', { name: copy('intro.controls_label') })
  ).toBeHidden()
  await expect(
    page.getByRole('button', { name: copy('intro.exit_menu') })
  ).toBeVisible()
  await page.getByRole('button', { name: copy('overlay.settings') }).click()
  await expect(intro).toHaveAttribute('data-face', 'settings')
  await page.getByRole('button', { name: copy('hud.begin_play') }).click()
  await expect(intro).toBeHidden()
})

test('Esc never closes the pack; Tab does', async ({ page }) => {
  await beginRaid(page)
  await page.keyboard.press('Tab')
  const pack = page.getByRole('dialog', { name: copy('inventory.label') })
  await expect(pack).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pack).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(pack).toBeHidden()
})
