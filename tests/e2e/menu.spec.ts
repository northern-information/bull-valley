import { copy } from './copy.ts'
import { beginRaid, expect, test } from './fixtures.ts'

// Esc is the browser's and only frees the pointer to a light pause; Q
// opens the pause overlay, and its Click to Die goes back in.

test('Q opens the pause overlay, and Click to Die closes it', async ({
  page,
}) => {
  await beginRaid(page)
  const intro = page.locator('.bv-intro')
  await expect(intro).toBeHidden()
  await page.keyboard.press('KeyQ')
  await expect(intro).toBeVisible()
  await expect(page.locator('.bv-break')).toBeHidden()
  await page.getByRole('button', { name: copy('hud.begin_play') }).click()
  await expect(intro).toBeHidden()
})
