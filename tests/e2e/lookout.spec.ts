import { copy } from './copy.ts'
import { beginRaid, expect, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// The lookout tower by the corn maze's gate: E at the ladder's foot puts a
// raider up on the deck, out of every shadow's reach, and E at its top puts
// them back down at the foot.

const onDeck = (page: Page) =>
  page.evaluate(() => {
    const bv = window.__bv
    const tower = bv?.world.lookout
    return tower ? tower.on(bv.player.pos.x, bv.player.pos.z) : null
  })

test('climbs the lookout and back down', async ({ page }) => {
  await beginRaid(page)
  const prompt = page.locator('.bv-prompt')
  await page.evaluate(() => {
    const bv = window.__bv
    const foot = bv?.world.lookout?.foot
    if (bv && foot) bv.player.relocate(foot.x, foot.z, foot.yaw)
  })
  await expect(prompt).toHaveText(copy('prompts.climb_tower'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => onDeck(page)).toBe(true)

  await expect(prompt).toHaveText(copy('prompts.leave_tower'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => onDeck(page)).toBe(false)
  await expect(prompt).toHaveText(copy('prompts.climb_tower'))
})
