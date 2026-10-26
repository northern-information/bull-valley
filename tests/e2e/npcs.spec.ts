import { copy } from './copy.ts'
import { beginRaid, expect, faceSpot, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Walk up to Matthew Marx or David Carlsten and he glows, with no prompt;
// E has him say his next line in the chat log: Marx a stanza of Burns,
// Carlsten small talk. The first time, Marx gives his whistle too.

type Who = 'marx' | 'carlsten'

// Stands the player a stride from him: beside Marx, square to the truck,
// so the truck is in boarding range too; in front of Carlsten, the way he
// faces across the counter.
async function approach(page: Page, who: Who): Promise<void> {
  const at = await page.evaluate((who: Who) => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    const { world, truck, player } = bv
    const station = world.fuelPoints.indexOf(world.spawnStation!)
    const at = who === 'marx' ? truck.driverAt() : world.clerks[station]
    if (!at) throw new Error(`no ${who} to approach`)
    let dx: number
    let dz: number
    if (who === 'marx') {
      dx = -(at.z - truck.z)
      dz = at.x - truck.x
    } else {
      const facing = world.shelves.clerk.getWorldDirection(
        bv.camera.position.clone()
      )
      dx = facing.x
      dz = facing.z
    }
    const d = Math.hypot(dx, dz)
    player.relocate(at.x + (dx / d) * 1.4, at.z + (dz / d) * 1.4)
    return { x: at.x, z: at.z }
  }, who)
  // Looking him in the face, over the counter, so no facing is in view.
  await faceSpot(page, at.x, at.z, 1.6)
}

const glowsOn = (page: Page, who: Who) =>
  page.evaluate((who: Who) => {
    const bv = window.__bv!
    const body = who === 'marx' ? bv.truck.driver.group : bv.world.shelves.clerk
    return bv.glow === body
  }, who)

// Every NPC line in the log, each after its timestamp.
const npcLines = (page: Page) =>
  page
    .locator('.bv-chat-line--npc')
    .evaluateAll((lines) => lines.map((p) => p.lastChild?.textContent ?? ''))

// The newest NPC line in the log, after its timestamp.
const lastLine = (page: Page) =>
  page
    .locator('.bv-chat-line--npc')
    .last()
    .evaluate((p) => p.lastChild?.textContent)

test('Marx glows when you come near and recites a stanza at a time', async ({
  page,
}) => {
  await beginRaid(page)
  await approach(page, 'marx')
  await expect.poll(() => glowsOn(page, 'marx')).toBe(true)
  await expect(page.locator('.bv-prompt')).toBeHidden()
  const name = copy('outfits.marx')
  await page.keyboard.press('KeyE')
  // The gift may land before the first look, so the stanza is looked for
  // among his lines, not as the last.
  await expect
    .poll(() => npcLines(page))
    .toContain(`${name}: ${copy('marx.stanza_1')}`)
  // Met for the first time, he gives his whistle (sharedworld.ts rule
  // 37): into the pack, said, and onto the bar.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['marx-whistle']))
    .toBe(1)
  await expect
    .poll(() => lastLine(page))
    .toBe(`${name}: ${copy('marx.whistle_gift')}`)
  await expect(page.locator('.bv-chat')).toContainText(
    copy('log.whistle_given')
  )
  await expect
    .poll(() => page.evaluate(() => window.__bv?.hotbar))
    .toContain('marx-whistle')
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => lastLine(page))
    .toBe(`${name}: ${copy('marx.stanza_2')}`)

  // A step past his reach, still beside the truck, E boards.
  await page.evaluate(() => {
    const { truck, player } = window.__bv!
    player.relocate(truck.x, truck.z)
  })
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.board'))
  await expect.poll(() => glowsOn(page, 'marx')).toBe(false)
})

test('Carlsten glows when you come near and opens his shelves, a line each time', async ({
  page,
}) => {
  await beginRaid(page)
  // The slurms bring him out from behind the counter on the shared clock,
  // where there is no one to talk to (slurms.ts); hold them off, and wait
  // for him to be back before reading which way he faces.
  await page.evaluate(() => window.__bv!.holdSlurms(true))
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { world } = window.__bv!
        const station = world.fuelPoints.indexOf(world.spawnStation!)
        return world.shelves.clerkAway(station)
      })
    )
    .toBe(false)
  await approach(page, 'carlsten')
  await expect.poll(() => glowsOn(page, 'carlsten')).toBe(true)
  await expect(page.locator('.bv-prompt')).toBeHidden()
  // He keeps the Citgo's shelves: E opens their trade window, his next
  // line under his name.
  const shop = page.locator('.bv-citgo')
  for (const key of ['says_1', 'says_2', 'says_3', 'says_1']) {
    await page.keyboard.press('KeyE')
    await expect(shop.locator('[data-bv="npc-lede"]')).toHaveText(
      copy(`carlsten.${key}`)
    )
    await page.keyboard.press('KeyE')
    await expect(shop).toBeHidden()
    // The game acts on E again once it has the pointer back, which comes
    // a beat after the window closes; a raider never presses that fast.
    await expect
      .poll(() => page.evaluate(() => window.__bv?.player.locked))
      .toBe(true)
  }
})

test("Jericho marks the celestial graveyard, where a shovel digs a mech out of the angel's grave", async ({
  page,
}) => {
  await beginRaid(page)
  // A stride in front of him on Castle Entropy's rim, looking him in the
  // face.
  const at = await page.evaluate(() => {
    const { world, player } = window.__bv!
    const spot = world.castle?.jericho
    if (!spot) throw new Error('No Jericho in the valley')
    player.relocate(
      spot.x + Math.cos(spot.yaw) * 2,
      spot.z + Math.sin(spot.yaw) * 2
    )
    return { x: spot.x, z: spot.z }
  })
  await faceSpot(page, at.x, at.z, 2.2)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bv = window.__bv!
        return bv.glow === bv.world.jerichoRig?.body
      })
    )
    .toBe(true)
  await expect(page.locator('.bv-prompt')).toBeHidden()

  const name = copy('jericho.name')
  const yard = await page.evaluate(() => window.__bv!.world.celestialYard)
  if (!yard) throw new Error('No graveyard in the survey')
  const pinned = () =>
    page.evaluate(
      (yard) =>
        window.__bv!.waypoints.filter(
          (p) => Math.hypot(p.x - yard.x, p.z - yard.z) < 1
        ).length,
      yard
    )
  for (const key of ['says_1', 'says_2']) {
    await page.keyboard.press('KeyE')
    await expect
      .poll(() => lastLine(page))
      .toBe(`${name}: ${copy(`jericho.${key}`)}`)
  }
  expect(await pinned()).toBe(0)
  // His last line pins the graveyard nearest him, and the log names it.
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => lastLine(page))
    .toBe(`${name}: ${copy('jericho.says_3')}`)
  await expect.poll(pinned).toBe(1)
  await expect(page.locator('.bv-chat')).toContainText(
    copy('jericho.marked', { yard: yard.name })
  )
  // Round again, he marks it once.
  const count = await page.evaluate(() => window.__bv!.waypoints.length)
  for (let i = 0; i < 3; i++) await page.keyboard.press('KeyE')
  await expect
    .poll(() => lastLine(page))
    .toBe(`${name}: ${copy('jericho.says_3')}`)
  expect(await page.evaluate(() => window.__bv!.waypoints.length)).toBe(count)
  expect(await pinned()).toBe(1)

  // On to the graveyard he marked (sharedworld.ts rule 42): `back` metres
  // toward the gate from the heap or the grave, looking at it.
  const before = (k: 'shovel' | 'grave', back: number, rise: number) =>
    page.evaluate(
      ([k, back, rise]) => {
        const bv = window.__bv!
        const yard = bv.world.celestial
        if (!yard) throw new Error('No celestial graveyard')
        const to = yard[k]
        const x = to.x + Math.cos(yard.place.yaw) * back
        const z = to.z + Math.sin(yard.place.yaw) * back
        bv.player.relocate(x, z)
        return { x: to.x, z: to.z, rise }
      },
      [k, back, rise] as const
    )
  const prompt = page.locator('.bv-prompt')
  const heap = await before('shovel', 1.2, 0.8)
  await heardWhere(page)
  await faceSpot(page, heap.x, heap.z, heap.rise)
  await expect(prompt).toHaveText(copy('prompts.shovel'))
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv!.inventory.shovel))
    .toBe(1)
  const grave = await before('grave', 4, 0.1)
  await heardWhere(page)
  await faceSpot(page, grave.x, grave.z, grave.rise)
  await expect(prompt).toHaveText(copy('prompts.exhume'))
  await page.keyboard.press('KeyE')
  // What came up is made a big deal of, and goes into the pack.
  await expect(page.locator('.bv-banner')).toContainText(copy('mechs.detail'))
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.entries(window.__bv!.inventory)
          .filter(([kind, n]) => kind.startsWith('mech-') && n > 0)
          .map(([kind]) => kind)
      )
    )
    .toHaveLength(1)
  // She gives up one a day.
  await page.keyboard.press('KeyE')
  await expect(page.locator('.bv-chat')).toContainText(copy('mechs.dug_today'))
})
