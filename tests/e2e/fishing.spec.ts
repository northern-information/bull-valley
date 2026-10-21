import { copy } from './copy.ts'
import { beginRaid, expect, frames, heardWhere, test } from './fixtures.ts'

// Rule 35: E at the tackle box on the firefly pond's landing opens it: a
// rod out of the box, nightcrawlers out of the bank, and a cast played out
// as Final Fantasy XI plays it, the arrows answered until the fish is spent
// and reeled in.

test('the tackle box gives a rod and bait, and a cast is fought to its end', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  const pond = await page.evaluate(() => window.__bv?.pond ?? null)
  expect(pond).not.toBeNull()
  // A step back from the box, inside the fireflies' haven.
  await page.evaluate(() => {
    const bv = window.__bv
    const pond = bv?.pond
    if (!bv || !pond) throw new Error('no pond')
    const { landing } = pond
    const d = Math.hypot(landing.x - pond.x, landing.z - pond.z)
    const x = landing.x + ((landing.x - pond.x) / d) * 1.5
    const z = landing.z + ((landing.z - pond.z) / d) * 1.5
    bv.player.relocate(x, z, 0)
  })
  await heardWhere(page)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.fish'))
  await page.keyboard.press('KeyE')
  const dialog = page.locator('.bv-fish')
  await expect(dialog).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.angler?.skill))
    .toBe(0)

  // Nothing bites without a rod or bait.
  const cast = dialog.locator('[data-cast="nightcrawlers"]')
  await expect(cast).toBeDisabled()
  await dialog.locator('[data-bv="fish-rod"]').click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['fishing-rod']))
    .toBe(1)
  await expect(dialog.locator('[data-bv="fish-rod"]')).toBeDisabled()
  await dialog.locator('[data-bv="fish-dig"]').click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.nightcrawlers ?? 0))
    .toBeGreaterThan(0)
  await expect(dialog.locator('[data-bv="fish-dig"]')).toBeDisabled()

  const ends = [
    copy('fishing.nothing'),
    copy('fishing.lost_skill'),
    copy('fishing.snap'),
    copy('fishing.gave_up'),
  ]
  await expect(cast).toBeEnabled()
  await cast.click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.line !== null))
    .toBe(true)
  await expect(dialog.locator('[data-bv="fish-call"]')).toHaveText(
    copy('fishing.waiting')
  )
  // Answer every arrow until the line comes out of the water: spent, the
  // fish is reeled in; out of time, it is gone.
  const arrow = dialog.locator('[data-bv="fish-arrow"]')
  const deadline = Date.now() + 90_000
  while (await page.evaluate(() => window.__bv?.line !== null)) {
    expect(Date.now()).toBeLessThan(deadline)
    const shown = (await arrow.textContent()) ?? ''
    if (shown === '◀') await page.keyboard.press('KeyA')
    else if (shown === '▶') await page.keyboard.press('KeyD')
    else if (shown === copy('fishing.spent')) {
      await page.keyboard.press('Space')
    }
    await frames(page, 3)
  }
  const said = dialog.locator('[data-bv="fish-said"]')
  await expect
    .poll(async () => {
      const text = (await said.textContent()) ?? ''
      return (
        ends.includes(text) ||
        text.startsWith(copy('fishing.caught', { item: '' }).slice(0, 10)) ||
        text.startsWith(copy('fishing.caught_junk', { item: '' }).slice(0, 10))
      )
    })
    .toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

// The rod rack in every Citgo: three rods, dearer as they are better, too
// dear for a new account's wallet; one in the pack is the one fished with.
test('the rod rack sells three rods, and the best in the pack is fished with', async ({
  page,
}) => {
  await beginRaid(page)
  // A step out from the rack into the room, looking at the cheapest rod.
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    const { world, player } = bv
    const station = world.spawnStation
    if (!station) throw new Error('no spawn station')
    const i = world.fuelPoints.indexOf(station)
    const facing = world.facings[i].find((f) => f.kind === 'zebco-33')
    if (!facing) throw new Error('no rod rack')
    const [fx, fy, fz] = facing.units[0]
    const cos = Math.cos(station.yaw)
    const sin = Math.sin(station.yaw)
    player.relocate(fx - sin * 1.1, fz + cos * 1.1)
    const eyeY = player.groundY + player.eye
    const dx = fx - player.pos.x
    const dz = fz - player.pos.z
    player.yaw = Math.atan2(-dx, -dz)
    player.pitch = Math.atan2(fy - eyeY, Math.hypot(dx, dz))
  })
  await expect(page.locator('.bv-item-label')).toHaveText(
    copy('labels.price', {
      item: copy('items.zebco-33.label'),
      price: '$50.00',
    })
  )
  const kinds = await page.evaluate(() => {
    const { world } = window.__bv!
    const i = world.fuelPoints.indexOf(world.spawnStation!)
    return world.facings[i]
      .filter((f) => ['zebco-33', 'ugly-stik', 'g-loomis'].includes(f.kind))
      .map((f) => [f.kind, f.units.length])
  })
  expect(kinds).toEqual([
    ['zebco-33', 3],
    ['ugly-stik', 2],
    ['g-loomis', 1],
  ])

  // With the Loomis and the tackle box's rod both in the pack, the tackle
  // box says it fishes with the Loomis.
  await page.evaluate(() => {
    window.__bv?.grant('g-loomis', 1)
    window.__bv?.grant('fishing-rod', 1)
  })
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['g-loomis']))
    .toBe(1)
  await page.evaluate(() => {
    const bv = window.__bv
    const pond = bv?.pond
    if (!bv || !pond) throw new Error('no pond')
    bv.player.relocate(pond.landing.x + 1, pond.landing.z, 0)
  })
  await heardWhere(page)
  await page.keyboard.press('KeyE')
  await expect(page.locator('[data-bv="fish-rod"]')).toHaveText(
    copy('fishing.has_rod', { rod: copy('items.g-loomis.label') })
  )
})
