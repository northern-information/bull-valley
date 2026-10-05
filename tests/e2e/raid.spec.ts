import { test as base } from '@playwright/test'
import { copy, copyPattern } from './copy.ts'
import { beginRaid, expect, watchErrors } from './fixtures.ts'
import type { Page } from '@playwright/test'

// One raid, played in order on one page: shop, ride, take and unload a
// cabbage, extract. Booting the valley takes about 30 seconds on CI, so
// the steps share one boot instead of paying it four times. The specs move
// the player with the dev hook instead of walking, then press the real
// keys. A fresh browser context means the saved inventory starts empty.
//
// The @raid tag lets CI run this group in its own job (--grep @raid)
// beside every other spec (--grep-invert @raid).

base.describe('one raid', { tag: '@raid' }, () => {
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

  // How many PBRs the pack holds, as the valley last said (a fresh
  // raider's pack has none). Toasts are no proof: they leave the DOM after
  // 4.4 seconds, which a slow CI runner can outlast.
  const pbrs = () => page.evaluate(() => window.__bv?.inventory.pbr)

  // The roads and lots float over the terrain, so standing at the terrain
  // height sinks into them. The truck parks on a road and the player spawns
  // on the station lot; both must stand on a surface deck.
  base(
    'the truck and the spawn stand on a surface, not the terrain',
    async () => {
      const standing = await page.evaluate(() => {
        const bv = window.__bv
        if (!bv) throw new Error('no dev hook')
        const { world, truck, player } = bv
        const { ground, spawn } = world
        return {
          truckDeck: ground.surfaceAt(truck.x, truck.z),
          spawnDeck: ground.surfaceAt(spawn.x, spawn.z),
          truckStands: truck.group.position.y - ground.at(truck.x, truck.z),
          playerStands: player.groundY - ground.at(spawn.x, spawn.z),
        }
      })
      expect(standing.truckDeck).not.toBeNull()
      expect(standing.spawnDeck).not.toBeNull()
      expect(standing.truckStands).toBeCloseTo(0, 6)
      expect(standing.playerStands).toBeCloseTo(0, 6)
    }
  )

  const cash = () => page.evaluate(() => window.__bv?.cash)

  // What the glow rings: the shelf unit's uuid when it is one, else
  // whether it is the nearest untaken cabbage, or null for nothing.
  const glowShelfUnit = () =>
    page.evaluate(() => {
      const target = window.__bv?.glow
      return target?.parent?.name === 'shelf-display' ? target.uuid : null
    })
  const glowCabbage = () =>
    page.evaluate(() => {
      const bv = window.__bv
      const target = bv?.glow
      if (!bv || !target) return null
      return bv.world.pickups.find((p) => p.mesh === target)?.kind ?? 'other'
    })

  // Stand inside the spawn station's Citgo, `back` metres off unit `unit`
  // of the facing of `kind` (station-local: +X from the back wall, +Z from
  // the sack shelf), and look straight at it.
  async function aimAt(
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
        // relocate() snaps the feet to the floor; the eye stands over them.
        const eyeY = player.groundY + player.eye
        const dx = fx - player.pos.x
        const dz = fz - player.pos.z
        player.yaw = Math.atan2(-dx, -dz)
        player.pitch = Math.atan2(fy - eyeY, Math.hypot(dx, dz))
      },
      [kind, back, unit] as const
    )
  }

  // Unit `unit` of `kind` at the spawn Citgo: whether the glow rings it,
  // and whether it still stands on the shelf.
  const shelfUnit = (kind: string, unit: number) =>
    page.evaluate(
      ([target, slot]) => {
        const { world, glow } = window.__bv!
        const i = world.fuelPoints.indexOf(world.spawnStation!)
        const object = world.shelves.unitFor(i, target, slot)
        return { glows: glow === object, stands: !!object?.visible }
      },
      [kind, unit] as const
    )

  base('buy a drink and the sack inside the Citgo', async () => {
    expect(await pbrs()).toBe(0)
    expect(await cash()).toBe(4000)

    // The unit under the crosshair is the one the glow rings and the one a
    // buy takes: here the first of the three, not the last.
    await aimAt('pbr', [1.3, 0], 0)
    await expect(prompt()).toHaveText(
      copy('prompts.buy', {
        item: copy('items.pbr.label'),
        price: '$0.99',
      })
    )
    await expect
      .poll(() => shelfUnit('pbr', 0))
      .toEqual({
        glows: true,
        stands: true,
      })
    const unit = await glowShelfUnit()
    await page.keyboard.press('KeyE')
    await expect.poll(cash).toBe(4000 - 99)
    await expect
      .poll(() => shelfUnit('pbr', 0))
      .toEqual({
        glows: false,
        stands: false,
      })
    expect((await shelfUnit('pbr', 2)).stands).toBe(true)
    // Its neighbour answers now.
    await expect.poll(glowShelfUnit).not.toBe(unit)
    expect(await glowShelfUnit()).not.toBeNull()
    await expect.poll(pbrs).toBe(1)

    await aimAt('sack', [0, 1.3])
    await expect(prompt()).toHaveText(
      copy('prompts.buy', {
        item: copy('items.sack.label'),
        price: '$3.00',
      })
    )
    await page.keyboard.press('KeyE')
    await expect.poll(async () => (await raid())?.sack).toBe(true)
    expect(await cash()).toBe(4000 - 99 - 300)

    await page.keyboard.press('Tab')
    await expect(page.locator('[data-bv="inv-cash"]')).toHaveText('$36.01')
    await page.keyboard.press('Tab')
  })

  base('board the truck, ride, and hop out', async () => {
    await moveTo('truck')
    await expect(prompt()).toHaveText(copy('prompts.board'))
    // The truck is no item: nothing glows.
    expect(await page.evaluate(() => window.__bv?.glow ?? null)).toBeNull()
    await page.keyboard.press('KeyE')
    await expect.poll(async () => (await raid())?.state).toBe('RIDING')
    await expect(prompt()).toHaveText(copy('prompts.hop_out'))
    await page.keyboard.press('KeyE')
    await expect.poll(async () => (await raid())?.state).toBe('ON_FOOT')
  })

  base('take a cabbage and unload it at the stand', async () => {
    await moveTo('cabbage')
    await expect(prompt()).toHaveText(
      copy('prompts.take', { item: copy('prompts.cabbage') })
    )
    await expect.poll(glowCabbage).toBe('cabbage')
    await page.keyboard.press('KeyE')
    await expect.poll(async () => (await raid())?.carrying).toBe(1)

    await moveTo('stand')
    await expect(prompt()).toHaveText(copy('prompts.unload_one'))
    await page.keyboard.press('KeyE')
    await expect.poll(async () => (await raid())?.delivered).toBe(1)
  })

  base('extract at a station other than the spawn', async () => {
    await moveTo('station')
    await expect(prompt()).toHaveText(copyPattern('prompts.extract_at'))
    await page.keyboard.press('KeyE')
    await expect.poll(async () => (await raid())?.state).toBe('EXTRACTED')
    await expect(page.locator('[data-bv="again"]')).toBeVisible()
  })
})
