import { beginRaid, expect, test } from './fixtures.ts'

test('Tab opens the carousel, arrows cycle it, Tab closes it', async ({
  page,
}) => {
  await beginRaid(page)
  const open = page.locator('#bv-root.bv-shell--inventory')
  const name = page.locator('[data-bv="inv-name"]')

  await page.keyboard.press('Tab')
  await expect(open).toHaveCount(1)
  const first = (await name.textContent()) ?? ''

  await page.keyboard.press('ArrowRight')
  await expect(name).not.toHaveText(first)
  await page.keyboard.press('ArrowLeft')
  await expect(name).toHaveText(first)

  await page.keyboard.press('Tab')
  await expect(open).toHaveCount(0)
})
