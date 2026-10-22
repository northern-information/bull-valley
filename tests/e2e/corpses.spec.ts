import { spilledDimes } from '../../src/corpses.ts'
import { DIME_CENTS } from '../../src/drops.ts'
import { formatCash } from '../../src/store.ts'
import { copy } from './copy.ts'
import { beginRaid, expect, heardWhere, onLastPoint, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Rule 18: a strike leaves everything the pack held but its key items on
// the raider's body, where they fell, and E over it takes it all back.
// Rule 19: the locker in the back room of every Citgo keeps what is stowed
// there, through a strike, and never takes a key item.

const held = (page: Page) =>
  page.evaluate(() => ({ ...(window.__bv?.inventory ?? {}) }))
// Everything but the key items, which a strike leaves in the pack.
const carrying = async (page: Page) =>
  Object.entries(await held(page))
    .filter(([kind]) => kind !== 'vault-key')
    .reduce((sum, [, n]) => sum + n, 0)

// Out of the forecourt haven on the last point of health, then a
// shadowman beside you: the valley has it rush you, and says it touched
// you.
async function struckDown(page: Page, strikes: number): Promise<void> {
  await page.evaluate(() => window.__bv?.teleport(0.5, 0.5))
  await heardWhere(page)
  await onLastPoint(page)
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
  await page.evaluate(() => window.__bv?.grant('vault-key', 1))
  await expect.poll(async () => (await held(page)).marlboro).toBeGreaterThan(19)
  await expect.poll(async () => (await held(page))['vault-key']).toBe(1)
  const before = await held(page)
  const cash = (await page.evaluate(() => window.__bv?.cash)) ?? 0
  const spilled = spilledDimes(cash) * DIME_CENTS
  // The static is up for strikeSeconds of wall clock. On a runner at a frame
  // a second that can come and go between two polls, so the page records
  // when it shows and when it clears instead of the spec trying to catch it.
  await page.evaluate(() => {
    const el = document.querySelector('.bv-static')
    if (!el) throw new Error('no static overlay')
    const marks: { shownAt?: number; hiddenAt?: number } = {}
    Object.assign(window, { staticMarks: marks })
    new MutationObserver(() => {
      const hidden = el.hasAttribute('hidden')
      if (!hidden) marks.shownAt ??= performance.now()
      else if (marks.shownAt !== undefined) marks.hiddenAt ??= performance.now()
    }).observe(el, { attributes: true, attributeFilter: ['hidden'] })
  })
  const marks = () =>
    page.evaluate(
      () =>
        (window as { staticMarks?: { shownAt?: number; hiddenAt?: number } })
          .staticMarks
    )

  await struckDown(page, 1)
  // The static showed, then cleared.
  await expect.poll(async () => (await marks())?.hiddenAt).toBeDefined()
  await expect(page.locator('.bv-static')).toBeHidden()
  // It lasted strikeSeconds (1.6 s) of wall clock, give or take a frame. On
  // frame-capped game time it would stretch to half a minute on a slow
  // runner, so this bound catches that coming back.
  const { shownAt = 0, hiddenAt = 0 } = (await marks()) ?? {}
  expect(hiddenAt - shownAt).toBeLessThan(10_000)
  // Back at the Citgo, on foot.
  const fromSpawn = await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return null
    const { pos } = bv.player
    return Math.hypot(pos.x - bv.world.spawn.x, pos.z - bv.world.spawn.z)
  })
  expect(fromSpawn).toBeLessThan(1)
  expect(await page.evaluate(() => window.__bv?.aboard)).toBe(false)
  // Everything stays where they fell but the key, which comes along with
  // the wallet.
  await expect.poll(() => carrying(page)).toBe(0)
  await expect.poll(async () => (await held(page))['vault-key']).toBe(1)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.myCorpses.length))
    .toBe(1)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.fell'))
  // The strike spilled its share of the wallet where they fell.
  await expect(page.locator('.bv-chat')).toContainText(
    copy('log.spilled', { amount: formatCash(spilled) })
  )
  await expect
    .poll(() => page.evaluate(() => window.__bv?.cash))
    .toBe(cash - spilled)
  const [body] = await page.evaluate(() => window.__bv?.corpses ?? [])
  expect(body).toBeDefined()

  // The run back: E over the body takes it all back.
  await page.evaluate(([x, z]) => window.__bv?.player.relocate(x, z + 1, 0), [
    body.x,
    body.z,
  ] as const)
  // The valley gives a body back only to a raider it has heard beside it.
  await heardWhere(page)
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
  await page.evaluate(() => window.__bv?.grant('vault-key', 1))
  await expect.poll(async () => (await held(page)).joints).toBeGreaterThan(2)
  await expect.poll(async () => (await held(page))['vault-key']).toBe(1)
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

  // A key item stays on you: F over it says so, and the locker never has
  // it.
  await page.locator('#bv-bag-tab-key-items').click()
  await page.locator('.bv-bag-cell[data-kind="vault-key"]').hover()
  await page.keyboard.press('KeyF')
  await expect(page.locator('.bv-chat')).toContainText(
    copy('log.stow_key_item')
  )
  expect(await page.evaluate(() => window.__bv?.stash['vault-key'] ?? 0)).toBe(
    0
  )

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
