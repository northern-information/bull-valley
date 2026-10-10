import { expect, test } from './fixtures.ts'

test('every Akashic asset builds with geometry', async ({ page }) => {
  // One page builds every asset in turn, the whole strip mall among them.
  test.slow()
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

test('the map mode edits the survey and undoes it', async ({ page }) => {
  await page.goto('/akashic#map')
  await expect
    .poll(() => page.evaluate(() => window.__akashic?.map.ready))
    .toBe(true)
  const before = await page.evaluate(() => window.__akashic!.map.geo!.fuel[0].p)
  await page.evaluate(
    ([u, v]) => window.__akashic!.map.view(u, v, 60000),
    before
  )
  const at = await page.evaluate(
    ([u, v]) => window.__akashic!.map.toClient(u, v),
    before
  )
  // A fuel point drags at once, selected or not.
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(at.x + 30, at.y + 20, { steps: 4 })
  await page.mouse.up()
  const moved = await page.evaluate(() => window.__akashic!.map.geo!.fuel[0].p)
  expect(moved[0]).toBeGreaterThan(before[0])
  expect(moved[1]).toBeGreaterThan(before[1])
  expect(await page.evaluate(() => window.__akashic!.map.dirty)).toBe(true)
  await expect(page.locator('.ak-inspector')).toBeVisible()

  await page.evaluate(() => window.__akashic!.map.undo())
  expect(
    await page.evaluate(() => window.__akashic!.map.geo!.fuel[0].p)
  ).toEqual(before)
  expect(await page.evaluate(() => window.__akashic!.map.dirty)).toBe(false)

  // M goes back to the assets, and the edits wait in the map.
  await page.keyboard.press('KeyM')
  await expect(page.locator('.ak-map')).toBeHidden()
  await expect(page.locator('.ak-canvas')).toBeVisible()
})
