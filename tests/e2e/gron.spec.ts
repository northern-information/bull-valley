import { copy } from './copy.ts'
import { beginRaid, expect, faceSpot, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Gron stands under his raincloud beside the berry bush. Come near and he
// glows, with no prompt; E opens his dialog, where he gives his quests one
// after another (rule 26): a berry off a bush, then Erwin next door at the
// Golden Wok, who finishes the errand on his own quest tab, then the
// floppy disk from the industrial zone. Each earns quest XP.

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
  await heardWhere(page)
}

// In front of Erwin in the Golden Wok, heard there.
async function standAtErwin(page: Page): Promise<void> {
  const at = await page.evaluate(() => {
    const bv = window.__bv
    const plaza = bv?.world.plaza
    if (!bv || !plaza) throw new Error('no plaza')
    const { at, group } = plaza.dealer
    const turn = group.rotation.y
    bv.player.relocate(
      at.x + Math.sin(turn) * 1.2,
      at.z + Math.cos(turn) * 1.2,
      0
    )
    return { x: at.x, z: at.z }
  })
  await faceSpot(page, at.x, at.z, 0.8)
  await heardWhere(page)
}

const stage = (page: Page, quest: string) =>
  page.evaluate((q) => window.__bv?.quests?.[q] ?? null, quest)
const xp = (page: Page) => page.evaluate(() => window.__bv?.xp ?? 0)

test("Gron's quests: a berry, Erwin next door, the floppy disk", async ({
  page,
}) => {
  // One long walk through all three, from the bush to the plaza and back.
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
  const gron = page.getByRole('dialog', {
    name: copy('outfits.gron'),
    exact: true,
  })
  await expect(gron).toBeVisible()
  expect(await page.evaluate(() => window.__bv?.player.locked)).toBe(false)

  // First: a berry. Taken on, he waits for one.
  const go = gron.locator('[data-bv="gron-quest-go"]')
  await expect(gron).toContainText(copy('quests.berries_title'))
  await expect(go).toHaveText(copy('quests.berries_accept'))
  await go.click()
  await expect.poll(() => stage(page, 'gron-berries')).toBe('given')
  await expect(gron.locator('[data-bv="gron-quest-line"]')).toHaveText(
    copy('quests.berries_waiting')
  )
  await expect(go).toBeHidden()
  // A berry in the pack, and he takes it, for XP.
  const before = await xp(page)
  await page.evaluate(() => window.__bv?.grant('berries'))
  await expect(go).toHaveText(copy('quests.berries_reward'))
  await go.click()
  await expect.poll(() => stage(page, 'gron-berries')).toBe('done')
  await expect.poll(() => xp(page)).toBeGreaterThan(before)
  await expect(gron.locator('[data-bv="gron-said"]')).toHaveText(
    copy('quests.berries_finished')
  )

  // Then: Erwin next door. Gron sends the raider, and only Erwin ends it.
  await expect(gron).toContainText(copy('quests.erwin_title'))
  await go.click()
  await expect.poll(() => stage(page, 'gron-erwin')).toBe('given')
  await expect(go).toBeHidden()
  await page.keyboard.press('KeyE')
  await expect(gron).toHaveCount(0)

  await standAtErwin(page)
  await page.keyboard.press('KeyE')
  const erwin = page.locator('.bv-deal')
  await expect(erwin).toBeVisible()
  await erwin.locator('[data-bv="trade-tab-quest"]').click()
  await expect(erwin).toContainText(copy('quests.erwin_title'))
  await expect(erwin.locator('[data-bv="trade-quest-go"]')).toHaveText(
    copy('quests.erwin_reward')
  )
  await erwin.locator('[data-bv="trade-quest-go"]').click()
  await expect.poll(() => stage(page, 'gron-erwin')).toBe('done')
  // His own quest is back on the tab.
  await expect(erwin).toContainText(copy('quests.rose_title'))
  await page.keyboard.press('KeyE')
  await expect(erwin).toBeHidden()

  // Last: the floppy disk from the industrial zone.
  await standAtGron(page)
  await page.keyboard.press('KeyE')
  await expect(gron).toBeVisible()
  await expect(gron).toContainText(copy('quests.floppy_title'))
  await go.click()
  await expect.poll(() => stage(page, 'gron-floppy')).toBe('given')
  await page.evaluate(() => window.__bv?.grant('floppy-disk'))
  await expect(go).toHaveText(copy('quests.floppy_reward'))
  await go.click()
  await expect.poll(() => stage(page, 'gron-floppy')).toBe('done')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['floppy-disk'] ?? 0))
    .toBe(0)
  await expect(gron.locator('[data-bv="gron-quest-line"]')).toHaveText(
    copy('quests.floppy_done')
  )
})
