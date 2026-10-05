import { copy } from './copy.ts'
import { beginRaid, expect, freshRaider, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Gron stands under his raincloud beside the berry bush. Talking to him
// changes the name the valley knows you by and the body you raid in, and
// the game stands aside while he talks.

async function standAtGron(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    const { gron, bush } = bv.world
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
  })
}

const playerAt = (page: Page) =>
  page.evaluate(() => {
    const { x, z } = window.__bv!.player.pos
    return { x, z }
  })

test('Gron changes your name and your character', async ({ page }) => {
  await beginRaid(page)
  await standAtGron(page)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.talk'))
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
  await page.waitForTimeout(300)
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

  // A new character: one step on from the Player is David Coleman.
  await dialog.getByRole('button', { name: copy('select.next') }).click()
  await expect(dialog.locator('[data-bv="gron-character-name"]')).toHaveText(
    copy('outfits.coleman')
  )
  await dialog.getByRole('button', { name: copy('gron.become') }).click()
  await expect
    .poll(() =>
      page.evaluate(
        (): unknown =>
          window.__bv?.scene.getObjectByName('player-body')?.userData.outfit
      )
    )
    .toBe('coleman')
  // The account keeps it, so it follows the raider to any browser.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const res = await fetch('/auth/me')
        const me = (await res.json()) as {
          account: { look: { outfit: string | null } } | null
        }
        return me.account?.look.outfit
      })
    )
    .toBe('coleman')

  // Escape sends him away, and the valley knows the new name: a chat line
  // comes back from it under the name the valley read from the account.
  await page.keyboard.press('Escape')
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
