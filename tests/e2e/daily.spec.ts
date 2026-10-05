import {
  beginRaid,
  expect,
  freshRaider,
  freshValley,
  test,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// The berry bush on the spawn lot gives each account one berry a day. The
// valley keeps the record, so a second arrival on the same account finds
// the bush picked clean. Both tests join one valley as one raider, in
// order, each on a fresh page: booting the game takes most of a minute on
// CI, so a test boots once. A fresh browser context starts with no saved
// inventory, so a saved one with a berry in it proves the pick landed.

test.describe.configure({ mode: 'serial' })

const valley = freshValley('daily')
const raider = freshRaider('Daily')

const savedInventory = (page: Page) =>
  page.evaluate(() =>
    localStorage.getItem('bull-valley-shadow-wars:v1:inventory')
  )

// Whether the glow rings the bush, and whether its berries show.
const bushGlows = (page: Page) =>
  page.evaluate(() => {
    const bv = window.__bv
    return !!bv && bv.glow !== null && bv.glow === bv.world.bushObject
  })
const berriesShown = (page: Page) =>
  page.evaluate(
    () => window.__bv?.world.bushObject?.getObjectByName('berries')?.visible
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
  await beginRaid(page, 0, { valley, raider })
  const prompt = page.locator('.bv-prompt')
  expect(await savedInventory(page)).toBeNull()
  expect(await page.evaluate(() => window.__bv?.daily)).toMatchObject({
    collected: false,
  })

  await standAtBush(page)
  await expect(prompt).toHaveText('E — Pick a Berry')
  await expect.poll(() => bushGlows(page)).toBe(true)
  expect(await berriesShown(page)).toBe(true)
  await page.keyboard.press('KeyE')
  await expect.poll(() => savedInventory(page)).toContain('"berries":1')
  await expect(prompt).toHaveText('Berry Bush — Picked Clean Until Midnight')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.daily?.collected))
    .toBe(true)
  // Picked clean: no berries, and nothing left to glow for.
  await expect.poll(() => berriesShown(page)).toBe(false)
  expect(await bushGlows(page)).toBe(false)

  // A second press changes nothing.
  await page.keyboard.press('KeyE')
  await expect(prompt).toHaveText('Berry Bush — Picked Clean Until Midnight')
  expect(await savedInventory(page)).toContain('"berries":1')
})

test('the valley remembers the account on the next arrival', async ({
  page,
}) => {
  await beginRaid(page, 0, { valley, raider })
  expect(await page.evaluate(() => window.__bv?.daily)).toMatchObject({
    collected: true,
  })
  await standAtBush(page)
  await expect(page.locator('.bv-prompt')).toHaveText(
    'Berry Bush — Picked Clean Until Midnight'
  )
  expect(await berriesShown(page)).toBe(false)
})
