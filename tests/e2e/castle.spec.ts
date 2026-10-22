import { inChannel } from '../../src/moat.ts'
import { copy } from './copy.ts'
import { beginRaid, expect, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Castle Entropy's moat is cut ten stories into the ground, and its rim is
// open: walking off it is a fall (fall.ts), and two stories or more
// shatters a raider's geometrie, leaving the pack on their body at the
// bottom (sharedworld.ts rules 24 and 18), unless a pipe down the wall
// catches them on the way (moat.ts catchPipe). The shadowmen walk its floor
// at the floor's height and reach no one up a fire escape (rule 11).

const health = (page: Page) => page.evaluate(() => window.__bv?.health ?? 0)

const carrying = (page: Page) =>
  page.evaluate(() =>
    Object.values(window.__bv?.inventory ?? {}).reduce((sum, n) => sum + n, 0)
  )

test("sprinting off the moat's rim shatters, the body at the bottom", async ({
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

  // Sprinting, too fast for any pipe on the way down to catch them.
  await page.keyboard.down('ShiftLeft')
  await page.keyboard.down('KeyW')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.strikes), { timeout: 30_000 })
    .toBe(1)
  await page.keyboard.up('KeyW')
  await page.keyboard.up('ShiftLeft')
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

test('a shadowman on the floor never reaches a raider up a fire escape', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  // Halfway down the top flight of a fire escape, the floor far below.
  const spot = await page.evaluate(() => {
    const castle = window.__bv?.world.castle
    if (!castle) throw new Error('No castle in the valley')
    const [stair] = castle.stairs
    const { a, b } = stair.flights[0]
    const x = (a.x + b.x) / 2
    const z = (a.z + b.z) / 2
    window.__bv?.player.relocate(x, z, 0)
    // Out on the floor past the foot, clear of the pipes along the wall.
    const foot = {
      x: stair.foot.x + stair.inward.x * 4,
      z: stair.foot.z + stair.inward.z * 4,
    }
    return { x, z, foot, floor: castle.floor }
  })
  await heardWhere(page)
  const whole = await health(page)
  // One stood on the floor right under them: the valley stands it there,
  // and it never strikes.
  await page.evaluate(
    ({ x, z }) => window.__bv?.placeShadowman(x + 0.5, z),
    spot
  )
  const under = () =>
    page.evaluate(
      ({ x, z }) =>
        window.__bv?.shadowmen.table.frames
          .at(-1)
          ?.shadowmen.find((s) => Math.hypot(s.x - x - 0.5, s.z - z) < 0.1) ??
        null,
      spot
    )
  await expect
    .poll(async () => (await under())?.y, { timeout: 30_000 })
    .toBeCloseTo(spot.floor, 1)
  await page.waitForTimeout(3000)
  expect(await health(page)).toBe(whole)
  // Down on the floor past the foot, beside one there, they are struck.
  await page.evaluate(({ foot }) => {
    window.__bv?.player.relocate(foot.x, foot.z, 0)
  }, spot)
  await heardWhere(page)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.groundY))
    .toBeCloseTo(spot.floor, 1)
  await page.evaluate(
    ({ foot }) => window.__bv?.placeShadowman(foot.x + 1, foot.z),
    spot
  )
  await expect.poll(() => health(page), { timeout: 15_000 }).toBeLessThan(whole)
})

test('a raider up on a pipe walks along it', async ({ page }) => {
  await beginRaid(page)
  // On the longest level stretch of the highest pipe, at one end, facing
  // the other.
  const run = await page.evaluate(() => {
    const castle = window.__bv?.world.castle
    if (!castle) throw new Error('No castle in the valley')
    let best = { len: 0, a: { x: 0, z: 0 }, b: { x: 0, z: 0 }, top: 0 }
    // The highest pipe of all: the pipes are stacked down their walls, and
    // a raider is set down on the highest deck where they stand.
    const highest = Math.max(...castle.pipes.map((p) => p.points[0].y))
    for (const pipe of castle.pipes.filter((p) => p.points[0].y === highest)) {
      pipe.points.slice(1).forEach((q, i) => {
        const p = pipe.points[i]
        const len = Math.hypot(q.x - p.x, q.z - p.z)
        if (p.y === q.y && len > best.len) {
          best = { len, a: p, b: q, top: p.y + pipe.radius }
        }
      })
    }
    const { a, b } = best
    const ux = (b.x - a.x) / best.len
    const uz = (b.z - a.z) / best.len
    // Forward is (-sin yaw, -cos yaw).
    window.__bv?.player.relocate(
      a.x + ux * 0.5,
      a.z + uz * 0.5,
      Math.atan2(-ux, -uz)
    )
    return best
  })
  await heardWhere(page)
  const feet = () => page.evaluate(() => window.__bv?.player.groundY ?? 0)
  await expect.poll(feet).toBeCloseTo(run.top, 1)
  // Walked a few metres along it, still up on it.
  await page.keyboard.down('KeyW')
  await expect
    .poll(() =>
      page.evaluate(
        ({ a }) =>
          Math.hypot(
            (window.__bv?.player.pos.x ?? 0) - a.x,
            (window.__bv?.player.pos.z ?? 0) - a.z
          ),
        run
      )
    )
    .toBeGreaterThan(Math.min(4, run.len - 1))
  await page.keyboard.up('KeyW')
  expect(await feet()).toBeCloseTo(run.top, 1)
})

test('a raider who walks off the rim lands on the pipe under it', async ({
  page,
}) => {
  await beginRaid(page)
  // The highest pipe on side 1 (no fire escape), and the rim a step back
  // from the wall over the middle of its first stretch, facing out over
  // the channel.
  const pipe = await page.evaluate(() => {
    const castle = window.__bv?.world.castle
    if (!castle) throw new Error('No castle in the valley')
    const a = castle.outer[1]
    const b = castle.outer[2]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const onSide = castle.pipes.filter((p) => {
      const o = p.points[0]
      const across =
        Math.abs((b.x - a.x) * (o.z - a.z) - (o.x - a.x) * (b.z - a.z)) / len
      return across < 2
    })
    const top = onSide.sort((p, q) => q.points[0].y - p.points[0].y)[0]
    const [p, q] = top.points
    const off = top.radius + 0.75
    const n = top.normal
    const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 }
    // Forward is (-sin yaw, -cos yaw): along the normal, into the channel.
    window.__bv?.player.relocate(
      mid.x - n.x * (off + 1),
      mid.z - n.z * (off + 1),
      Math.atan2(-n.x, -n.z)
    )
    return { top: p.y + top.radius }
  })
  await heardWhere(page)
  const whole = await health(page)
  // Walked off the edge, and let go of the key on the way down (clinging
  // a moment on what catches them, CONFIG.fall.steadySeconds).
  await page.keyboard.down('KeyW')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.fallFrom ?? null), {
      timeout: 10_000,
      intervals: [20],
    })
    .not.toBeNull()
  await page.keyboard.up('KeyW')
  // Down on the pipe, hurt maybe, never shattered.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.fallFrom ?? null))
    .toBeNull()
  expect(await page.evaluate(() => window.__bv?.player.groundY)).toBeCloseTo(
    pipe.top,
    1
  )
  expect(await page.evaluate(() => window.__bv?.strikes)).toBe(0)
  expect(await health(page)).toBeLessThanOrEqual(whole)
  expect(await health(page)).toBeGreaterThan(0)
})
