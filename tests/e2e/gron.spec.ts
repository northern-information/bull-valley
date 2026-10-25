import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  faceSpot,
  frames,
  freshRaider,
  test,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// Gron stands under his raincloud beside the berry bush. Talking to him
// changes the name the valley knows you by, and the game stands aside
// while he talks. Your character is Moab's (moab.spec.ts).

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

const playerAt = (page: Page) =>
  page.evaluate(() => {
    const { x, z } = window.__bv!.player.pos
    return { x, z }
  })

test('Gron changes your name', async ({ page }) => {
  // One long flow (sign in, rename, chat) through a full valley.
  test.slow()
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
  const dialog = page.getByRole('dialog', {
    name: copy('outfits.gron'),
    exact: true,
  })
  await expect(dialog).toBeVisible()

  // The game's keys stand aside: typing W in his field does not walk.
  const before = await playerAt(page)
  const field = dialog.locator('[data-bv="gron-username"]')
  const name = freshRaider('Gron_Made').username
  await field.fill('')
  await field.pressSequentially('wwww')
  await frames(page)
  expect(await playerAt(page)).toEqual(before)

  // A new name, checked as you type, then saved.
  await field.fill(name)
  await expect(dialog.locator('[data-bv="gron-name-status"]')).toHaveText(
    copy('username.available')
  )
  await dialog.getByRole('button', { name: copy('gron.change_name') }).click()
  await expect(dialog.locator('[data-bv="gron-name-status"]')).toHaveText(
    copy('gron.renamed', { name })
  )

  // E sends him away, and the valley knows the new name: a chat line
  // comes back from it under the name the valley read from the account.
  await page.keyboard.press('KeyE')
  await expect(dialog).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)
  await page.keyboard.press('Enter')
  await page.keyboard.type('gron says hello')
  await page.keyboard.press('Enter')
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__bv?.chat.find((line) => line.text === 'gron says hello')
      )
    )
    .toMatchObject({ name })
})
