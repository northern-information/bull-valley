import {
  beginRaid,
  expect,
  freshRaider,
  freshValley,
  test,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// Waypoints (sharedworld.ts rule 36): a click on the map pins one, a click
// on the pin lifts it, the compass shows each, and the valley keeps them
// for the account.

const waypoints = (page: Page) =>
  page.evaluate(() => window.__bv?.waypoints.length ?? -1)

// A spot near the map's upper-left corner, well clear of any Citgo.
const SPOT = { x: 0.12, y: 0.12 }

async function clickMap(page: Page): Promise<void> {
  const canvas = page.locator('[data-bv="map"]')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no map')
  await canvas.click({
    position: { x: box.width * SPOT.x, y: box.height * SPOT.y },
  })
}

test('a waypoint pinned on the map rides the compass and is kept for the account', async ({
  page,
}) => {
  const valley = freshValley()
  const raider = freshRaider()
  await beginRaid(page, 0, { valley, raider })
  const compass = page.locator('[data-bv="compass"]')
  await expect(compass).toBeVisible()
  await expect(compass).toHaveAttribute('data-pins', '0')

  await page.keyboard.press('m')
  await expect(page.locator('.bv-map')).toBeVisible()
  // The compass steps aside while the map is open.
  await expect(compass).toBeHidden()
  await clickMap(page)
  await expect.poll(() => waypoints(page)).toBe(1)
  await expect(page.locator('[data-bv="map"]')).toHaveAttribute(
    'data-pins',
    '1'
  )
  // A click on the pin lifts it; another pins it again.
  await clickMap(page)
  await expect.poll(() => waypoints(page)).toBe(0)
  await clickMap(page)
  await expect.poll(() => waypoints(page)).toBe(1)
  await page.keyboard.press('m')
  await expect(page.locator('.bv-map')).toBeHidden()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)
  await expect(compass).toBeVisible()
  await expect(compass).toHaveAttribute('data-pins', '1')

  // The next arrival finds it where it was.
  await beginRaid(page, 0, { valley, raider })
  await expect.poll(() => waypoints(page)).toBe(1)
})
