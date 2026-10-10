import { copy } from './copy.ts'
import { beginRaid, expect, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Bull Valley Plaza: Erwin von Dutch, the squatter in the Golden Wok,
// barters and never takes cash (rule 24), and gives the rose quest (rule
// 25): the rose laid at the heart of the maze earns the key that opens
// the Video Vault's office for whoever carries it (keys.ts), and the $20
// the day leaves in its safe is cash (rule 4).

const cash = (page: Page) => page.evaluate(() => window.__bv?.cash ?? 0)
const held = (page: Page, kind: string) =>
  page.evaluate((k) => window.__bv?.inventory[k] ?? 0, kind)

// Whether the office's door stops a raider standing in its opening.
const doorStops = (page: Page) =>
  page.evaluate(() => {
    const bv = window.__bv
    const plaza = bv?.world.plaza
    if (!bv || !plaza) throw new Error('no plaza')
    const { x, z } = plaza.doorAt
    const out = bv.world.walls.resolve(x, z, 0.3)
    return Math.hypot(out.x - x, out.z - z) > 0.05
  })

// In front of Erwin, the way he faces, and heard there.
async function toErwin(page: Page): Promise<void> {
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
}

test('Erwin barters, the rose earns the key, the key opens the office', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  expect(await doorStops(page)).toBe(true)
  await page.evaluate(() => window.__bv?.grant('marlboro', 100))
  await expect.poll(() => held(page, 'marlboro')).toBeGreaterThan(99)

  // A tab of LSD for Marlboros; the wallet is never touched.
  await toErwin(page)
  const before = await cash(page)
  const smokes = await held(page, 'marlboro')
  await page.keyboard.press('KeyE')
  const dialog = page.locator('.bv-deal')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(copy('dealer.ramble_1'))
  await dialog.locator('[data-kind="marlboro"]').click()
  await dialog.locator('[data-good="lsd"] [data-bv="deal-buy"]').click()
  await expect.poll(() => held(page, 'lsd')).toBe(1)
  expect(await held(page, 'marlboro')).toBeLessThan(smokes)
  expect(await cash(page)).toBe(before)

  // He gives the rose.
  await expect(dialog).toContainText(copy('quests.rose_offer'))
  await dialog.locator('[data-bv="deal-quest-go"]').click()
  await expect.poll(() => held(page, 'rose')).toBe(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Laid at the heart of the maze, the Caretaker parked at the maze's far
  // corner, out of sight of it: a strike there would leave the rose on the
  // raider's body.
  await page.evaluate(() => {
    const bv = window.__bv
    const portal = bv?.world.portal
    const corner = bv?.world.mazePlace
    if (!bv || !portal || !corner) throw new Error('no maze')
    bv.placeCaretaker(corner.x, corner.z)
    bv.player.relocate(portal.rose.position.x, portal.rose.position.z, 0)
  })
  await heardWhere(page)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.lay'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => held(page, 'rose')).toBe(0)
  await expect(page.locator('.bv-chat')).toContainText(
    copy('quests.rose_placed')
  )

  // Back to Erwin for the key; the door lets this raider through.
  await toErwin(page)
  await page.keyboard.press('KeyE')
  await expect(dialog).toContainText(copy('quests.rose_laid'))
  await dialog.locator('[data-bv="deal-quest-go"]').click()
  await expect.poll(() => held(page, 'vault-key')).toBe(1)
  await page.keyboard.press('Escape')
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
