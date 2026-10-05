import { copy } from './copy.ts'
import { beginRaid, expect, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Matthew Marx and David Carlsten answer E when you look at them, each with
// his next line in the chat log: Marx a stanza of Burns, Carlsten small
// talk.

type Who = 'marx' | 'carlsten'

// Stands the player a stride or two from him and looks at his neck. Marx is
// faced from beside the tailgate; Carlsten from the room side of the
// counter, the way he faces.
async function lookAt(page: Page, who: Who): Promise<void> {
  const place = (who: Who) => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    const { world, truck, player } = bv
    const station = world.fuelPoints.indexOf(world.spawnStation!)
    const aim =
      who === 'marx' ? truck.driverAim() : world.shelves.clerkAim(station)
    if (!aim) throw new Error(`no ${who} to look at`)
    let dx: number
    let dz: number
    if (who === 'marx') {
      // Beside him rather than behind, so the truck is in boarding range.
      dx = -(aim[2] - truck.z)
      dz = aim[0] - truck.x
    } else {
      const facing = world.shelves.clerk.getWorldDirection(
        bv.camera.position.clone()
      )
      dx = facing.x
      dz = facing.z
    }
    const d = Math.hypot(dx, dz)
    player.relocate(aim[0] + (dx / d) * 1.5, aim[2] + (dz / d) * 1.5)
  }
  const aimCamera = (who: Who) => {
    const bv = window.__bv!
    const { world, truck, player, camera } = bv
    const station = world.fuelPoints.indexOf(world.spawnStation!)
    const aim =
      who === 'marx' ? truck.driverAim() : world.shelves.clerkAim(station)
    if (!aim) throw new Error(`no ${who} to look at`)
    const dx = aim[0] - camera.position.x
    const dy = aim[1] - camera.position.y
    const dz = aim[2] - camera.position.z
    // The camera looks down -Z, turned by yaw, then tipped by pitch.
    player.yaw = Math.atan2(-dx, -dz)
    player.pitch = Math.atan2(dy, Math.hypot(dx, dz))
  }
  await page.evaluate(place, who)
  // A frame puts the camera at the new eye before the aim is worked out.
  await page.waitForTimeout(200)
  await page.evaluate(aimCamera, who)
}

const lastLine = (page: Page) =>
  page
    .locator('.bv-chat-log p')
    .last()
    .evaluate((p) => p.textContent)

test('Marx recites a stanza at a time, and E elsewhere still boards', async ({
  page,
}) => {
  await beginRaid(page)
  await lookAt(page, 'marx')
  const name = copy('outfits.marx')
  await expect(page.locator('.bv-prompt')).toHaveText(
    copy('prompts.speak', { name })
  )
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => lastLine(page))
    .toBe(`${name}: ${copy('marx.stanza_1')}`)
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => lastLine(page))
    .toBe(`${name}: ${copy('marx.stanza_2')}`)

  // Looking away from him, at the same spot, E boards the truck.
  await page.evaluate(() => {
    window.__bv!.player.pitch = 1.2
  })
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.board'))
})

test('Carlsten cycles through his lines', async ({ page }) => {
  await beginRaid(page)
  await lookAt(page, 'carlsten')
  const name = copy('outfits.carlsten')
  await expect(page.locator('.bv-prompt')).toHaveText(
    copy('prompts.speak', { name })
  )
  for (const key of ['says_1', 'says_2', 'says_3', 'says_1']) {
    await page.keyboard.press('KeyE')
    await expect
      .poll(() => lastLine(page))
      .toBe(`${name}: ${copy(`carlsten.${key}`)}`)
  }
})
