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

  // On the rim just back from the edge, inside the fence (castleyard.ts),
  // facing the island.
  const place = await page.evaluate(() => {
    const castle = window.__bv?.world.castle
    if (!castle) throw new Error('No castle in the valley')
    const a = castle.outer[1]
    const b = castle.outer[2]
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    const ox = mid.x - castle.middle.x
    const oz = mid.z - castle.middle.z
    const len = Math.hypot(ox, oz)
    const x = mid.x + (ox / len) * 0.8
    const z = mid.z + (oz / len) * 0.8
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
  // Into the wall until it stops us, or until we leave the floor.
  const start = await page.evaluate(() => {
    const { x, z } = window.__bv!.player.pos
    return { x, z }
  })
  let was = 0
  await page.keyboard.down('KeyW')
  await expect
    .poll(
      async () => {
        const { moved, y } = await page.evaluate(({ x, z }) => {
          const bv = window.__bv!
          return {
            moved: Math.hypot(bv.player.pos.x - x, bv.player.pos.z - z),
            y: bv.player.groundY,
          }
        }, start)
        const still = moved > 1 && moved - was < 0.01
        was = moved
        return still || Math.abs(y - (floor ?? 0)) > 0.5
      },
      { intervals: [250] }
    )
    .toBe(true)
  await page.keyboard.up('KeyW')
  expect(await page.evaluate(() => window.__bv?.player.groundY)).toBeCloseTo(
    floor ?? 0
  )
  expect(await page.evaluate(() => window.__bv?.strikes)).toBe(0)
})

test('a slurm in the moat squashes underfoot', async ({ page }) => {
  test.slow()
  await beginRaid(page)
  // Down on the floor, by the outer wall, where they drop.
  await page.evaluate(() => {
    const castle = window.__bv?.world.castle
    if (!castle) throw new Error('No castle in the valley')
    const a = castle.outer[1]
    const b = castle.outer[2]
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    const ox = mid.x - castle.middle.x
    const oz = mid.z - castle.middle.z
    const len = Math.hypot(ox, oz)
    window.__bv?.player.relocate(
      mid.x - (ox / len) * 8,
      mid.z - (oz / len) * 8,
      0
    )
  })
  // Wait for one down and crawling, then stand on the youngest (the
  // others may be near the end of their lying, about to melt anyway).
  const crawling = () =>
    page.evaluate(
      () =>
        window.__bv?.world.castle
          ?.slurms()
          .filter((s) => s.phase === 'crawling')
          .at(-1) ?? null
    )
  await expect.poll(crawling, { timeout: 60_000 }).not.toBeNull()
  const slurm = await crawling()
  if (!slurm) throw new Error('No slurm crawling')
  await page.evaluate(
    ({ x, z }) => window.__bv?.player.relocate(x, z, 0),
    slurm
  )
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          window.__bv?.world.castle?.slurms().find((s) => s.key === key)
            ?.phase ?? 'gone',
        slurm.key
      )
    )
    .toBe('squashed')
})

test('the payphone on the rim, once found, is a stop for fast travel', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  const phoneAt = () =>
    page.evaluate(() => {
      const phone = window.__bv?.world.payphones[0]
      if (!phone) throw new Error('No payphone in the valley')
      return { x: phone.x, z: phone.z }
    })
  const fromPhone = async () => {
    const at = await phoneAt()
    return page.evaluate((at) => {
      const { x, z } = window.__bv!.player.pos
      return Math.hypot(x - at.x, z - at.z)
    }, at)
  }
  // Not yet found: no fast travel there.
  await page.evaluate(() => window.__bv?.phoneTravel(0))
  expect(await fromPhone()).toBeGreaterThan(50)

  // Stand at it, and the valley writes it in the account's log.
  const at = await phoneAt()
  await page.evaluate((at) => {
    const phone = window.__bv!.world.payphones[0]
    window.__bv?.player.relocate(
      at.x + Math.cos(phone.yaw) * 1.5,
      at.z + Math.sin(phone.yaw) * 1.5,
      0
    )
  }, at)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.citgos.phones ?? []), {
      timeout: 15_000,
    })
    .toContain(0)
  await expect(page.locator('.bv-chat')).toContainText(
    copy('log.payphone_found')
  )

  // From the payphone to the spawn Citgo, and back again.
  const home = await page.evaluate(() => window.__bv?.citgos.last ?? 0)
  await page.evaluate((i) => window.__bv?.fastTravel(i), home)
  await expect
    .poll(() =>
      page.evaluate((i) => {
        const bv = window.__bv!
        const ring = bv.world.rings[i]
        return Math.hypot(bv.player.pos.x - ring.x, bv.player.pos.z - ring.z)
      }, home)
    )
    .toBeLessThan(1)
  await page.evaluate(() => window.__bv?.phoneTravel(0))
  await expect.poll(fromPhone).toBeLessThan(2.5)
})
