import { test as base } from '@playwright/test'
import { copy } from './copy.ts'
import { beginRaid, expect, watchErrors } from './fixtures.ts'
import type { Page } from '@playwright/test'

// A visit to the valley, played in order on one page: shop, climb into the
// truck and out, take a cabbage into the pack's loot. Booting the valley is
// slow on CI, so the steps share one boot instead of paying it each time.
// The specs move the player with the dev hook instead of walking, then
// press the real keys. A fresh raider means the pack starts empty.
//
// The @raid tag lets CI run this group in its own job (--grep @raid)
// beside every other spec (--grep-invert @raid); the job keeps its name.

base.describe('one visit', { tag: '@raid' }, () => {
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

  const aboard = () => page.evaluate(() => window.__bv?.aboard)
  const prompt = () => page.locator('.bv-prompt')
  // The name over the item E would act on.
  const label = () => page.locator('.bv-item-label')

  async function moveTo(find: string): Promise<void> {
    await page.evaluate((target) => {
      const bv = window.__bv
      if (!bv) throw new Error('no dev hook')
      const { world, truck } = bv
      const spot =
        target === 'truck'
          ? { x: truck.x, z: truck.z }
          : world.pickups.find((p) => p.kind === 'cabbage' && !p.taken)
      if (!spot) throw new Error(`nothing to move to: ${target}`)
      // A stride off it, facing it and looking down at it, so an item's
      // label is in view. The view looks along (-sin yaw, -cos yaw).
      bv.player.relocate(spot.x + 1, spot.z + 1, Math.atan2(1, 1))
      bv.player.pitch = -0.5
    }, find)
  }

  // How many PBRs the pack holds, as the valley last said (a fresh
  // raider's pack has none).
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
  // of the facing of `kind` (station-local: +X from the back wall, +Z
  // across the room), and look straight at it.
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

  // The pack's tabs, and the kinds in the grid the shown one fills.
  const bagTab = () =>
    page.locator('.bv-bag-tab[aria-selected="true"]').textContent()
  const bagKinds = () =>
    page
      .locator('.bv-bag-cell[data-kind]')
      .evaluateAll((cells) =>
        cells.map((cell) => cell.getAttribute('data-kind'))
      )

  base('buy a drink inside the Citgo', async () => {
    expect(await pbrs()).toBe(0)
    expect(await cash()).toBe(4000)

    // The unit under the crosshair is the one the glow rings and the one a
    // buy takes: here the first of the three, not the last.
    await aimAt('pbr', [1.3, 0], 0)
    await expect(label()).toHaveText(
      copy('labels.price', {
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

    // The pack opens on Consumables, where the drink is; Loot beside it
    // is empty.
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-bv="inv-cash"]')).toHaveText('$39.01')
    expect(await bagTab()).toBe(copy('inventory.tab_consumables'))
    expect(await bagKinds()).toContain('pbr')
    // Drinking it gets you a little drunk: geometrie's lower left.
    await page.locator('.bv-bag-cell[data-kind="pbr"]').hover()
    await page.keyboard.press('KeyE')
    await expect.poll(pbrs).toBe(0)
    await expect
      .poll(() => page.evaluate(() => window.__bv?.geometrie.drunk ?? 0))
      .toBeGreaterThan(0)
    await page.keyboard.press('KeyD')
    expect(await bagTab()).toBe(copy('inventory.tab_loot'))
    expect(await bagKinds()).toEqual([])
    await page.keyboard.press('Tab')
  })

  base('climb into the bed, see the countdown, and hop out', async () => {
    await moveTo('truck')
    await expect(prompt()).toHaveText(copy('prompts.board'))
    // The truck is no item: nothing glows.
    expect(await page.evaluate(() => window.__bv?.glow ?? null)).toBeNull()
    await page.keyboard.press('KeyE')
    await expect.poll(aboard).toBe(true)
    // Climbing in starts Marx's countdown.
    await expect(page.locator('.bv-countdown')).toContainText(
      copy('truck.leaves_in', { clock: '' }).trim()
    )
    await expect(prompt()).toHaveText(copy('prompts.hop_out'))
    await page.keyboard.press('KeyE')
    await expect.poll(aboard).toBe(false)
    // An empty bed stops it.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const leg = window.__bv?.marx.leg
          return leg?.kind === 'parked' ? leg.leavesAt : 'away'
        })
      )
      .toBeNull()
  })

  base('take a cabbage into the loot', async () => {
    await moveTo('cabbage')
    await expect(label()).toHaveText(copy('labels.cabbage'))
    await expect.poll(glowCabbage).toBe('cabbage')
    await page.keyboard.press('KeyE')
    await expect
      .poll(() => page.evaluate(() => window.__bv?.inventory.cabbage))
      .toBe(1)

    // The pack opens on Consumables again; the cabbage is one tab over.
    await page.keyboard.press('Tab')
    expect(await bagTab()).toBe(copy('inventory.tab_consumables'))
    expect(await bagKinds()).not.toContain('cabbage')
    await page.keyboard.press('KeyD')
    expect(await bagKinds()).toEqual(['cabbage'])
    await page.keyboard.press('Tab')
  })
})
