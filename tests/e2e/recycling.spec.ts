import { copy } from './copy.ts'
import { beginRaid, expect, faceSpot, heardWhere, test } from './fixtures.ts'

// Rules 32 and 33: a drink drunk leaves its empty in the pack, and E at
// the recycling machine opens the Recycling Center, where empties buy research.

test('a drink leaves its can, and the recycling machine turns empties into loose change', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  await page.evaluate(() => window.__bv?.grant('pbr', 1))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.pbr))
    .toBe(1)
  await page.evaluate(() => window.__bv?.use('pbr'))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['empty-can']))
    .toBe(1)

  // The first level costs six cans: the one drunk and five more.
  await page.evaluate(() => window.__bv?.grant('empty-can', 5))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['empty-can']))
    .toBe(6)

  // In front of the machine, toward the pumps, looking at it.
  const at = await page.evaluate(() => {
    const bv = window.__bv
    const station = bv?.world.spawnStation
    // The spawn Citgo's machine: the one nearest its pump island.
    const at = station
      ? bv?.recyclers
          .slice()
          .sort(
            (a, b) =>
              Math.hypot(a.x - station.x, a.z - station.z) -
              Math.hypot(b.x - station.x, b.z - station.z)
          )[0]
      : undefined
    if (!bv || !at || !station) throw new Error('no recycling machine')
    const d = Math.hypot(station.x - at.x, station.z - at.z)
    const x = at.x + ((station.x - at.x) / d) * 1.8
    const z = at.z + ((station.z - at.z) / d) * 1.8
    bv.player.relocate(x, z, 0)
    return { x: at.x, z: at.z }
  })
  await faceSpot(page, at.x, at.z, 1)
  await heardWhere(page)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.recycle'))
  await page.keyboard.press('KeyE')
  const dialog = page.locator('.bv-recycle')
  await expect(dialog).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.research?.dimes))
    .toBe(0)

  await dialog.locator('[data-line="dimes"] [data-bv="recycle-buy"]').click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.research?.dimes))
    .toBe(1)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['empty-can']))
    .toBe(0)
  await expect(page.locator('.bv-chat')).toContainText(
    copy('log.researched', { line: copy('recycling.line_dimes'), level: 1 })
  )
  // Level 2 asks for packs too, and the pack has none.
  await expect(
    dialog.locator('[data-line="dimes"] [data-bv="recycle-buy"]')
  ).toBeDisabled()
  await page.keyboard.press('KeyE')
  await expect(dialog).toBeHidden()
})
