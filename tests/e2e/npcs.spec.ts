import { copy } from './copy.ts'
import { beginRaid, expect, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Walk up to Matthew Marx or David Carlsten and he glows, with no prompt;
// E has him say his next line in the chat log: Marx a stanza of Burns,
// Carlsten small talk.

type Who = 'marx' | 'carlsten'

// Stands the player a stride from him: beside Marx, square to the truck,
// so the truck is in boarding range too; in front of Carlsten, the way he
// faces across the counter.
async function approach(page: Page, who: Who): Promise<void> {
  await page.evaluate((who: Who) => {
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
    // Looking up, past the shelves, so no facing is in view.
    player.pitch = 1.2
    player.relocate(at.x + (dx / d) * 1.4, at.z + (dz / d) * 1.4)
  }, who)
}

const glowsOn = (page: Page, who: Who) =>
  page.evaluate((who: Who) => {
    const bv = window.__bv!
    const body = who === 'marx' ? bv.truck.driver.group : bv.world.shelves.clerk
    return bv.glow === body
  }, who)

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
  await expect
    .poll(() => lastLine(page))
    .toBe(`${name}: ${copy('marx.stanza_1')}`)
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

test('Carlsten glows when you come near and cycles through his lines', async ({
  page,
}) => {
  await beginRaid(page)
  await approach(page, 'carlsten')
  await expect.poll(() => glowsOn(page, 'carlsten')).toBe(true)
  await expect(page.locator('.bv-prompt')).toBeHidden()
  const name = copy('outfits.carlsten')
  for (const key of ['says_1', 'says_2', 'says_3', 'says_1']) {
    await page.keyboard.press('KeyE')
    await expect
      .poll(() => lastLine(page))
      .toBe(`${name}: ${copy(`carlsten.${key}`)}`)
  }
})
