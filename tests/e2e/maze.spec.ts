import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  freshRaider,
  freshValley,
  heardWhere,
  onLastPoint,
  test,
  watchErrors,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// The heart of the corn maze: six berry bushes round the portal, each
// with a berry a day for every account, and the Caretaker, who keeps the
// maze. Its touch is a strike; one beam does nothing to it, and two at
// once unmake it.

// A spot at the heart, `along` metres down the court (the maze's own z,
// the way its length runs) and `across` it, in the world.
async function court(page: Page, along: number, across = 0) {
  return page.evaluate(
    ([along, across]) => {
      const bv = window.__bv
      const heart = bv?.world.portal?.at
      const place = bv?.world.mazePlace
      if (!heart || !place) throw new Error('no maze')
      const cos = Math.cos(place.yaw)
      const sin = Math.sin(place.yaw)
      return {
        x: heart.x + cos * across - sin * along,
        z: heart.z + sin * across + cos * along,
      }
    },
    [along, across] as const
  )
}

// Stand at `at` looking at `toward`, level.
async function standLooking(
  page: Page,
  at: { x: number; z: number },
  toward: { x: number; z: number }
): Promise<void> {
  await page.evaluate(
    ([at, toward]) => {
      const bv = window.__bv
      if (!bv) throw new Error('no dev hook')
      // The camera looks along (-sin yaw, -cos yaw).
      const yaw = Math.atan2(-(toward.x - at.x), -(toward.z - at.z))
      bv.player.relocate(at.x, at.z, yaw)
      bv.player.pitch = 0
    },
    [at, toward] as const
  )
  await heardWhere(page)
}

const shown = (page: Page) =>
  page.evaluate(() => window.__bv?.caretaker.shown ?? null)

test('a bush at the heart gives a berry of its own', async ({ page }) => {
  await beginRaid(page)
  const berries = () => page.evaluate(() => window.__bv?.inventory.berries)
  expect(await berries()).toBe(0)
  // The Caretaker parked at the maze's far corner, out of sight of the
  // heart: a strike there would leave the berry on the raider's body.
  await page.evaluate(() => {
    const bv = window.__bv
    const corner = bv?.world.mazePlace
    if (!bv || !corner) throw new Error('no maze')
    bv.placeCaretaker(corner.x, corner.z)
  })
  // A step in from the second bush toward the portal.
  await page.evaluate(() => {
    const bv = window.__bv
    const bush = bv?.world.bushes[1]
    const heart = bv?.world.portal?.at
    if (!bv || !bush || !heart) throw new Error('no maze bush')
    const d = Math.hypot(heart.x - bush.x, heart.z - bush.z)
    bv.player.relocate(
      bush.x + ((heart.x - bush.x) / d) * 0.9,
      bush.z + ((heart.z - bush.z) / d) * 0.9,
      bv.player.yaw
    )
  })
  // The valley gives a berry only to a raider it has heard stand in reach.
  await heardWhere(page)
  const label = page.locator('.bv-item-label')
  await expect(label).toHaveText(copy('labels.berries'))
  await page.keyboard.press('KeyE')
  await expect.poll(berries).toBe(1)
  await expect(label).toHaveText(copy('labels.berry_picked'))
  expect(await page.evaluate(() => window.__bv?.daily?.collected)).toEqual([1])
})

test("the Caretaker's touch puts you back at the Citgo", async ({ page }) => {
  await beginRaid(page)
  // In the court, and the Caretaker a few strides down it.
  const me = await court(page, 2)
  const there = await court(page, -3)
  await standLooking(page, me, there)
  await onLastPoint(page)
  await page.evaluate(({ x, z }) => window.__bv?.placeCaretaker(x, z), there)
  await expect.poll(() => page.evaluate(() => window.__bv?.strikes)).toBe(1)
  // Caught, and then told the pack lies where it fell.
  await expect
    .poll(() =>
      page.evaluate(() => window.__bv?.chat.slice(-2).map((line) => line.text))
    )
    .toEqual([copy('log.caught'), copy('log.fell')])
  const fromSpawn = await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return null
    const { pos } = bv.player
    return Math.hypot(pos.x - bv.world.spawn.x, pos.z - bv.world.spawn.z)
  })
  expect(fromSpawn).toBeLessThan(1)
})

test.describe('two flashlights', { tag: '@valley' }, () => {
  test('one beam does nothing to the Caretaker, two unmake it', async ({
    browser,
  }) => {
    test.slow()
    const valley = freshValley('caretaker')
    const a = await (await browser.newContext()).newPage()
    const b = await (await browser.newContext()).newPage()
    const errorsA = watchErrors(a)
    const errorsB = watchErrors(b)
    await Promise.all([
      beginRaid(a, 0, { valley, raider: freshRaider('Lamp') }),
      beginRaid(b, 1, { valley, raider: freshRaider('Wick') }),
    ])
    // Down the court from where it is put to float still, side by side,
    // looking at it: past its sight (CONFIG.caretaker.sightRange), so it
    // never comes for them, and well inside a flashlight's reach.
    const there = await court(a, -2)
    await standLooking(a, await court(a, -24, -0.6), there)
    await standLooking(b, await court(b, -24, 0.6), there)
    await a.evaluate(({ x, z }) => window.__bv?.placeCaretaker(x, z), there)
    await expect.poll(() => shown(a)).not.toBeNull()

    // One beam, held well past what two would need.
    await a.evaluate(() => window.__bv?.toggleFlashlight())
    await expect
      .poll(() => a.evaluate(() => window.__bv?.sent?.light))
      .toBe(true)
    await a.waitForTimeout(3000)
    expect((await shown(a))?.burn ?? 1).toBe(0)

    // Two: it pales, then is gone, for both of them.
    await b.evaluate(() => window.__bv?.toggleFlashlight())
    await expect.poll(() => shown(a)).toBeNull()
    await expect.poll(() => shown(b)).toBeNull()
    await expect
      .poll(() =>
        b.evaluate(() =>
          window.__bv?.scene
            .getObjectByName('shadow-bursts')
            ?.children.some((burst) => burst.visible)
        )
      )
      .toBe(true)
    // Season One: both beams count toward it.
    for (const page of [a, b]) {
      await expect
        .poll(() => page.evaluate(() => window.__bv?.season.kills))
        .toBe(1)
      // The tracker and the overlay's card (Season One asks for five).
      const count = copy('season.progress', { kills: 1, goal: 5 })
      await expect(page.locator('.bv-season-count')).toHaveText([count, count])
    }
    expect(errorsA).toEqual([])
    expect(errorsB).toEqual([])
  })
})
