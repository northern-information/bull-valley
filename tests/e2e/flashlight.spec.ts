import { copy } from './copy.ts'
import { beginRaid, expect, heardWhere, test } from './fixtures.ts'

// The flashlight in the left hand: the left button raises it and lights
// it, and a shadowman held in the beam bursts into dimes, which are cash.

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

test('a shadowman held in the beam bursts into dimes', async ({ page }) => {
  await beginRaid(page)
  await page.mouse.down()
  await page.mouse.up()
  await expect.poll(() => flashlight(page)).toEqual({ up: true, lift: 1 })

  // Out past the Citgo's haven, then one standing still down the line of
  // sight: past the distance it would rush from (CONFIG.shadowmen
  // rushRadius), inside the beam's reach (CONFIG.flashlight.range). The
  // beam is aimed at its chest over the holder's own feet, so no slope
  // lifts it out.
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
      bv.player.pos.x - Math.sin(yaw) * 27,
      bv.player.pos.z - Math.cos(yaw) * 27
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

  // The burn counts toward the daily task: one of five, and the tracker
  // under the season says so.
  await expect.poll(() => page.evaluate(() => window.__bv?.task.count)).toBe(1)
  await expect(page.locator('.bv-task-count')).toHaveText(
    copy('task.progress', { count: 1, goal: 5 })
  )
  await expect(page.locator('.bv-task .bv-season-pip--lit')).toHaveCount(1)

  // It leaves its dimes lying where it stood; E takes them up into the
  // wallet, never the pack, and the log says so.
  const dimes = () =>
    page.evaluate(() =>
      (window.__bv?.drops ?? []).filter((d) => d.kind === 'dimes')
    )
  await expect.poll(async () => (await dimes()).length).toBe(1)
  const [lying] = await dimes()
  const cash = await page.evaluate(() => window.__bv?.cash ?? 0)
  await page.evaluate(([x, z]) => window.__bv?.player.relocate(x, z + 1, 0), [
    lying.x,
    lying.z,
  ] as const)
  await expect(page.locator('.bv-item-label')).toContainText(
    copy('labels.dimes', { count: lying.count })
  )
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.cash))
    .toBe(cash + lying.count * 10)
  await expect.poll(async () => (await dimes()).length).toBe(0)
  // As store.ts formatCash has it; a spec cannot import it (it loads the
  // copy).
  const cents = lying.count * 10
  const amount = `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
  await expect(page.locator('.bv-chat')).toContainText(
    copy('log.dimes', { count: lying.count, amount })
  )
})
