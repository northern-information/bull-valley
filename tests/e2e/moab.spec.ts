import { copy } from './copy.ts'
import { beginRaid, expect, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Moab Coldë stands by his burning horse under every Citgo sign. Come near
// and he glows, with no prompt; E and he says his one line, in the chat log
// under his own name.

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
  // The spawn station's Moab glows, and nothing else says so.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bv = window.__bv
        const station = bv?.world.spawnStation
        if (!bv || !station) return false
        const rig = bv.world.moabRigs[bv.world.fuelPoints.indexOf(station)]
        return bv.glow === rig?.figure.group
      })
    )
    .toBe(true)
  await expect(page.locator('.bv-prompt')).toBeHidden()
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.chat.at(-1)))
    .toEqual({
      kind: 'npc',
      name: copy('outfits.moab'),
      text: copy('moab.says'),
      at: expect.any(Number),
    })
  await expect(
    page.getByRole('log', { name: copy('hud.chat_log_label') })
  ).toContainText(`${copy('outfits.moab')}: ${copy('moab.says')}`)
  // He opens nothing: the game keeps the pointer.
  expect(await page.evaluate(() => window.__bv?.player.locked)).toBe(true)
})
