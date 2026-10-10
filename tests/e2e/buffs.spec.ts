import { test as base } from '@playwright/test'
import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  freshRaider,
  freshValley,
  heardWhere,
  watchErrors,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// Rule 25: one raider passes a joint to another standing in front of
// them. The taker gets it in full, its high and its heal; the giver gets
// a share of the high.

const held = (page: Page, kind: string) =>
  page.evaluate((k) => window.__bv?.inventory[k] ?? 0, kind)
const high = (page: Page) =>
  page.evaluate(() => window.__bv?.geometrie.high ?? 0)
const health = (page: Page) => page.evaluate(() => window.__bv?.health ?? 0)

// An open spot off the spawn lot, facing -Z, `dz` metres along it.
async function standInTheOpen(page: Page, dz: number): Promise<void> {
  await page.evaluate((offset) => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    const station = bv.world.spawnStation
    if (!station) throw new Error('no spawn station')
    bv.player.relocate(station.x - 150, station.z - 150 + offset, 0)
  }, dz)
  await heardWhere(page)
}

base.describe('buffs', { tag: '@valley' }, () => {
  base('one raider passes a joint to another', async ({ browser }) => {
    base.slow()
    const valley = freshValley('buffs')
    const a = await (await browser.newContext()).newPage()
    const b = await (await browser.newContext()).newPage()
    const errorsA = watchErrors(a)
    const errorsB = watchErrors(b)
    await Promise.all([
      beginRaid(a, 0, { valley, raider: freshRaider('Able') }),
      beginRaid(b, 1, { valley, raider: freshRaider('Baker') }),
    ])
    await expect
      .poll(() => a.evaluate(() => window.__bv?.valley?.members.length))
      .toBe(2)
    // B two metres in front of A.
    await standInTheOpen(a, 0)
    await standInTheOpen(b, -2)
    await b.evaluate(() => window.__bv?.setHealth(1))
    await expect.poll(() => health(b)).toBe(1)
    await expect
      .poll(() => a.evaluate(() => window.__bv?.valley?.members.length))
      .toBe(2)

    const joints = await held(a, 'joints')
    expect(joints).toBeGreaterThan(0)
    await a.keyboard.press('Tab')
    await a.locator('.bv-bag-cell[data-kind="joints"]').hover()
    await expect(a.locator('.bv-bag-card')).toBeVisible()
    await a.keyboard.press('KeyG')
    await a.keyboard.press('Tab')

    await expect.poll(() => held(a, 'joints')).toBe(joints - 1)
    await expect.poll(() => high(b)).toBeGreaterThan(0.4)
    await expect.poll(() => health(b)).toBe(3)
    await expect.poll(() => high(a)).toBeGreaterThan(0.2)
    expect(await high(a)).toBeLessThan(await high(b))
    await expect(b.locator('.bv-chat')).toContainText(
      copy('items.joints.label')
    )
    await expect(a.locator('.bv-chat')).toContainText(
      copy('items.joints.label')
    )

    expect(errorsA).toEqual([])
    expect(errorsB).toEqual([])
  })
})
