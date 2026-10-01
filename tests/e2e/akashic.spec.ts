import { expect, test } from './fixtures.ts'

test('every Akashic asset builds with geometry', async ({ page }) => {
  await page.goto('/akashic')
  await expect.poll(() => page.evaluate(() => !!window.__akashic)).toBe(true)
  const ids = await page.evaluate(() => window.__akashic?.ids ?? [])
  expect(ids.length).toBeGreaterThan(0)

  const stats = page.locator('.ak-stats')
  for (const id of ids) {
    await page.evaluate((asset) => window.__akashic?.select(asset), id)
    // The panel reads "<id>\n<n> tris\n<size>" for the shown asset.
    await expect(stats).toContainText(id)
    const tris = Number((await stats.textContent())?.match(/(\d+) tris/)?.[1])
    expect(tris, id).toBeGreaterThan(0)
  }
})
