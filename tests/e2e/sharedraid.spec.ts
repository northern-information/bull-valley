import { test as base } from '@playwright/test'
import { beginRaid, expect, freshValley, watchErrors } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Two players in one valley share the raid: the truck waits at the station
// until both are aboard, then leaves for both at the same moment; a
// cabbage one takes is gone for the other; the clock leaves with whoever
// is in the bed. The specs move players with the dev hook and press the
// real keys, as raid.spec.ts does.

const raid = (page: Page) => page.evaluate(() => window.__bv?.raid)
const shared = (page: Page) => page.evaluate(() => window.__bv?.shared)
const prompt = (page: Page) => page.locator('.bv-prompt')

async function moveToTruck(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    bv.player.relocate(bv.truck.x + 1, bv.truck.z + 1, bv.player.yaw)
  })
}

base.describe('a shared raid', { tag: '@valley' }, () => {
  base(
    'the truck waits for everyone, then leaves for both',
    async ({ browser }) => {
      base.slow()
      const valley = freshValley('shared')
      const contextA = await browser.newContext()
      const contextB = await browser.newContext()
      const a = await contextA.newPage()
      const b = await contextB.newPage()
      const errorsA = watchErrors(a)
      const errorsB = watchErrors(b)
      await Promise.all([
        beginRaid(a, 0, { valley, name: 'Able' }),
        beginRaid(b, 1, { valley, name: 'Baker' }),
      ])
      await expect.poll(async () => (await shared(a))?.members.length).toBe(2)

      // A climbs in and waits; the lobby shows the headcount.
      await moveToTruck(a)
      await expect(prompt(a)).toHaveText('E — Climb into the Bed')
      await a.keyboard.press('KeyE')
      await expect.poll(() => a.evaluate(() => window.__bv?.aboard)).toBe(true)
      expect((await raid(a))?.state).toBe('LOADOUT')
      await expect(a.locator('.bv-countdown')).toContainText('1 of 2 aboard')
      await expect(b.locator('.bv-countdown')).toContainText('1 of 2 aboard')
      await expect(prompt(a)).toHaveText('E — Hop Out')

      // B climbs in: everyone is aboard, and the truck leaves for both.
      await moveToTruck(b)
      await expect(prompt(b)).toHaveText('E — Climb into the Bed')
      await b.keyboard.press('KeyE')
      await expect.poll(async () => (await raid(a))?.state).toBe('RIDING')
      await expect.poll(async () => (await raid(b))?.state).toBe('RIDING')
      const sharedA = await shared(a)
      expect(sharedA?.phase).toBe('OUT')
      expect(sharedA?.departReason).toBe('all-aboard')
      expect(sharedA?.riders).toHaveLength(2)
      // Both ride the same truck: the two clients agree where it is, once
      // the time between the two positions is allowed for at the truck's
      // speed. A position is from the page's last frame, which on a slow CI
      // runner can be seconds before the sample is read, so each one is
      // stamped with the wall-clock time of the frame that computed it
      // (both pages share this machine's clock), not the time of reading.
      const sample = (page: Page) =>
        page.evaluate(() => {
          const { truck } = window.__bv!
          const t = Date.now() - (performance.now() - truck.updatedAt)
          return { x: truck.x, z: truck.z, t }
        })
      const truckA = await sample(a)
      const truckB = await sample(b)
      const apart = Math.hypot(truckA.x - truckB.x, truckA.z - truckB.z)
      const drift = (12 * Math.abs(truckA.t - truckB.t)) / 1000
      // Each page drives the truck from its own estimate of the server clock
      // (clock.ts), good to about half its round trip; on a runner at a
      // frame a second a reply can wait most of a frame to be read, so allow
      // two seconds of travel for the two estimates disagreeing.
      const sync = 12 * 2
      expect(apart).toBeLessThan(drift + sync + 10)

      // A hops out and takes a cabbage; B sees it go and cannot take it.
      await a.keyboard.press('KeyE')
      await expect.poll(async () => (await raid(a))?.state).toBe('ON_FOOT')
      const index = await a.evaluate(() => {
        const bv = window.__bv!
        const i = bv.world.pickups.findIndex(
          (p) => p.kind === 'cabbage' && !p.taken
        )
        const spot = bv.world.pickups[i]
        bv.player.relocate(spot.x + 1, spot.z + 1, bv.player.yaw)
        return i
      })
      await expect(prompt(a)).toHaveText('E — Take Cabbage')
      await a.keyboard.press('KeyE')
      await expect.poll(async () => (await raid(a))?.carrying).toBe(1)
      await expect
        .poll(() =>
          b.evaluate((i) => window.__bv?.world.pickups[i].taken, index)
        )
        .toBe(true)
      expect((await shared(b))?.taken).toEqual([index])

      expect(errorsA).toEqual([])
      expect(errorsB).toEqual([])
      await contextA.close()
      await contextB.close()
    }
  )

  base('the clock leaves with whoever is aboard', async ({ browser }) => {
    base.slow()
    const valley = freshValley('clock')
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const a = await contextA.newPage()
    const b = await contextB.newPage()
    const errorsA = watchErrors(a)
    const errorsB = watchErrors(b)
    await Promise.all([
      beginRaid(a, 0, { valley, name: 'Able' }),
      beginRaid(b, 1, { valley, name: 'Baker' }),
    ])
    await expect.poll(async () => (await shared(b))?.members.length).toBe(2)

    await moveToTruck(a)
    // The interaction is resolved once a frame; wait for the prompt.
    await expect(prompt(a)).toHaveText('E — Climb into the Bed')
    await a.keyboard.press('KeyE')
    await expect.poll(() => a.evaluate(() => window.__bv?.aboard)).toBe(true)
    // A dev server lets a spec hurry the shared clock.
    await b.evaluate(() => window.__bv?.hurryTruck(0))
    await expect.poll(async () => (await raid(a))?.state).toBe('RIDING')
    await expect.poll(async () => (await raid(b))?.state).toBe('ON_FOOT')
    expect((await shared(b))?.departReason).toBe('clock')

    expect(errorsA).toEqual([])
    expect(errorsB).toEqual([])
    await contextA.close()
    await contextB.close()
  })
})
