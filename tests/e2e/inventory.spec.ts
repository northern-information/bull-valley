import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  freshValley,
  passReturning,
  test,
} from './fixtures.ts'

test('Tab opens the pack, a number key assigns, the hotbar uses and is kept', async ({
  page,
}) => {
  const valley = freshValley()
  await beginRaid(page, 0, { valley })
  const open = page.locator('#bv-root.bv-shell--inventory')
  const cell = page.locator('.bv-bag-cell[data-kind="marlboro"]')
  const card = page.locator('.bv-bag-card')
  const slots = page.locator('.bv-hot-slot')
  const hotbar = () => page.evaluate(() => window.__bv?.hotbar)
  const marlboros = () =>
    page.evaluate(() => window.__bv?.inventory.marlboro ?? 0)

  // A new account's bar is empty, so none shows.
  await expect(slots).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(open).toHaveCount(1)
  await expect(card).toBeHidden()

  // Hovering an item shows its card.
  await cell.hover()
  await expect(card).toBeVisible()
  await expect(card.locator('.bv-bag-card-name')).toHaveText(
    copy('items.marlboro.label')
  )

  // 3 over it puts it on the bar, and the account keeps it.
  const saved = page.waitForResponse(
    (res) => res.url().endsWith('/auth/hotbar') && res.ok()
  )
  await page.keyboard.press('Digit3')
  await saved
  await expect.poll(async () => (await hotbar())?.[2]).toBe('marlboro')
  await expect(slots).toHaveCount(1)
  await expect(slots.locator('.bv-hot-key')).toHaveText('3')

  // Closing locks the pointer again, a beat later.
  await page.keyboard.press('Tab')
  await expect(open).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)

  // 3 in the valley smokes one, and says so in the chat.
  const before = await marlboros()
  await page.keyboard.press('Digit3')
  await expect.poll(marlboros).toBe(before - 1)
  // The right hand brings the pack up.
  expect(await page.evaluate(() => window.__bv?.using?.kind)).toBe('marlboro')
  await expect
    .poll(() =>
      page.evaluate(() => window.__bv?.chat.map((line) => line.text) ?? [])
    )
    .toContain(copy('items.marlboro.used'))

  // A reload brings the bar back from the account.
  await page.reload()
  await passReturning(page)
  await expect
    .poll(() => page.evaluate(() => !!window.__bv), { timeout: 30_000 })
    .toBe(true)
  await expect.poll(async () => (await hotbar())?.[2]).toBe('marlboro')
  await expect(slots).toHaveCount(1)
})
