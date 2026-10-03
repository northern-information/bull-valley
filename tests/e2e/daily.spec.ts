import { beginRaid, expect, freshValley, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// The berry bush on the spawn lot gives each name one berry a day. The
// valley keeps the record, so a second arrival under the same name finds
// the bush picked clean. Both tests join one valley, in order, each on a
// fresh page: booting the game takes most of a minute on CI, so a test
// boots once. A fresh browser context starts with no saved inventory, so
// a saved one with a berry in it proves the pick landed.

test.describe.configure({ mode: 'serial' })

const valley = freshValley('daily')

const savedInventory = (page: Page) =>
  page.evaluate(() =>
    localStorage.getItem('bull-valley-shadow-wars:v1:inventory')
  )

async function standAtBush(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    const { bush } = bv.world
    if (!bush) throw new Error('no berry bush')
    bv.player.relocate(bush.x + 1, bush.z + 1, bv.player.yaw)
  })
}

test('the berry bush gives one berry, then is picked clean', async ({
  page,
}) => {
  await beginRaid(page, 0, { valley })
  const prompt = page.locator('.bv-prompt')
  expect(await savedInventory(page)).toBeNull()
  expect(await page.evaluate(() => window.__bv?.daily)).toMatchObject({
    collected: false,
  })

  await standAtBush(page)
  await expect(prompt).toHaveText('E — Pick a Berry')
  await page.keyboard.press('KeyE')
  await expect.poll(() => savedInventory(page)).toContain('"berries":1')
  await expect(prompt).toHaveText('Berry Bush — Picked Clean Until Midnight')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.daily?.collected))
    .toBe(true)

  // A second press changes nothing.
  await page.keyboard.press('KeyE')
  await expect(prompt).toHaveText('Berry Bush — Picked Clean Until Midnight')
  expect(await savedInventory(page)).toContain('"berries":1')
})

test('the valley remembers the name on the next arrival', async ({ page }) => {
  await beginRaid(page, 0, { valley })
  expect(await page.evaluate(() => window.__bv?.daily)).toMatchObject({
    collected: true,
  })
  await standAtBush(page)
  await expect(page.locator('.bv-prompt')).toHaveText(
    'Berry Bush — Picked Clean Until Midnight'
  )
})
