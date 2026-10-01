import { test as base } from '@playwright/test'
import { beginRaid, expect, watchErrors } from './fixtures.ts'
import type { Page } from '@playwright/test'

// One raid, played in order on one page: shop, ride, take and unload a
// cabbage, extract. Booting the valley takes about 30 seconds on CI, so
// the steps share one boot instead of paying it four times. The specs move
// the player with the dev hook instead of walking, then press the real
// keys. A fresh browser context means the saved inventory starts empty.

base.describe.configure({ mode: 'serial' })

let page: Page
let errors: string[] = []

base.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  errors = watchErrors(page)
  await beginRaid(page)
})

base.afterEach(() => {
  expect(errors).toEqual([])
})

base.afterAll(async () => {
  await page.close()
})

const raid = () => page.evaluate(() => window.__bv?.raid)
const prompt = () => page.locator('.bv-prompt')

async function moveTo(find: string): Promise<void> {
  await page.evaluate((target) => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    const { world, truck } = bv
    const spot =
      target === 'truck'
        ? { x: truck.x, z: truck.z }
        : target === 'cabbage'
          ? world.pickups.find((p) => p.kind === 'cabbage' && !p.taken)
          : target === 'stand'
            ? world.landmarks.find((l) => !l.n.includes('Keep'))
            : world.fuelPoints.find((f) => f !== world.spawnStation)
    if (!spot) throw new Error(`nothing to move to: ${target}`)
    bv.player.relocate(spot.x + 1, spot.z + 1, bv.player.yaw)
  }, find)
}

base('buy an item and the sack from the tailgate', async () => {
  const pocketed = page.locator('.bv-toast').filter({ hasText: 'pocketed' })
  // B buys the selected item when the tailgate sells it. Step round the
  // ring, buying, until both a pocketed item and the sack are bought.
  await page.keyboard.press('Tab')
  for (let i = 0; i < 40; i++) {
    const sack = (await raid())?.sack
    if (sack && (await pocketed.count()) > 0) break
    await page.keyboard.press('KeyB')
    await page.keyboard.press('ArrowRight')
  }
  await page.keyboard.press('Tab')
  expect((await raid())?.sack).toBe(true)
  await expect(pocketed.first()).toBeAttached()
})

base('board the truck, ride, and hop out', async () => {
  await moveTo('truck')
  await expect(prompt()).toHaveText('E — Climb into the Bed')
  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await raid())?.state).toBe('RIDING')
  await expect(prompt()).toHaveText('E — Hop Out')
  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await raid())?.state).toBe('ON_FOOT')
})

base('take a cabbage and unload it at the stand', async () => {
  await moveTo('cabbage')
  await expect(prompt()).toHaveText('E — Take Cabbage')
  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await raid())?.carrying).toBe(1)

  await moveTo('stand')
  await expect(prompt()).toHaveText('E — Unload 1 Cabbage')
  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await raid())?.delivered).toBe(1)
})

base('extract at a station other than the spawn', async () => {
  await moveTo('station')
  await expect(prompt()).toContainText('E — End the Raid at')
  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await raid())?.state).toBe('EXTRACTED')
  await expect(page.locator('[data-bv="again"]')).toBeVisible()
})
