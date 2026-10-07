import { test as base } from '@playwright/test'
import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  freshRaider,
  freshValley,
  heardWhere,
  watchErrors,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// Two players in one persistent valley share it: climbing into the bed
// starts Marx's countdown for everyone, and he leaves with whoever is in
// it; a cabbage one takes is gone for the other; and the world keeps what
// happened after everyone has gone, and brings a raider back where they
// left. The specs move players with the dev hook and press the real keys,
// as world.spec.ts does.

const shared = (page: Page) => page.evaluate(() => window.__bv?.valley)
const aboard = (page: Page) => page.evaluate(() => window.__bv?.aboard)
const legKind = (page: Page) =>
  page.evaluate(() => window.__bv?.marx.leg.kind ?? null)
const prompt = (page: Page) => page.locator('.bv-prompt')
// The name over the item E would act on.
const label = (page: Page) => page.locator('.bv-item-label')

// Stand inside the spawn station's Citgo, `back` metres off unit `unit` of
// the facing of `kind`, looking straight at it. Mirrors world.spec.ts.
async function aimAt(
  page: Page,
  kind: string,
  back: [number, number],
  unit = 1
): Promise<void> {
  await page.evaluate(
    ([target, [bx, bz], slot]) => {
      const bv = window.__bv
      if (!bv) throw new Error('no dev hook')
      const { world, player } = bv
      const station = world.spawnStation
      if (!station) throw new Error('no spawn station')
      const i = world.fuelPoints.indexOf(station)
      const facing = world.facings[i].find((f) => f.kind === target)
      if (!facing) throw new Error(`no facing: ${target}`)
      const cos = Math.cos(station.yaw)
      const sin = Math.sin(station.yaw)
      const [fx, fy, fz] = facing.units[slot]
      player.relocate(fx + cos * bx - sin * bz, fz + sin * bx + cos * bz)
      const eyeY = player.groundY + player.eye
      const dx = fx - player.pos.x
      const dz = fz - player.pos.z
      player.yaw = Math.atan2(-dx, -dz)
      player.pitch = Math.atan2(fy - eyeY, Math.hypot(dx, dz))
    },
    [kind, back, unit] as const
  )
}

async function moveToTruck(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    bv.player.relocate(bv.truck.x + 1, bv.truck.z + 1, bv.player.yaw)
  })
}

// Stand a stride off the first untaken cabbage, looking down at it, and
// say which it is.
async function moveToCabbage(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bv = window.__bv!
    const i = bv.world.pickups.findIndex(
      (p) => p.kind === 'cabbage' && !p.taken
    )
    const spot = bv.world.pickups[i]
    bv.player.relocate(spot.x + 1, spot.z + 1, Math.atan2(1, 1))
    bv.player.pitch = -0.5
    return i
  })
}

base.describe('a shared world', { tag: '@valley' }, () => {
  base(
    'the bed counts down for everyone, and Marx leaves with both',
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
        beginRaid(a, 0, { valley, raider: freshRaider('Able') }),
        beginRaid(b, 1, { valley, raider: freshRaider('Baker') }),
      ])
      await expect.poll(async () => (await shared(a))?.members.length).toBe(2)

      // The shelves are shared: A buys the first drink of three at the
      // spawn Citgo, and B's shelf there is short that one. Cash stays each
      // player's own.
      const spawnIndex = await a.evaluate(() => {
        const { world } = window.__bv!
        return world.fuelPoints.indexOf(world.spawnStation!)
      })
      const perItem = (await shared(a))!.shelves[spawnIndex].pbr.length
      await aimAt(a, 'pbr', [1.3, 0], 0)
      await expect(label(a)).toHaveText(
        copy('labels.price', {
          item: copy('items.pbr.label'),
          price: '$0.99',
        })
      )
      await a.keyboard.press('KeyE')
      await expect
        .poll(() => a.evaluate(() => window.__bv?.cash))
        .toBe(4000 - 99)
      await expect
        .poll(async () => (await shared(b))?.shelves[spawnIndex].pbr)
        .toEqual([false, ...Array<boolean>(perItem - 1).fill(true)])
      expect(await b.evaluate(() => window.__bv?.cash)).toBe(4000)

      // A climbs in: the countdown starts, and B standing by sees it too.
      const leaving = copy('truck.leaves_in', { clock: '' }).trim()
      await moveToTruck(a)
      await expect(prompt(a)).toHaveText(copy('prompts.board'))
      await a.keyboard.press('KeyE')
      await expect.poll(() => aboard(a)).toBe(true)
      await expect(a.locator('.bv-countdown')).toContainText(leaving)
      await moveToTruck(b)
      await expect(b.locator('.bv-countdown')).toContainText(leaving)
      await expect(prompt(a)).toHaveText(copy('prompts.hop_out'))

      // B climbs in too; when the countdown runs out (hurried by a dev
      // server), Marx leaves with both.
      await expect(prompt(b)).toHaveText(copy('prompts.board'))
      await b.keyboard.press('KeyE')
      await expect.poll(() => aboard(b)).toBe(true)
      await b.evaluate(() => window.__bv?.hurryTruck(0))
      await expect.poll(() => legKind(a)).toBe('joyride')
      await expect.poll(() => legKind(b)).toBe('joyride')
      expect(await aboard(a)).toBe(true)
      expect(await aboard(b)).toBe(true)
      expect((await shared(a))?.truck.riders).toHaveLength(2)
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

      // A goes over the side and takes a cabbage; B sees it go.
      await a.keyboard.press('KeyE')
      await expect.poll(() => aboard(a)).toBe(false)
      const index = await moveToCabbage(a)
      await expect(label(a)).toHaveText(copy('labels.cabbage'))
      await a.keyboard.press('KeyE')
      await expect
        .poll(() => a.evaluate(() => window.__bv?.inventory.cabbage))
        .toBe(1)
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

  base(
    'the world keeps what happened, and brings a raider back where they left',
    async ({ browser }) => {
      base.slow()
      const valley = freshValley('persist')
      const able = freshRaider('Able')
      const first = await browser.newContext()
      const a = await first.newPage()
      const errorsA = watchErrors(a)
      await beginRaid(a, 0, { valley, raider: able })
      await expect.poll(async () => (await shared(a))?.members.length).toBe(1)

      // A takes a cabbage, walks off a way, and leaves the valley. E acts
      // on what the last frame resolved, so wait for the cabbage's name to
      // float over it before pressing.
      const index = await moveToCabbage(a)
      await expect(label(a)).toHaveText(copy('labels.cabbage'))
      await a.keyboard.press('KeyE')
      await expect
        .poll(() =>
          a.evaluate((i) => window.__bv?.world.pickups[i].taken, index)
        )
        .toBe(true)
      const left = await a.evaluate(() => {
        const bv = window.__bv!
        bv.player.relocate(bv.player.pos.x + 20, bv.player.pos.z - 15, 1.25)
        return { x: bv.player.pos.x, z: bv.player.pos.z }
      })
      await heardWhere(a)
      expect(errorsA).toEqual([])
      await first.close()

      // Nobody is here. B arrives to find the cabbage gone all the same.
      const second = await browser.newContext()
      const b = await second.newPage()
      const errorsB = watchErrors(b)
      await beginRaid(b, 1, { valley, raider: freshRaider('Baker') })
      await expect
        .poll(() =>
          b.evaluate((i) => window.__bv?.world.pickups[i].taken, index)
        )
        .toBe(true)
      expect((await shared(b))?.taken).toEqual([index])

      // A comes back, in the same account, where they left.
      const third = await browser.newContext()
      const back = await third.newPage()
      await beginRaid(back, 0, { valley, raider: able })
      await expect
        .poll(() =>
          back.evaluate(({ x, z }) => {
            const p = window.__bv?.player.pos
            return p ? Math.hypot(p.x - x, p.z - z) : Infinity
          }, left)
        )
        .toBeLessThan(1)
      expect(errorsB).toEqual([])
      await second.close()
      await third.close()
    }
  )
})
