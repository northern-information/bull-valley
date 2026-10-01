import { beginRaid, expect, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// These specs move the player with the dev hook instead of walking, then
// press the real keys. Each test gets a fresh browser context, so the
// saved inventory starts empty.

const raidState = (page: Page) => page.evaluate(() => window.__bv?.raid.state)
const prompt = (page: Page) => page.locator('.bv-prompt')
const toasts = (page: Page) => page.locator('.bv-toast')

async function standByTruck(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    bv.player.relocate(bv.truck.x + 1, bv.truck.z + 1, bv.player.yaw)
  })
}

// Board in the loadout, then hop out of the moving truck.
async function boardAndHopOut(page: Page): Promise<void> {
  await standByTruck(page)
  await expect(prompt(page)).toHaveText('E — Climb into the Bed')
  await page.keyboard.press('KeyE')
  await expect.poll(() => raidState(page)).toBe('RIDING')
  await expect(prompt(page)).toHaveText('E — Hop Out')
  await page.keyboard.press('KeyE')
  await expect.poll(() => raidState(page)).toBe('ON_FOOT')
}

test('board the truck, ride, and hop out', async ({ page }) => {
  await beginRaid(page)
  await boardAndHopOut(page)
})

test('take a cabbage and unload it at the stand', async ({ page }) => {
  await beginRaid(page)
  await boardAndHopOut(page)

  await page.evaluate(() => {
    const bv = window.__bv
    const cabbage = bv?.world.pickups.find(
      (p) => p.kind === 'cabbage' && !p.taken
    )
    if (!bv || !cabbage) throw new Error('no cabbage in the valley')
    bv.player.relocate(cabbage.x + 0.5, cabbage.z, bv.player.yaw)
  })
  await expect(prompt(page)).toHaveText('E — Take Cabbage')
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.raid.carrying))
    .toBe(1)

  await page.evaluate(() => {
    const bv = window.__bv
    const stand = bv?.world.landmarks.find((l) => !l.n.includes('Keep'))
    if (!bv || !stand) throw new Error('no cabbage stand')
    bv.player.relocate(stand.x + 1, stand.z, bv.player.yaw)
  })
  await expect(prompt(page)).toHaveText('E — Unload 1 Cabbage')
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.raid.delivered))
    .toBe(1)
})

test('extract at a station other than the spawn', async ({ page }) => {
  await beginRaid(page)
  await boardAndHopOut(page)

  await page.evaluate(() => {
    const bv = window.__bv
    const station = bv?.world.fuelPoints.find(
      (f) => f !== bv.world.spawnStation
    )
    if (!bv || !station) throw new Error('no second station')
    bv.player.relocate(station.x + 1, station.z, bv.player.yaw)
  })
  await expect(prompt(page)).toContainText('E — End the Raid at')
  await page.keyboard.press('KeyE')
  await expect.poll(() => raidState(page)).toBe('EXTRACTED')
  await expect(page.locator('[data-bv="again"]')).toBeVisible()
})

test('buy from the tailgate during the loadout', async ({ page }) => {
  await beginRaid(page)
  const pocketed = toasts(page).filter({ hasText: 'pocketed' })

  // B buys the selected item if the tailgate sells it; step round the ring
  // until something sells.
  await page.keyboard.press('Tab')
  for (let i = 0; i < 20 && (await pocketed.count()) === 0; i++) {
    await page.keyboard.press('KeyB')
    await page.keyboard.press('ArrowRight')
  }
  await expect(pocketed.first()).toBeVisible()
  await page.keyboard.press('Tab')
})
