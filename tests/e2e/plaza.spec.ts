import { copy } from './copy.ts'
import { beginRaid, expect, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Bull Valley Plaza: Wick, the squatter in the Golden Wok, deals (rule
// 24); the key he sells opens the Video Vault's back room for whoever
// carries it (keys.ts); and the $20 the day leaves in its safe is cash
// (rule 4).

const cash = (page: Page) => page.evaluate(() => window.__bv?.cash ?? 0)

// Whether the back room's door stops a raider standing in its opening.
const doorStops = (page: Page) =>
  page.evaluate(() => {
    const bv = window.__bv
    const plaza = bv?.world.plaza
    if (!bv || !plaza) throw new Error('no plaza')
    const { x, z } = plaza.doorAt
    const out = bv.world.walls.resolve(x, z, 0.3)
    return Math.hypot(out.x - x, out.z - z) > 0.05
  })

test('Wick sells the key, the key opens the back room, and its $20 is cash', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  expect(await doorStops(page)).toBe(true)

  // In front of Wick, the way he faces.
  await page.evaluate(() => {
    const bv = window.__bv
    const plaza = bv?.world.plaza
    if (!bv || !plaza) throw new Error('no plaza')
    const { at, group } = plaza.dealer
    const turn = group.rotation.y
    bv.player.relocate(
      at.x + Math.sin(turn) * 1.2,
      at.z + Math.cos(turn) * 1.2,
      0
    )
  })
  await heardWhere(page)
  const before = await cash(page)
  await page.keyboard.press('KeyE')
  const dialog = page.locator('.bv-deal')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(copy('dealer.says'))
  await dialog.locator('[data-good="vault-key"] [data-bv="deal-buy"]').click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['vault-key']))
    .toBe(1)
  await expect.poll(() => cash(page)).toBe(before - 2000)
  await expect(page.locator('.bv-chat')).toContainText(
    copy('dealer.bought', { item: copy('items.vault-key.label') })
  )
  // He will not sell a second.
  await expect(
    dialog.locator('[data-good="vault-key"] [data-bv="deal-buy"]')
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // The key in the pack, the door lets this raider through.
  expect(await doorStops(page)).toBe(false)

  // The $20 in the safe, taken up, goes into the wallet.
  const paid = await cash(page)
  await page.evaluate(() => {
    const bv = window.__bv
    const twenty = bv?.world.pickups.find((p) => p.kind === 'twenty')
    if (!bv || !twenty) throw new Error('no twenty')
    bv.player.relocate(twenty.x + 0.6, twenty.z, 0)
  })
  await expect(page.locator('.bv-item-label')).toContainText(
    copy('labels.twenty')
  )
  await page.keyboard.press('KeyE')
  await expect.poll(() => cash(page)).toBe(paid + 2000)
})
