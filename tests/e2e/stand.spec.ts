import { copy } from './copy.ts'
import { beginRaid, expect, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Rule 23: every account keeps its own Cabbage Stand on the spawn Citgo's
// lot. E beside it opens its dialog: goods go out of the pack onto its
// table, and cash and goods buy its next level.

const stand = (page: Page) =>
  page.evaluate(() => {
    const ledger = window.__bv?.stand
    return ledger ? { ...ledger, stock: { ...ledger.stock } } : null
  })

test('E at the stand puts cabbages out and buys the next level', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  await expect.poll(async () => (await stand(page))?.level).toBe(1)
  await page.evaluate(() => window.__bv?.grant('cabbage', 6))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.cabbage))
    .toBe(6)
  const cash = await page.evaluate(() => window.__bv?.cash ?? 0)

  // In front of the stand, on the pumps' side of it.
  await page.evaluate(() => {
    const bv = window.__bv
    const at = bv?.standAt
    const station = bv?.world.spawnStation
    if (!bv || !at || !station) throw new Error('no stand')
    const d = Math.hypot(station.x - at.x, station.z - at.z)
    const x = at.x + ((station.x - at.x) / d) * 1.8
    const z = at.z + ((station.z - at.z) / d) * 1.8
    bv.player.relocate(x, z, 0)
  })
  await heardWhere(page)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.stand'))
  await page.keyboard.press('KeyE')
  const dialog = page.locator('.bv-stand')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(copy('stand.idle'))

  const cabbage = dialog.locator('[data-good="cabbage"]')
  await cabbage.locator('[data-bv="stand-stock-one"]').click()
  await expect.poll(async () => (await stand(page))?.stock.cabbage).toBe(1)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.cabbage))
    .toBe(5)
  await expect(dialog).not.toContainText(copy('stand.idle'))

  // Level 2 costs $10 and four cabbages.
  await dialog.locator('[data-bv="stand-upgrade"]').click()
  await expect.poll(async () => (await stand(page))?.level).toBe(2)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.cash))
    .toBe(cash - 1000)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.cabbage))
    .toBe(1)
  await expect(page.locator('.bv-chat')).toContainText(
    copy('log.stand_upgraded', { level: 2 })
  )

  // The rest of the pack's cabbages go out at once.
  await cabbage.locator('[data-bv="stand-stock-all"]').click()
  await expect.poll(async () => (await stand(page))?.stock.cabbage).toBe(2)
  await expect(cabbage.locator('[data-bv="stand-stock-all"]')).toBeDisabled()

  // Nothing banked yet, so nothing to collect.
  await expect(dialog.locator('[data-bv="stand-collect"]')).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
