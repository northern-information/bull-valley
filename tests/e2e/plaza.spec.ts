import { copy } from './copy.ts'
import { beginRaid, expect, faceSpot, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Bull Valley Plaza: Erwin von Dutch, the squatter in the Golden Wok,
// barters and never takes cash (rule 25), and gives the rose quest (rule
// 26): the rose laid at the heart of the maze earns the key that opens
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
  const at = await page.evaluate(() => {
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
    return { x: at.x, z: at.z }
  })
  await faceSpot(page, at.x, at.z, 0.8)
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
  // Smokes put down one at a time, then evened up for the rest.
  await dialog.locator('[data-good="lsd"]').click()
  const more = dialog.locator('[data-kind="marlboro"] [data-bv="trade-more"]')
  await more.click()
  await more.click()
  await expect(
    dialog.locator('[data-kind="marlboro"] [data-bv="trade-count"]')
  ).toHaveText('2')
  await expect(dialog.locator('[data-bv="trade-go"]')).toBeDisabled()
  await dialog.locator('[data-bv="trade-even"]').click()
  await dialog.locator('[data-bv="trade-go"]').click()
  await expect.poll(() => held(page, 'lsd')).toBe(1)
  expect(await held(page, 'marlboro')).toBeLessThan(smokes)
  expect(await cash(page)).toBe(before)

  // He gives the rose, on his quest's tab.
  await dialog.locator('[data-bv="trade-tab-quest"]').click()
  await expect(dialog).toContainText(copy('quests.rose_offer'))
  await dialog.locator('[data-bv="trade-quest-go"]').click()
  await expect.poll(() => held(page, 'rose')).toBe(1)
  await page.keyboard.press('KeyE')
  await expect(dialog).toBeHidden()

  // Laid at the heart of the maze, the Caretaker parked at the maze's far
  // corner, out of sight of it: a strike there would leave the rose on the
  // raider's body.
  const heart = await page.evaluate(() => {
    const bv = window.__bv
    const portal = bv?.world.portal
    const corner = bv?.world.mazePlace
    if (!bv || !portal || !corner) throw new Error('no maze')
    bv.placeCaretaker(corner.x, corner.z)
    bv.player.relocate(portal.rose.position.x, portal.rose.position.z, 0)
    return { x: portal.at.x, z: portal.at.z }
  })
  await faceSpot(page, heart.x, heart.z, 1.2)
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
  await dialog.locator('[data-bv="trade-tab-quest"]').click()
  await expect(dialog).toContainText(copy('quests.rose_laid'))
  await dialog.locator('[data-bv="trade-quest-go"]').click()
  await expect.poll(() => held(page, 'vault-key')).toBe(1)
  await page.keyboard.press('KeyE')
  expect(await doorStops(page)).toBe(false)

  // The $20 in the safe, taken up, goes into the wallet.
  const paid = await cash(page)
  const twenty = await page.evaluate(() => {
    const bv = window.__bv
    const twenty = bv?.world.pickups.find((p) => p.kind === 'twenty')
    if (!bv || !twenty) throw new Error('no twenty')
    bv.player.relocate(twenty.x + 0.6, twenty.z, 0)
    return { x: twenty.x, z: twenty.z }
  })
  await faceSpot(page, twenty.x, twenty.z)
  // The valley pays only a raider it has heard standing by it.
  await heardWhere(page)
  await expect(page.locator('.bv-item-label')).toContainText(
    copy('labels.twenty')
  )
  await page.keyboard.press('KeyE')
  await expect.poll(() => cash(page)).toBe(paid + 2000)
})
