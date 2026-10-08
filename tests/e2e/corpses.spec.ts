import { copy } from './copy.ts'
import { beginRaid, expect, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Rule 18: a strike leaves everything the pack held on the raider's body,
// where they fell, and E over it takes it all back. Rule 19: the locker in
// the back room of every Citgo keeps what is stowed there, through a
// strike.

const held = (page: Page) =>
  page.evaluate(() => ({ ...(window.__bv?.inventory ?? {}) }))
const carrying = async (page: Page) =>
  Object.values(await held(page)).reduce((sum, n) => sum + n, 0)

// Out of the forecourt haven, then a shadowman beside you: the valley has
// it rush you, and says it touched you.
async function struckDown(page: Page, strikes: number): Promise<void> {
  await page.evaluate(() => window.__bv?.teleport(0.5, 0.5))
  await heardWhere(page)
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return
    bv.placeShadowman(bv.player.pos.x, bv.player.pos.z + 3)
  })
  await expect
    .poll(() => page.evaluate(() => window.__bv?.strikes))
    .toBe(strikes)
}

test('a strike leaves the pack on your body, and E takes it back', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  await page.evaluate(() => window.__bv?.grant('marlboro', 20))
  await expect.poll(async () => (await held(page)).marlboro).toBeGreaterThan(19)
  const before = await held(page)

  await struckDown(page, 1)
  // Everything stays where they fell; the wallet comes along.
  await expect.poll(() => carrying(page)).toBe(0)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.myCorpses.length))
    .toBe(1)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.fell'))
  const [body] = await page.evaluate(() => window.__bv?.corpses ?? [])
  expect(body).toBeDefined()

  // The run back: E over the body takes it all back.
  await page.evaluate(([x, z]) => window.__bv?.player.relocate(x, z + 1, 0), [
    body.x,
    body.z,
  ] as const)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.loot'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => held(page)).toEqual(before)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.corpses.length))
    .toBe(0)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.looted'))
})

test('the locker in the back room keeps what you stow, through a strike', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  await page.evaluate(() => window.__bv?.grant('joints', 3))
  await expect.poll(async () => (await held(page)).joints).toBeGreaterThan(2)
  const joints = (await held(page)).joints

  // Into the back room of the spawn Citgo, in front of the lockers.
  await page.evaluate(() => {
    const bv = window.__bv
    const station = bv?.world.spawnStation
    if (!bv || !station) throw new Error('no spawn station')
    const spot = bv.world.lockers[bv.world.fuelPoints.indexOf(station)]
    bv.player.relocate(spot.x, spot.z, 0)
  })
  await heardWhere(page)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.locker'))
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.lockerOpen))
    .toBe(true)
  const lockerTab = page.locator('#bv-bag-tab-locker')
  await expect(lockerTab).toBeVisible()

  // F stows one off the pack; on the Locker tab, Shift+F takes them all
  // back out.
  const cell = page.locator('.bv-bag-cell[data-kind="joints"]')
  await cell.hover()
  await page.keyboard.press('KeyF')
  await page.keyboard.press('KeyF')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.stash.joints))
    .toBe(2)
  await expect.poll(async () => (await held(page)).joints).toBe(joints - 2)
  await lockerTab.click()
  await cell.hover()
  await expect(page.locator('.bv-bag-card')).toContainText(copy('keys.unstow'))
  await page.keyboard.press('Shift+KeyF')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.stash.joints))
    .toBe(0)
  await expect.poll(async () => (await held(page)).joints).toBe(joints)

  // Stowed for good, then struck: the locker keeps them.
  await page.locator('#bv-bag-tab-consumables').click()
  await cell.hover()
  await page.keyboard.press('Shift+KeyF')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.stash.joints))
    .toBe(joints)
  await page.keyboard.press('Tab')
  await expect(lockerTab).toBeHidden()
  await struckDown(page, 1)
  await expect.poll(() => carrying(page)).toBe(0)
  expect(await page.evaluate(() => window.__bv?.stash.joints)).toBe(joints)
})
