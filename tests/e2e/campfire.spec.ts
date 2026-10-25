import { copy } from './copy.ts'
import { beginRaid, expect, faceSpot, heardWhere, test } from './fixtures.ts'

// Rule 39: E at the campfire by the firefly pond opens it; the fish in the
// pack cook into what they cook into, and what cooked is eaten like
// anything else in the pack.

test('the campfire cooks the catch, and the cooked fish is eaten', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  await page.evaluate(() => window.__bv?.grant('bluegill', 2))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.bluegill))
    .toBe(2)

  // A step from the fire, toward the landing, looking at it.
  const fire = await page.evaluate(() => {
    const bv = window.__bv
    const fire = bv?.campfires[0]
    const pond = bv?.ponds[0]
    if (!bv || !fire || !pond) throw new Error('no campfire')
    const { landing } = pond
    const d = Math.hypot(landing.x - fire.x, landing.z - fire.z)
    const x = fire.x + ((landing.x - fire.x) / d) * 1.8
    const z = fire.z + ((landing.z - fire.z) / d) * 1.8
    bv.player.relocate(x, z, 0)
    return fire
  })
  await faceSpot(page, fire.x, fire.z, 0.3)
  await heardWhere(page)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.cook'))
  await page.keyboard.press('KeyE')
  const dialog = page.locator('.bv-cook')
  await expect(dialog).toBeVisible()
  await dialog.locator('[data-fish="bluegill"] [data-bv="cook-all"]').click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['fried-panfish']))
    .toBe(2)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.bluegill ?? 0))
    .toBe(0)
  await expect(page.locator('.bv-chat')).toContainText(
    copy('log.cooked', {
      count: 2,
      fish: copy('items.bluegill.label'),
      food: copy('items.fried-panfish.label'),
    })
  )
  // Nothing raw left: the dialog says so.
  await expect(dialog.locator('[data-bv="cook-none"]')).toBeVisible()
  await page.keyboard.press('KeyE')
  await expect(dialog).toBeHidden()

  // Eaten from the pack, like anything else.
  await page.evaluate(() => window.__bv?.use('fried-panfish'))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['fried-panfish']))
    .toBe(1)
  await expect(page.locator('.bv-chat')).toContainText(
    copy('items.fried-panfish.used')
  )
})
