import { copy } from './copy.ts'
import { beginRaid, expect, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

test('Space jumps, and the feet come back down where they left', async ({
  page,
}) => {
  await beginRaid(page)
  await page.evaluate(() => window.__bv?.teleport(0.5, 0.5))
  await heardWhere(page)
  const feet = () => page.evaluate(() => window.__bv?.player.groundY ?? 0)
  const ground = await feet()
  let top = ground
  await page.keyboard.press('Space')
  await expect
    .poll(async () => {
      top = Math.max(top, await feet())
      return top - ground
    })
    .toBeGreaterThan(0.2)
  // Down again, and no fall told: a hop is not a hard landing.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.fallFrom ?? null))
    .toBeNull()
  expect(Math.abs((await feet()) - ground)).toBeLessThan(0.1)
  expect(await page.evaluate(() => window.__bv?.strikes)).toBe(0)
})

// The Citgo the valley last saw this raider stand at: the spawn Citgo,
// once their first state frame lands.
const lastCitgo = (page: Page) =>
  page.evaluate(() => window.__bv?.citgos.last ?? null)

// A portal phone into the pack, as Tyler gives a new account one.
async function givePhone(page: Page): Promise<void> {
  await page.evaluate(() => window.__bv?.grant('citgo-phone', 1))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['citgo-phone']))
    .toBe(1)
}

test('the portal phone dials a Citgo portal to the last Citgo and back', async ({
  page,
}) => {
  await beginRaid(page)
  await expect.poll(() => lastCitgo(page)).not.toBeNull()
  const station = await lastCitgo(page)
  await givePhone(page)
  // Out in the valley, far from any Citgo.
  await page.evaluate(() => window.__bv?.teleport(0.5, 0.5))
  await heardWhere(page)
  // The phone is on 2 of a new bar, beside the flashlight: its key puts
  // it in the hand, and the click dials.
  await page.keyboard.press('Digit2')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inHand))
    .toBe('citgo-phone')
  await page.evaluate(() => window.__bv?.useHand())
  await expect(page.locator('.bv-phone')).toHaveClass(/bv-phone--raised/)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.myPortal ?? null), {
      timeout: 15_000,
    })
    .not.toBeNull()
  const portal = await page.evaluate(() => {
    const bv = window.__bv
    return bv?.portals.find((p) => p.id === bv.myPortal) ?? null
  })
  if (!portal) throw new Error('no portal')
  expect(portal.station).toBe(station)
  const distanceTo = (end: { x: number; z: number }) =>
    page.evaluate(({ x, z }) => {
      const bv = window.__bv
      return bv ? Math.hypot(bv.player.pos.x - x, bv.player.pos.z - z) : null
    }, end)
  const walkInto = (end: { x: number; z: number }) =>
    page.evaluate(({ x, z }) => {
      const bv = window.__bv
      bv?.player.relocate(x, z, bv.player.yaw)
    }, end)
  // Into the end ahead of us, out at the Citgo.
  await walkInto(portal.field)
  await expect.poll(() => distanceTo(portal.citgo)).toBeLessThan(3)
  // And back out of the twin, where we dialed from, once the portal that
  // took us lets us through again.
  await expect.poll(() => page.evaluate(() => window.__bv?.portalGrace)).toBe(0)
  await walkInto(portal.citgo)
  await expect.poll(() => distanceTo(portal.field)).toBeLessThan(3)
})

test('the map shows the Citgos, and fast travel goes to a known portal phone', async ({
  page,
}) => {
  await beginRaid(page)
  await expect.poll(() => lastCitgo(page)).not.toBeNull()
  const home = (await lastCitgo(page)) ?? 0
  await page.keyboard.press('m')
  await expect(page.locator('.bv-map')).toBeVisible()
  await expect(page.locator('[data-bv="map-last"]')).not.toHaveText('')
  // No portal phone in the pack, and none stood at: no fast travel yet.
  await expect(page.locator('.bv-map-hint')).toHaveText(copy('map.hint_away'))
  await page.keyboard.press('m')
  await expect(page.locator('.bv-map')).toBeHidden()

  const count = await page.evaluate(
    () => window.__bv?.world.fuelPoints.length ?? 0
  )
  const other = (home + 1) % count
  // How far the raider stands from the portal phone by Citgo i's door.
  const fromPhone = (i: number) =>
    page.evaluate((i) => {
      const bv = window.__bv
      const phone = bv?.world.payphones.find((p) => p.station === i)
      if (!bv || !phone) return Infinity
      return Math.hypot(bv.player.pos.x - phone.x, bv.player.pos.z - phone.z)
    }, i)
  // Not yet visited: no fast travel there.
  await page.evaluate((i) => window.__bv?.fastTravel(i), other)
  expect(await fromPhone(other)).toBeGreaterThan(50)
  // Stand on its forecourt, and the valley writes it.
  await page.evaluate((i) => {
    const bv = window.__bv
    const at = bv?.world.fuelPoints[i]
    if (bv && at) bv.player.relocate(at.x + 3, at.z + 3, 0)
  }, other)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.citgos.visited ?? []), {
      timeout: 15_000,
    })
    .toContain(other)
  // Without a portal phone in the pack, only from beside one.
  await page.evaluate((i) => window.__bv?.fastTravel(i), home)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.travel_away'))
  expect(await fromPhone(home)).toBeGreaterThan(50)
  // With one, home again by fast travel, set down at its portal phone.
  await givePhone(page)
  await page.evaluate((i) => window.__bv?.fastTravel(i), home)
  await expect.poll(() => fromPhone(home)).toBeLessThan(2.5)
})

test("a shadowman's touch takes its hit, and the Citgo makes you whole", async ({
  page,
}) => {
  await beginRaid(page)
  const max = await page.evaluate(() => window.__bv?.health)
  expect(max).toBe(1000)
  expect(await page.evaluate(() => window.__bv?.healthMax)).toBe(1000)
  await expect(page.locator('.bv-vitals')).toHaveAttribute(
    'data-health',
    '1000'
  )
  await expect(page.locator('.bv-vitals-bar')).toHaveAttribute(
    'aria-label',
    copy('hud.health_label', { health: 1000, max: 1000 })
  )
  await page.evaluate(() => window.__bv?.grant('marlboro', 20))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.marlboro))
    .toBeGreaterThan(19)
  // Out of the forecourt haven, then a shadowman beside you.
  await page.evaluate(() => window.__bv?.teleport(0.5, 0.5))
  await heardWhere(page)
  const before = await page.evaluate(() => {
    const bv = window.__bv
    return bv ? { x: bv.player.pos.x, z: bv.player.pos.z } : null
  })
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return
    bv.placeShadowman(bv.player.pos.x, bv.player.pos.z + 3)
  })
  // A shadowman's 320, give or take a tenth on the valley's roll.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.health))
    .toBeLessThan(1000)
  const left = (await page.evaluate(() => window.__bv?.health)) ?? 0
  expect(left).toBeGreaterThanOrEqual(1000 - 352)
  expect(left).toBeLessThanOrEqual(1000 - 288)
  await expect(page.locator('.bv-vitals')).toHaveAttribute(
    'data-health',
    String(left)
  )
  await expect(page.locator('.bv-vitals-bar')).toHaveAttribute(
    'aria-label',
    copy('hud.health_label', { health: left, max: 1000 })
  )
  await expect(page.locator('.bv-vitals-damage')).toHaveText(
    copy('hud.damage', { damage: 1000 - left })
  )
  await expect(page.locator('.bv-hurt')).toHaveClass(/bv-hurt--on/)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.hit'))
  // No static, no body: still standing where it struck, the pack whole.
  expect(await page.evaluate(() => window.__bv?.strikes)).toBe(0)
  await expect(page.locator('.bv-static')).toBeHidden()
  const after = await page.evaluate(() => {
    const bv = window.__bv
    return bv
      ? {
          x: bv.player.pos.x,
          z: bv.player.pos.z,
          marlboro: bv.inventory.marlboro,
          bodies: bv.myCorpses.length,
        }
      : null
  })
  expect(
    Math.hypot(
      (after?.x ?? 0) - (before?.x ?? 0),
      (after?.z ?? 0) - (before?.z ?? 0)
    )
  ).toBeLessThan(1)
  expect(after?.marlboro).toBeGreaterThan(19)
  expect(after?.bodies).toBe(0)
  // Back under the Citgo lights, a share of whole back every few seconds:
  // one short of whole, it is whole again in one.
  await page.evaluate(() => window.__bv?.setHealth(990))
  await expect.poll(() => page.evaluate(() => window.__bv?.health)).toBe(990)
  await page.evaluate(() => {
    const bv = window.__bv
    if (bv) bv.player.relocate(bv.world.spawn.x, bv.world.spawn.z)
  })
  await expect.poll(() => page.evaluate(() => window.__bv?.health)).toBe(1000)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.mended'))
})
