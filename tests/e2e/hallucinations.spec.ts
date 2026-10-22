import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  faceSpot,
  standInTheOpen,
  test,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// Tripping, the valley shows this raider someone or something that is not
// there (hallucinations.ts); E on it bursts it in fuchsia, and it is gone.

const standing = (page: Page) =>
  page.evaluate(() => window.__bv?.hallucinations.list.map((h) => h.id) ?? [])

test('a trip shows what is not there, and E bursts it', async ({ page }) => {
  await beginRaid(page)
  await standInTheOpen(page)
  // Sober, nothing comes.
  expect(await standing(page)).toEqual([])

  // A tab of LSD into the pack, onto the bar, and taken.
  await page.evaluate(() => window.__bv?.grant('lsd', 1))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.lsd ?? 0))
    .toBe(1)
  await page.keyboard.press('Tab')
  await page.locator('.bv-bag-cell[data-kind="lsd"]').hover()
  await expect(page.locator('.bv-bag-card')).toBeVisible()
  const saved = page.waitForResponse(
    (res) => res.url().endsWith('/auth/hotbar') && res.ok()
  )
  await page.keyboard.press('Digit1')
  await saved
  await page.keyboard.press('Tab')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)
  await page.keyboard.press('Digit1')
  await page.evaluate(() => window.__bv?.useHand())
  await expect
    .poll(() => page.evaluate(() => window.__bv?.wards.tripping ?? 0))
    .toBeGreaterThan(0.5)

  // The first comes a short way into the trip, out ahead.
  await expect
    .poll(async () => (await standing(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(0)
  const seen = await page.evaluate(() => {
    const h = window.__bv?.hallucinations.list[0]
    return h ? { id: h.id, x: h.x, z: h.z, shape: h.look.shape } : null
  })
  if (!seen) throw new Error('no hallucination')

  // Up to it, a step short, facing it: it glows as the real one would.
  await page.evaluate(
    ({ x, z }) => window.__bv?.player.relocate(x, z + 1, 0),
    seen
  )
  await faceSpot(page, seen.x, seen.z, 1)
  await expect
    .poll(() =>
      page.evaluate(() => {
        let o = window.__bv?.glow ?? null
        while (o && o.userData.hallucination === undefined) o = o.parent
        return o?.userData.hallucination as number | undefined
      })
    )
    .toBe(seen.id)

  // E: it bursts, and is gone.
  await page.keyboard.press('KeyE')
  await expect.poll(() => standing(page)).not.toContain(seen.id)
  expect(
    await page.evaluate(() => window.__bv?.hallucinations.bursts)
  ).toBeGreaterThanOrEqual(1)
  await expect
    .poll(() =>
      page.evaluate(() => window.__bv?.chat.map((line) => line.text) ?? [])
    )
    .toContain(
      copy(
        seen.shape === 'thing'
          ? 'hallucinations.thing'
          : 'hallucinations.person'
      )
    )
})
