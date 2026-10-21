import { test as base } from '@playwright/test'
import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  faceSpot,
  freshRaider,
  freshValley,
  heardWhere,
  standInTheOpen,
  watchErrors,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// Rule 14: one raider sets an item down out of the pack, everyone sees it
// lie there, and another takes it up with E. Shift drops the whole stack.

// Only what a raider set down: a crossing shadowman burnt in Marx's
// headlights spills dimes of the valley's own, which the spec leaves out.
const drops = (page: Page) =>
  page.evaluate(() => (window.__bv?.drops ?? []).filter((d) => !d.spilled))
const held = (page: Page, kind: string) =>
  page.evaluate((k) => window.__bv?.inventory[k] ?? 0, kind)

// Tab, hover the item's cell, and press `key` over it.
async function overItem(page: Page, kind: string, key: string): Promise<void> {
  await page.keyboard.press('Tab')
  const cell = page.locator(`.bv-bag-cell[data-kind="${kind}"]`)
  await cell.hover()
  await expect(page.locator('.bv-bag-card')).toBeVisible()
  await page.keyboard.press(key)
  await page.keyboard.press('Tab')
}

base.describe('drops', { tag: '@valley' }, () => {
  base(
    'one raider drops an item and another takes it up',
    async ({ browser }) => {
      base.slow()
      const valley = freshValley('drops')
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
      await standInTheOpen(a)
      await standInTheOpen(b, 4)

      // A sets one joint down; the valley takes it out of A's pack, and
      // both see it lie there.
      const jointsA = await held(a, 'joints')
      const jointsB = await held(b, 'joints')
      expect(jointsA).toBeGreaterThan(0)
      await overItem(a, 'joints', 'KeyX')
      await expect.poll(() => held(a, 'joints')).toBe(jointsA - 1)
      await expect.poll(async () => (await drops(b)).length).toBe(1)
      const [lying] = await drops(b)
      expect(lying).toMatchObject({ kind: 'joints', count: 1 })
      await expect(a.locator('.bv-chat')).toContainText(
        copy('items.joints.label')
      )

      // B walks up to it: its name floats over it, and E takes it up.
      await b.evaluate(([x, z]) => window.__bv?.player.relocate(x, z + 1, 0), [
        lying.x,
        lying.z,
      ] as const)
      await faceSpot(b, lying.x, lying.z)
      // The valley gives a drop only to a raider it has heard stand in reach.
      await heardWhere(b)
      await expect(b.locator('.bv-item-label')).toContainText(
        copy('items.joints.label')
      )
      await b.keyboard.press('KeyE')
      await expect.poll(() => held(b, 'joints')).toBe(jointsB + 1)
      await expect.poll(async () => (await drops(a)).length).toBe(0)

      // Shift drops the whole stack.
      const marlboros = await held(a, 'marlboro')
      expect(marlboros).toBeGreaterThan(0)
      await overItem(a, 'marlboro', 'Shift+KeyX')
      await expect.poll(() => held(a, 'marlboro')).toBe(0)
      await expect
        .poll(async () => (await drops(b)).map((d) => [d.kind, d.count]))
        .toEqual([['marlboro', marlboros]])

      expect(errorsA).toEqual([])
      expect(errorsB).toEqual([])
    }
  )
})
