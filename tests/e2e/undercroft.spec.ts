import { copy } from './copy.ts'
import { beginRaid, expect, faceSpot, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// The Undercroft: down the trapdoor in the Video Vault's office to the old
// stone under Bull Valley Plaza, where the Undercroft's foes walk (rule 11)
// and the altar keeps a bar of gold a day (rule 4), and no fast travel
// leaves; and back up.

// The prompt as shown: a hidden one keeps the last text it showed (the
// ladder's own, from the climb down), so a check on its text alone can
// pass before a frame has put the raider back at the foot.
const prompt = (page: Page) => page.locator('.bv-prompt:not([hidden])')

const below = (page: Page) =>
  page.evaluate(() => {
    const bv = window.__bv
    const croft = bv?.world.undercroft
    if (!bv || !croft) throw new Error('no Undercroft')
    return croft.inside(bv.player.pos.x, bv.player.pos.z)
  })

test('the trapdoor goes down to the Undercroft, its gold, and back up', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  // The key opens the office, where the trapdoor is.
  await page.evaluate(() => window.__bv?.grant('vault-key', 1))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['vault-key']))
    .toBe(1)
  const hatch = await page.evaluate(() => {
    const bv = window.__bv
    const croft = bv?.world.undercroft
    if (!bv || !croft) throw new Error('no Undercroft')
    bv.player.relocate(croft.hatch.x + 0.5, croft.hatch.z, 0)
    return { x: croft.hatch.x, z: croft.hatch.z }
  })
  await faceSpot(page, hatch.x, hatch.z, 0)
  await expect(prompt(page)).toHaveText(copy('prompts.descend'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => below(page)).toBe(true)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.descend'))
  await heardWhere(page)

  // The Undercroft's foes walk down here, in every frame the valley sends.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.tunnel.length ?? 0))
    .toBeGreaterThan(0)

  // The gold on the altar, first to take it.
  const gold = await page.evaluate(() => {
    const bv = window.__bv
    const gold = bv?.world.pickups.find(
      (p) => p.kind === 'gold-bullion' && bv.world.undercroft?.inside(p.x, p.z)
    )
    if (!bv || !gold) throw new Error('no gold')
    bv.player.relocate(gold.x + 0.4, gold.z, 0)
    return { x: gold.x, z: gold.z }
  })
  await faceSpot(page, gold.x, gold.z)
  // The valley hands it over only to a raider it has heard standing by it.
  await heardWhere(page)
  await expect(page.locator('.bv-item-label')).toContainText(
    copy('items.gold-bullion.label')
  )
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['gold-bullion']))
    .toBe(1)

  // No fast travel leaves it, portal phone or not.
  await page.evaluate(() => window.__bv?.grant('citgo-phone', 1))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['citgo-phone']))
    .toBe(1)
  const home = await page.evaluate(() => window.__bv?.citgos.last ?? 0)
  await page.evaluate((i) => window.__bv?.fastTravel(i), home)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.travel_below'))
  expect(await below(page)).toBe(true)

  // Nor does the portal phone dial: the screen says NO SIGNAL, and it goes
  // down again with no portal open.
  const slot = await page.evaluate(
    () => window.__bv?.hotbar.indexOf('citgo-phone') ?? -1
  )
  expect(slot).toBeGreaterThanOrEqual(0)
  await page.evaluate((i) => window.__bv?.select(i), slot)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inHand))
    .toBe('citgo-phone')
  await page.evaluate(() => window.__bv?.useHand())
  await expect(page.locator('.bv-phone')).toHaveClass(/bv-phone--raised/)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.portal_below'))
  await expect(page.locator('.bv-phone')).not.toHaveClass(/bv-phone--raised/)
  expect(await page.evaluate(() => window.__bv?.myPortal ?? null)).toBeNull()

  // And back up the ladder.
  const foot = await page.evaluate(() => {
    const bv = window.__bv
    const croft = bv?.world.undercroft
    if (!bv || !croft) throw new Error('no Undercroft')
    bv.player.relocate(croft.foot.x + 0.5, croft.foot.z, 0)
    return { x: croft.foot.x, z: croft.foot.z }
  })
  await faceSpot(page, foot.x, foot.z, 1.5)
  await expect(prompt(page)).toHaveText(copy('prompts.ascend'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => below(page)).toBe(false)
})
