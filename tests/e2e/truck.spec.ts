import { beginRaid, expect, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Matthew Marx's truck, as the valley has it.
const leg = (page: Page) =>
  page.evaluate(() => window.__bv?.marx?.leg.kind ?? null)

test('alone in the valley, the first one in picks where Marx goes and he leaves at once', async ({
  page,
}) => {
  await beginRaid(page)
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    bv.player.relocate(bv.truck.x + 1, bv.truck.z + 1, Math.atan2(1, 1))
  })
  await heardWhere(page)
  await page.keyboard.press('KeyE')
  await expect.poll(() => page.evaluate(() => window.__bv?.mapOpen)).toBe(true)
  // A click off toward a corner of the map picks a spot on the roads there.
  const map = page.locator('[data-bv="map"]')
  const box = await map.boundingBox()
  if (!box) throw new Error('no map')
  await map.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } })
  await expect.poll(() => page.evaluate(() => window.__bv?.mapOpen)).toBe(false)
  await expect.poll(() => leg(page)).toBe('charter')
  expect(await page.evaluate(() => window.__bv?.aboard)).toBe(true)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.truck.moving))
    .toBe(true)
})

test('Marx does donuts in the field after reading, until whistled', async ({
  page,
}) => {
  await beginRaid(page)
  await page.evaluate(() => window.__bv?.hurryTruck(0))
  await expect.poll(() => leg(page)).toBe('donuts')
  const truck = () =>
    page.evaluate(() => {
      const bv = window.__bv
      const field = bv?.world.donutField
      if (!bv || !field) return null
      return {
        drifting: bv.truck.drifting,
        inField:
          Math.hypot(bv.truck.x - field.x, bv.truck.z - field.z) < field.radius,
      }
    })
  await expect
    .poll(truck, { timeout: 30_000 })
    .toEqual({ drifting: true, inField: true })
  // Marx's whistle (sharedworld.ts rule 38), onto the bar as it comes,
  // in the hand by its number key, and blown with the click.
  await page.evaluate(() => window.__bv?.grant('marx-whistle', 1))
  await expect
    .poll(() =>
      page.evaluate(() => window.__bv?.hotbar.indexOf('marx-whistle'))
    )
    .toBeGreaterThanOrEqual(0)
  const slot = await page.evaluate(
    () => window.__bv?.hotbar.indexOf('marx-whistle') ?? -1
  )
  await page.keyboard.press(`Digit${slot + 1}`)
  await page.evaluate(() => window.__bv?.useHand())
  await expect.poll(() => leg(page)).toBe('called')
  await expect.poll(truck).toMatchObject({ drifting: false })
})
