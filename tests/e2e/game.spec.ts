import { beginRaid, expect, test, toCharacterSelect } from './fixtures.ts'

test('a raid starts in loadout and the truck leaves on time', async ({
  page,
}) => {
  await beginRaid(page)
  const state = () => page.evaluate(() => window.__bv?.raid.state)
  expect(await state()).toBe('LOADOUT')
  await page.evaluate(() => window.__bv?.hurryTruck(0))
  await expect.poll(state).not.toBe('LOADOUT')
})

test('shadowmen cross the valley and show on the scope', async ({ page }) => {
  await beginRaid(page)
  const slots = await page.evaluate(
    () => window.__bv?.shadowmen.field.slots.length
  )
  expect(slots).toBe(12)
  await page.keyboard.press('q')
  await expect(page.locator('.bv-phone')).toHaveClass(/bv-phone--raised/)
  // The bubble is populated from the first frame, so blips are already in.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.shadowmen.contacts.length))
    .toBeGreaterThan(0)
})

test("a shadowman's touch puts you back at the Citgo", async ({ page }) => {
  await beginRaid(page)
  await page.evaluate(() => window.__bv?.hurryTruck(0))
  const state = () => page.evaluate(() => window.__bv?.raid.state)
  await expect.poll(state).toBe('ON_FOOT')
  // Out of the forecourt haven, then a rushing shadowman on top of you.
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return
    bv.teleport(0.5, 0.5)
    bv.shadowmen.field.slots[0] = {
      x: bv.player.pos.x,
      z: bv.player.pos.z,
      dirX: 0,
      dirZ: 1,
      speed: 0,
      rushing: true,
    }
  })
  await expect.poll(() => page.evaluate(() => window.__bv?.raid.deaths)).toBe(1)
  await expect(page.locator('.bv-static')).toBeVisible()
  await expect(page.locator('.bv-static')).toBeHidden()
  const fromSpawn = await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return null
    const { pos } = bv.player
    return Math.hypot(pos.x - bv.world.spawn.x, pos.z - bv.world.spawn.z)
  })
  expect(fromSpawn).toBeLessThan(1)
  expect(await state()).toBe('ON_FOOT')
})

test('the chosen character is the body you raid in, and is remembered', async ({
  page,
}) => {
  // Two steps right of the player: Kvistad.
  await beginRaid(page, 2)
  const outfit = () =>
    page.evaluate((): unknown => {
      const body = window.__bv?.scene.getObjectByName('player-body')
      return body?.userData.outfit
    })
  expect(await outfit()).toBe('kvistad')

  await page.reload()
  await toCharacterSelect(page)
  await expect(page.locator('.bv-select-name')).toHaveText('David Kvistad')
  // ← wraps from the first character to the last.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.bv-select-name')).toHaveText('Justin Hanson')
})
