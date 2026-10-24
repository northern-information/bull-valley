import { copy } from './copy.ts'
import { beginRaid, expect, frames, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Rule 36: E at the tackle box on the firefly pond's landing opens it: a
// rod out of the box, nightcrawlers out of the bank, and the bait picked.
// The rod lands on the bar; its number key puts it in the hand and the
// click casts, and the fight
// plays over the view as Final Fantasy XI plays it, the arrows answered
// until the fish is spent and a click reels it in.

// A tool newly in the pack lands on the hotbar (held.ts); its number key
// puts it in the hand.
async function selectKind(page: Page, kind: string): Promise<void> {
  await expect
    .poll(() => page.evaluate((k) => window.__bv?.hotbar.indexOf(k), kind))
    .toBeGreaterThanOrEqual(0)
  const slot = await page.evaluate(
    (k) => window.__bv?.hotbar.indexOf(k) ?? -1,
    kind
  )
  await page.keyboard.press(`Digit${slot + 1}`)
}

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
  // The flashlight in hand, from the first slot of the bar.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.held))
    .toBe('flashlight')
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
  await page.keyboard.press('KeyE')
  await expect(dialog).toBeHidden()
  // The pointer is the valley's again.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)

  // The rod went onto the bar as it came out of the box: its number key
  // puts it in the hand, and the click casts.
  await selectKind(page, 'fishing-rod')
  await expect.poll(() => page.evaluate(() => window.__bv?.held)).toBe('rod')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.sent?.held))
    .toBe('rod')
  const ends = [
    copy('fishing.nothing'),
    copy('fishing.lost_skill'),
    copy('fishing.snap'),
    copy('fishing.gave_up'),
  ]
  await page.evaluate(() => window.__bv?.useHand())
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
      await page.evaluate(() => window.__bv?.useHand())
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
  await page.keyboard.press('KeyE')

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
  // The jar went onto the bar as it came, the flashlight still in hand.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.hotbar.includes('slurm-jar')))
    .toBe(true)
  expect(await page.evaluate(() => window.__bv?.held)).toBe('flashlight')
  // Slurms answer only to the jar in hand.
  await selectKind(page, 'slurm-jar')
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
  // prompt reads, or before the click lands: stand beside whichever
  // crawls now and click again until one is caught. A click with nothing
  // in reach only scoops the air. With none crawling, wait for the next
  // drop, never hurry again: each hurry runs this client's slurm clock
  // further ahead of the valley's, which takes a catch only from a drop
  // within two slots of its own (slurms.ts mayJar), so a second or third
  // hurry on a slow runner had every catch refused as gone.
  const jarred = () => page.evaluate(() => window.__bv?.inventory.slurm ?? 0)
  await expect(async () => {
    // A catch the last try waited out may have landed since.
    if ((await jarred()) > 0) return
    await page.evaluate(() => {
      const bv = window.__bv
      if (!bv) throw new Error('no hook')
      const slurm = bv.slurms[0]
      if (!slurm) throw new Error('no slurm crawling yet')
      bv.player.relocate(slurm.x + 0.9, slurm.z, 0)
      bv.player.yaw = Math.PI / 2
      bv.player.pitch = -0.9
    })
    await heardWhere(page)
    // It glows as anything E answers does, and E catches it.
    await expect(page.locator('.bv-prompt')).toHaveText(
      copy('prompts.jar_slurm'),
      { timeout: 2_000 }
    )
    expect(await page.evaluate(() => window.__bv?.glow !== null)).toBe(true)
    await page.keyboard.press('KeyE')
    await expect.poll(jarred, { timeout: 5_000 }).toBe(1)
    // Drops come 30 to 90 seconds apart (CONFIG.slurms).
  }).toPass({ timeout: 150_000 })
  expect(await jarred()).toBe(1)
  expect(await page.evaluate(() => window.__bv?.held)).toBe('jar')
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
