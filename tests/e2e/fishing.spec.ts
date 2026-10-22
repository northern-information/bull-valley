import { copy } from './copy.ts'
import { beginRaid, expect, frames, heardWhere, test } from './fixtures.ts'

// Rule 36: E at the tackle box on the firefly pond's landing opens it: a
// rod out of the box, nightcrawlers out of the bank, and the bait picked.
// Then R puts the rod in the left hand and the click casts, and the fight
// plays over the view as Final Fantasy XI plays it, the arrows answered
// until the fish is spent and a click reels it in.

test('the tackle box gives a rod and bait, and a click casts and fights to the end', async ({
  page,
}) => {
  test.slow()
  await beginRaid(page)
  const pond = await page.evaluate(() => window.__bv?.ponds[0] ?? null)
  expect(pond).not.toBeNull()
  // A step back from the box, inside the fireflies' haven.
  await page.evaluate(() => {
    const bv = window.__bv
    const pond = bv?.ponds[0]
    if (!bv || !pond) throw new Error('no pond')
    const { landing } = pond
    const d = Math.hypot(landing.x - pond.x, landing.z - pond.z)
    const x = landing.x + ((landing.x - pond.x) / d) * 1.5
    const z = landing.z + ((landing.z - pond.z) / d) * 1.5
    bv.player.relocate(x, z, 0)
  })
  await heardWhere(page)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.fish'))
  // Nothing but the flashlight to hold yet.
  await page.keyboard.press('KeyR')
  expect(await page.evaluate(() => window.__bv?.held)).toBe('flashlight')
  await page.keyboard.press('KeyE')
  const dialog = page.locator('.bv-fish')
  await expect(dialog).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.angler?.skill))
    .toBe(0)

  // No bait to pick until the bank is dug.
  const worms = dialog.locator('[data-bait-pick="nightcrawlers"]')
  await expect(worms).toBeDisabled()
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
  await expect(worms).toHaveAttribute('aria-pressed', 'true')
  await expect(worms).toHaveText(
    copy('fishing.bait_on', { bait: copy('items.nightcrawlers.label') })
  )
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  // The pointer is the valley's again.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)

  // R: the rod in the left hand, and the click casts.
  await page.keyboard.press('KeyR')
  expect(await page.evaluate(() => window.__bv?.held)).toBe('rod')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.sent?.held))
    .toBe('rod')
  const ends = [
    copy('fishing.nothing'),
    copy('fishing.lost_skill'),
    copy('fishing.snap'),
    copy('fishing.gave_up'),
  ]
  await page.evaluate(() => window.__bv?.useHeld())
  await expect
    .poll(() => page.evaluate(() => window.__bv?.line !== null))
    .toBe(true)
  const hud = page.locator('.bv-fish-hud')
  await expect(hud).toBeVisible()
  await expect(hud.locator('.bv-fish-hud-call')).toHaveText(
    copy('fishing.waiting')
  )
  // Answer every arrow until the line comes out of the water: spent, the
  // fish is reeled in with a click; out of time, it is gone.
  const arrow = hud.locator('.bv-fish-hud-arrow')
  const deadline = Date.now() + 90_000
  while (await page.evaluate(() => window.__bv?.line !== null)) {
    expect(Date.now()).toBeLessThan(deadline)
    const shown = (await arrow.textContent()) ?? ''
    if (shown === '◀') await page.keyboard.press('KeyA')
    else if (shown === '▶') await page.keyboard.press('KeyD')
    else if (shown === copy('fishing.spent')) {
      await page.evaluate(() => window.__bv?.useHeld())
    }
    await frames(page, 3)
  }
  await expect(hud).toBeHidden()
  const caught = [
    copy('fishing.caught', { item: '' }).slice(0, 10),
    copy('fishing.caught_junk', { item: '' }).slice(0, 10),
  ]
  await expect
    .poll(async () => {
      const text = (await page.locator('.bv-chat').textContent()) ?? ''
      return [...ends, ...caught].some((end) => text.includes(end))
    })
    .toBe(true)
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
    const pond = bv?.ponds[0]
    if (!bv || !pond) throw new Error('no pond')
    bv.player.relocate(pond.landing.x + 1, pond.landing.z, 0)
  })
  await heardWhere(page)
  await page.keyboard.press('KeyE')
  await expect(page.locator('[data-bv="fish-rod"]')).toHaveText(
    copy('fishing.has_rod', { rod: copy('items.g-loomis.label') })
  )
})

// Rule 36: three firefly ponds, the second past the corn maze with its own
// tackle box; and Erwin's jar catches a slurm crawling on a Citgo's lot.
test('three ponds, and a slurm caught alive in the jar', async ({ page }) => {
  test.slow()
  await beginRaid(page)
  const ponds = await page.evaluate(() => window.__bv?.ponds ?? [])
  expect(ponds).toHaveLength(3)
  // The far pond's tackle box opens its own dialog.
  await page.evaluate(() => {
    const bv = window.__bv
    const pond = bv?.ponds[1]
    if (!bv || !pond) throw new Error('no second pond')
    bv.player.relocate(pond.landing.x + 1, pond.landing.z, 0)
  })
  await heardWhere(page)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.fish'))
  await page.keyboard.press('KeyE')
  await expect(page.locator('.bv-fish')).toBeVisible()
  await page.keyboard.press('Escape')

  // At the spawn Citgo with a jar, a drop brought on, a slurm crawling.
  await page.evaluate(() => window.__bv?.grant('slurm-jar', 1))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['slurm-jar']))
    .toBe(1)
  await page.evaluate(() => {
    const bv = window.__bv
    const station = bv?.world.spawnStation
    if (!bv || !station) throw new Error('no spawn station')
    bv.player.relocate(station.x + 3, station.z + 3, 0)
  })
  // The wheel puts the jar in the left hand: only a jar in hand catches.
  await expect(page.locator('.bv-prompt')).not.toHaveText(
    copy('prompts.jar_slurm')
  )
  await page.mouse.wheel(0, -100)
  await expect.poll(() => page.evaluate(() => window.__bv?.held)).toBe('jar')
  // The shelf display parks at the Citgo on the next frames; then the next
  // drop is brought to now.
  await frames(page, 5)
  await page.evaluate(() => window.__bv?.hurrySlurms())
  await expect
    .poll(() => page.evaluate(() => window.__bv?.slurms.length ?? 0), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)
  // Beside one, looking down at it. Slurms crawl, and Carlsten bats them,
  // so on a slow machine the one stood beside can be gone before the
  // prompt reads: stand beside whichever crawls now until the click has
  // one to catch.
  await expect(async () => {
    await page.evaluate(() => {
      const bv = window.__bv
      if (!bv) throw new Error('no hook')
      const slurm = bv.slurms[0]
      if (!slurm) {
        bv.hurrySlurms()
        throw new Error('no slurm')
      }
      bv.player.relocate(slurm.x + 0.9, slurm.z, 0)
      bv.player.yaw = Math.PI / 2
      bv.player.pitch = -0.9
    })
    await heardWhere(page)
    // The click catches it; E does not.
    await expect(page.locator('.bv-prompt')).toHaveText(
      copy('prompts.jar_slurm'),
      { timeout: 2_000 }
    )
  }).toPass({ timeout: 30_000 })
  await page.keyboard.press('KeyE')
  expect(await page.evaluate(() => window.__bv?.inventory.slurm ?? 0)).toBe(0)
  await page.evaluate(() => window.__bv?.useHeld())
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.slurm ?? 0))
    .toBe(1)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.slurm_jarred'))
})

// The third pond, across Lake Avenue from the maze, and what the log says
// on walking into the fireflies' light and out of it again.
test('the fireflies say so as you come into their light and leave it', async ({
  page,
}) => {
  await beginRaid(page)
  const ponds = await page.evaluate(() => window.__bv?.ponds ?? [])
  expect(ponds).toHaveLength(3)
  const chat = page.locator('.bv-chat')
  await expect(chat).not.toContainText(copy('log.fireflies_in'))
  // To the third pond's landing, inside its haven.
  await page.evaluate(() => {
    const bv = window.__bv
    const pond = bv?.ponds[2]
    if (!bv || !pond) throw new Error('no third pond')
    bv.player.relocate(pond.landing.x, pond.landing.z, 0)
  })
  await expect(chat).toContainText(copy('log.fireflies_in'))
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.fish'))
  // Back to the Citgo, out of it.
  await page.evaluate(() => {
    const bv = window.__bv
    const station = bv?.world.spawnStation
    if (!bv || !station) throw new Error('no spawn station')
    bv.player.relocate(station.x, station.z, 0)
  })
  await expect(chat).toContainText(copy('log.fireflies_out'))
})
