import { beginRaid, expect, heardWhere, test } from './fixtures.ts'

// The flashlight in the left hand: the left button raises it and lights
// it, and a shadowman held in the beam bursts.

const flashlight = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__bv?.flashlight)

test('the left button raises the flashlight and puts it down', async ({
  page,
}) => {
  await beginRaid(page)
  expect(await flashlight(page)).toEqual({ up: false, lift: 0 })

  await page.mouse.down()
  await page.mouse.up()
  await expect.poll(() => flashlight(page)).toEqual({ up: true, lift: 1 })
  // The light is the camera's: on once the hand is all the way up.
  const intensity = () =>
    page.evaluate(() => {
      let found = 0
      window.__bv?.camera.traverse((o) => {
        if ('isSpotLight' in o && o.isSpotLight) {
          found = (o as unknown as { intensity: number }).intensity
        }
      })
      return found
    })
  await expect.poll(intensity).toBeGreaterThan(0)

  await page.mouse.down()
  await page.mouse.up()
  await expect.poll(() => flashlight(page)).toEqual({ up: false, lift: 0 })
  await expect.poll(intensity).toBe(0)
})

test('a shadowman held in the beam bursts', async ({ page }) => {
  await beginRaid(page)
  await page.mouse.down()
  await page.mouse.up()
  await expect.poll(() => flashlight(page)).toEqual({ up: true, lift: 1 })

  // Out past the Citgo's haven, then one standing still six metres down
  // the line of sight, close enough that a slope cannot lift it out of
  // the level beam.
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return
    bv.teleport(0.5, 0.5)
    bv.player.pitch = 0
  })
  await heardWhere(page)
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return
    const { yaw } = bv.player
    bv.placeShadowman(
      bv.player.pos.x - Math.sin(yaw) * 6,
      bv.player.pos.z - Math.cos(yaw) * 6
    )
  })
  // The valley burns it in this raider's beam, and the burst plays where
  // it stood.
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__bv?.scene
          .getObjectByName('shadow-bursts')
          ?.children.some((burst) => burst.visible)
      )
    )
    .toBe(true)
})
