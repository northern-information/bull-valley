import { expect, test } from './fixtures.ts'

test('every Akashic asset builds with geometry', async ({ page }) => {
  // Every asset in turn, well over a hundred of them, the whole strip mall
  // among them.
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

test('the kind chips and the search narrow the asset list', async ({
  page,
}) => {
  await page.goto('/akashic')
  await expect.poll(() => page.evaluate(() => !!window.__akashic)).toBe(true)
  const all = await page.evaluate(() => window.__akashic!.ids.length)

  await page.locator('.ak-kinds [data-kind="characters"]').click()
  const characters = await page.evaluate(() => window.__akashic!.shown)
  expect(characters.length).toBeGreaterThan(0)
  expect(characters.length).toBeLessThan(all)
  expect(characters).toContain(
    await page.evaluate(() => window.__akashic!.current)
  )
  await expect(page.locator('select[name="asset"] option')).toHaveCount(
    characters.length
  )

  await page.locator('.ak-search').fill('shadowman')
  const found = await page.evaluate(() => window.__akashic!.shown)
  expect(found).toContain('shadowman')
  expect(found.every((id) => characters.includes(id))).toBe(true)

  // → cycles within what is shown.
  await page.locator('.ak-search').blur()
  await page.keyboard.press('ArrowRight')
  expect(found).toContain(await page.evaluate(() => window.__akashic!.current))

  // A deep link to a hidden asset clears the filters.
  await page.evaluate(() => window.__akashic!.select('pump'))
  expect(await page.evaluate(() => window.__akashic!.shown.length)).toBe(all)
  await expect(page.locator('.ak-search')).toHaveValue('')
})
