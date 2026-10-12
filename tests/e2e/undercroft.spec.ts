import { copy } from './copy.ts'
import { beginRaid, expect, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// The Undercroft: down the trapdoor in the Video Vault's office to the old
// stone under Bull Valley Plaza, where the tunnel shades walk (rule 11)
// and the altar keeps a bar of gold a day (rule 4); and back up.

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
  await page.evaluate(() => {
    const bv = window.__bv
    const croft = bv?.world.undercroft
    if (!bv || !croft) throw new Error('no Undercroft')
    bv.player.relocate(croft.hatch.x + 0.5, croft.hatch.z, 0)
  })
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.descend'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => below(page)).toBe(true)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.descend'))
  await heardWhere(page)

  // The tunnel shades walk down here, in every frame the valley sends.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.tunnel.length ?? 0))
    .toBeGreaterThan(0)

  // The gold on the altar, first to take it.
  await page.evaluate(() => {
    const bv = window.__bv
    const gold = bv?.world.pickups.find(
      (p) => p.kind === 'gold-bullion' && bv.world.undercroft?.inside(p.x, p.z)
    )
    if (!bv || !gold) throw new Error('no gold')
    bv.player.relocate(gold.x + 0.4, gold.z, 0)
  })
  await expect(page.locator('.bv-item-label')).toContainText(
    copy('items.gold-bullion.label')
  )
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['gold-bullion']))
    .toBe(1)

  // And back up the ladder.
  await page.evaluate(() => {
    const bv = window.__bv
    const croft = bv?.world.undercroft
    if (!bv || !croft) throw new Error('no Undercroft')
    bv.player.relocate(croft.foot.x + 0.5, croft.foot.z, 0)
  })
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.ascend'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => below(page)).toBe(false)
})
