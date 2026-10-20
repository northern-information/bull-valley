import { inChannel } from '../../src/moat.ts'
import { copy } from './copy.ts'
import { beginRaid, expect, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Castle Entropy's moat is cut ten stories into the ground, and its rim is
// open: walking off it is a fall (fall.ts), and two stories or more
// shatters a raider's geometrie, leaving the pack on their body at the
// bottom (sharedworld.ts rules 24 and 18).

const carrying = (page: Page) =>
  page.evaluate(() =>
    Object.values(window.__bv?.inventory ?? {}).reduce((sum, n) => sum + n, 0)
  )

test("walking off the moat's rim shatters, the body at the bottom", async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  await page.evaluate(() => window.__bv?.grant('marlboro', 20))
  await expect.poll(() => carrying(page)).toBeGreaterThan(19)

  // On the rim a couple of metres back from the edge, facing the island.
  const place = await page.evaluate(() => {
    const castle = window.__bv?.world.castle
    if (!castle) throw new Error('No castle in the valley')
    const a = castle.outer[1]
    const b = castle.outer[2]
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    const ox = mid.x - castle.middle.x
    const oz = mid.z - castle.middle.z
    const len = Math.hypot(ox, oz)
    const x = mid.x + (ox / len) * 2
    const z = mid.z + (oz / len) * 2
    // Forward is (-sin yaw, -cos yaw): toward the middle.
    const yaw = Math.atan2(ox / len, oz / len)
    window.__bv?.player.relocate(x, z, yaw)
    return castle.place
  })
  await heardWhere(page)
  const rim = await page.evaluate(() => window.__bv?.player.groundY ?? 0)

  await page.keyboard.down('KeyW')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.strikes), { timeout: 30_000 })
    .toBe(1)
  await page.keyboard.up('KeyW')
  await expect(page.locator('.bv-chat')).toContainText(copy('log.plunged'))
  // Whole again at the spawn Citgo, and everything left on the body.
  await expect.poll(() => carrying(page)).toBe(0)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.myCorpses.length))
    .toBe(1)
  const [body] = await page.evaluate(() => window.__bv?.corpses ?? [])
  expect(inChannel(place, body.x, body.z)).toBe(true)
  // Far under the rim it fell from.
  const floor = await page.evaluate(() => window.__bv?.world.castle?.floor)
  expect(rim - (floor ?? rim)).toBeGreaterThan(20)
})

test("down in the moat, its walls can't be walked up", async ({ page }) => {
  await beginRaid(page)
  // On the floor, a few metres in from the outer wall, facing it.
  await page.evaluate(() => {
    const castle = window.__bv?.world.castle
    if (!castle) throw new Error('No castle in the valley')
    const a = castle.outer[1]
    const b = castle.outer[2]
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    const ox = mid.x - castle.middle.x
    const oz = mid.z - castle.middle.z
    const len = Math.hypot(ox, oz)
    const x = mid.x - (ox / len) * 4
    const z = mid.z - (oz / len) * 4
    // Forward, (-sin yaw, -cos yaw), away from the middle.
    const yaw = Math.atan2(-ox / len, -oz / len)
    window.__bv?.player.relocate(x, z, yaw)
  })
  const floor = await page.evaluate(() => window.__bv?.world.castle?.floor)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.groundY))
    .toBeCloseTo(floor ?? 0)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(2500)
  await page.keyboard.up('KeyW')
  expect(await page.evaluate(() => window.__bv?.player.groundY)).toBeCloseTo(
    floor ?? 0
  )
  expect(await page.evaluate(() => window.__bv?.strikes)).toBe(0)
})
