import { copy } from './copy.ts'
import { beginRaid, expect, faceSpot, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Gron stands under his raincloud beside the berry bush. Come near and he
// glows, with no prompt; E has him say his next line into the log, as
// Marx and the others do. Your name is changed in Settings (name.spec.ts),
// your character at Moab (moab.spec.ts).

async function standAtGron(page: Page): Promise<void> {
  const gron = await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    const { gron } = bv.world
    const [bush] = bv.world.bushes
    if (!gron || !bush) throw new Error('no Gron')
    // On the far side of him from the bush, so he is the nearer.
    const dx = gron.x - bush.x
    const dz = gron.z - bush.z
    const d = Math.hypot(dx, dz)
    bv.player.relocate(
      gron.x + (dx / d) * 1.2,
      gron.z + (dz / d) * 1.2,
      bv.player.yaw
    )
    return { x: gron.x, z: gron.z }
  })
  await faceSpot(page, gron.x, gron.z, 1.2)
}

const said = (page: Page) =>
  page.evaluate(() => window.__bv?.chat.map((line) => line.text) ?? [])

test('Gron says his lines in turn', async ({ page }) => {
  await beginRaid(page)
  await standAtGron(page)
  // He glows, and that is the only sign: no prompt.
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__bv!.glow === window.__bv!.world.gronRig?.figure.group
      )
    )
    .toBe(true)
  await expect(page.locator('.bv-prompt')).toBeHidden()
  await page.keyboard.press('KeyE')
  await expect.poll(() => said(page)).toContain(copy('gron.says_1'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => said(page)).toContain(copy('gron.says_2'))
  // No dialog opens: the pointer stays the game's.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => window.__bv?.player.locked)).toBe(true)
})
