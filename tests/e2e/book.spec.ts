import { copy } from './copy.ts'
import { beginRaid, expect, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// The Book of Shadows fills as the raider goes: the spawn Citgo and the
// starting pack are written at the first Begin, a place when the raider
// walks near it, and the valley keeps it (tests/worker covers the
// keeping). B opens it over the valley; what is not found yet reads ???.

const found = (page: Page) => page.evaluate(() => window.__bv?.book ?? [])

test('the Book of Shadows fills as the raider goes', async ({ page }) => {
  await beginRaid(page)
  // The Citgo they stand at, and what the pack starts with.
  const held = await page.evaluate(() =>
    Object.entries(window.__bv?.inventory ?? {})
      .filter(([, n]) => n > 0)
      .map(([kind]) => kind)
  )
  expect(held.length).toBeGreaterThan(0)
  await expect
    .poll(() => found(page))
    .toEqual(expect.arrayContaining(['citgo', ...held]))
  await expect(page.locator('.bv-book-toast')).toContainText(copy('book.toast'))

  // Walked up to the wreck, it is written too.
  await page.evaluate(() => {
    const bv = window.__bv
    const wreck = bv?.world.wreck
    if (!bv || !wreck) throw new Error('no wreck')
    const { x, z } = wreck.group.position
    bv.player.relocate(x + 4, z, bv.player.yaw)
  })
  await expect.poll(() => found(page)).toContain('wreck')
  await expect(page.locator('[data-bv="book-toast"]')).toContainText(
    copy('book.wreck.name')
  )

  // And Bull Valley Plaza, walked up to out front.
  await page.evaluate(() => {
    const bv = window.__bv
    const plaza = bv?.world.plaza
    if (!bv || !plaza) throw new Error('no plaza')
    const { x, z } = plaza.group.position
    bv.player.relocate(x, z, bv.player.yaw)
  })
  await expect.poll(() => found(page)).toContain('strip-mall')
  await expect(page.locator('[data-bv="book-toast"]')).toContainText(
    copy('book.strip-mall.name')
  )

  // B opens it with the pointer free; the folk not yet spoken to are dark.
  await page.keyboard.press('KeyB')
  await expect.poll(() => page.evaluate(() => window.__bv?.bookOpen)).toBe(true)
  const book = page.getByRole('dialog', { name: copy('book.title') })
  await expect(book).toBeVisible()
  await expect(page.locator('[data-bv="book-name"]')).toHaveText(
    copy('book.citgo.name')
  )
  // Two chapters on: the folk, on Matthew Marx, not yet spoken to.
  await page.keyboard.press('KeyD')
  await page.keyboard.press('KeyD')
  await expect(page.locator('[data-bv="book-name"]')).toHaveText(
    copy('book.unknown')
  )
  await expect(book).toContainText(copy('book.unknown_lore'))
  // B again puts it away.
  await page.keyboard.press('KeyB')
  await expect(book).toBeHidden()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.bookOpen))
    .toBe(false)
})
