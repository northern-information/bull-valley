import { copy } from './copy.ts'
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
// CI, so a test boots once. The pack is the account's too: a fresh raider
// has no berries, and the second arrival's welcome carries the one picked.

test.describe.configure({ mode: 'serial' })

const valley = freshValley('daily')
const raider = freshRaider('Daily')

const berries = (page: Page) =>
  page.evaluate(() => window.__bv?.inventory.berries)

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
  // The bush's own label says how it stands.
  const label = page.locator('.bv-item-label')
  expect(await page.evaluate(() => window.__bv?.daily)).toMatchObject({
    collected: false,
  })
  expect(await berries(page)).toBe(0)

  await standAtBush(page)
  await expect(label).toHaveText(copy('labels.berries'))
  await expect.poll(() => bushGlows(page)).toBe(true)
  expect(await berriesShown(page)).toBe(true)
  await page.keyboard.press('KeyE')
  await expect.poll(() => berries(page)).toBe(1)
  await expect(label).toHaveText(copy('labels.berry_picked'))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.daily?.collected))
    .toBe(true)
  // Picked clean: no berries, and nothing left to glow for.
  await expect.poll(() => berriesShown(page)).toBe(false)
  expect(await bushGlows(page)).toBe(false)

  // A second press changes nothing.
  await page.keyboard.press('KeyE')
  await expect(label).toHaveText(copy('labels.berry_picked'))
  expect(await berries(page)).toBe(1)
})

test('the valley remembers the account on the next arrival', async ({
  page,
}) => {
  await beginRaid(page, 0, { valley, raider })
  expect(await page.evaluate(() => window.__bv?.daily)).toMatchObject({
    collected: true,
  })
  // A new page, and the berry is still in the pack.
  expect(await berries(page)).toBe(1)
  await standAtBush(page)
  await expect(page.locator('.bv-item-label')).toHaveText(
    copy('labels.berry_picked')
  )
  expect(await berriesShown(page)).toBe(false)
})
