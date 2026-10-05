import { copy } from './copy.ts'
import { beginRaid, expect, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Moab Coldë stands by his burning horse under every Citgo sign. E beside
// him and he says his one line, in the chat log under his own name.

async function standAtMoab(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    const { world } = bv
    const station = world.spawnStation
    if (!station) throw new Error('no spawn station')
    const moab = world.moabs[world.fuelPoints.indexOf(station)]
    // A stride toward the pump island, in front of him.
    const dx = station.x - moab.x
    const dz = station.z - moab.z
    const d = Math.hypot(dx, dz)
    bv.player.relocate(
      moab.x + (dx / d) * 1.8,
      moab.z + (dz / d) * 1.8,
      bv.player.yaw
    )
  })
}

test('Moab Coldë says his line', async ({ page }) => {
  await beginRaid(page)
  await standAtMoab(page)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.moab'))
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.chat.at(-1)))
    .toEqual({
      kind: 'say',
      name: copy('outfits.moab'),
      text: copy('moab.says'),
    })
  await expect(
    page.getByRole('log', { name: copy('hud.chat_log_label') })
  ).toContainText(`${copy('outfits.moab')}: ${copy('moab.says')}`)
  // He opens nothing: the game keeps the pointer.
  expect(await page.evaluate(() => window.__bv?.player.locked)).toBe(true)
})
