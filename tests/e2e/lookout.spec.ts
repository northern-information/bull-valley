import { CONFIG } from '../../src/config.ts'
import { copy } from './copy.ts'
import { beginRaid, expect, faceSpot, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// The lookout tower by the corn maze's gate: E at the ladder's foot puts a
// raider up on the deck, out of every shadow's reach, and E at its top puts
// them back down at the foot. The toolbox beside the foot hands out the
// torch, and a swing of it takes a bite out of a topiary (rule 39). Past
// the maze's far end, E at the drive-in's projector threads a reel for
// the whole valley (rule 41).

const onDeck = (page: Page) =>
  page.evaluate(() => {
    const bv = window.__bv
    const tower = bv?.world.lookout
    return tower ? tower.on(bv.player.pos.x, bv.player.pos.z) : null
  })

test('climbs the lookout and back down, and takes a torch to a topiary', async ({
  page,
}) => {
  await beginRaid(page)
  const prompt = page.locator('.bv-prompt')
  await page.evaluate(() => {
    const bv = window.__bv
    const foot = bv?.world.lookout?.foot
    if (bv && foot) bv.player.relocate(foot.x, foot.z, foot.yaw)
  })
  await expect(prompt).toHaveText(copy('prompts.climb_tower'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => onDeck(page)).toBe(true)

  await expect(prompt).toHaveText(copy('prompts.leave_tower'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => onDeck(page)).toBe(false)
  await expect(prompt).toHaveText(copy('prompts.climb_tower'))

  // Down at the foot, the toolbox beside it: looked at, E takes a torch,
  // which goes on the bar, and the toolbox offers no more.
  const box = await page.evaluate(() => window.__bv?.world.lookout?.toolbox)
  if (!box) throw new Error('no toolbox')
  // Out from the tower's face (lookout-local -x, the maze's own way).
  await page.evaluate(({ x, z }) => {
    const bv = window.__bv
    const yaw = bv?.world.mazePlace?.yaw ?? 0
    bv?.player.relocate(x - Math.cos(yaw) * 1.2, z - Math.sin(yaw) * 1.2, 0)
  }, box)
  await faceSpot(page, box.x, box.z, 0.3)
  await expect(prompt).toHaveText(copy('prompts.toolbox'))
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.torch))
    .toBe(1)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.hotbar.indexOf('torch')))
    .toBeGreaterThanOrEqual(0)
  const slot = await page.evaluate(
    () => window.__bv?.hotbar.indexOf('torch') ?? -1
  )
  await page.keyboard.press(`Digit${slot + 1}`)
  await expect.poll(() => page.evaluate(() => window.__bv?.held)).toBe('torch')

  // In a corridor by a topiary, facing it: a swing takes a bite out of it
  // for the whole valley.
  const which = await page.evaluate(() => {
    const bv = window.__bv
    const place = bv?.world.mazePlace
    const shown = bv?.world.topiaries?.shown() ?? []
    const index = shown.findIndex(Boolean)
    const stand = shown[index]
    if (!bv || !place || !stand) throw new Error('no topiary')
    const cos = Math.cos(place.yaw)
    const sin = Math.sin(place.yaw)
    const world = (x: number, z: number) => ({
      x: place.x + cos * x - sin * z,
      z: place.z + sin * x + cos * z,
    })
    const at = world(stand.spot.x, stand.spot.z + 1.8)
    const to = world(stand.spot.x, stand.spot.z)
    bv.player.relocate(at.x, at.z, Math.atan2(-(to.x - at.x), -(to.z - at.z)))
    bv.player.pitch = 0
    return index
  })
  await heardWhere(page)
  await page.evaluate(() => window.__bv?.useHand())
  await expect
    .poll(() =>
      page.evaluate((i) => window.__bv?.valley?.topiaries[i]?.hp, which)
    )
    .toBeLessThan(CONFIG.topiaries.hp)

  // The drive-in past the maze's far end: in the booth, facing the
  // projector, E opens the reels on the shelf, and threading one puts it
  // on the valley's screen.
  const projector = await page.evaluate(() => {
    const bv = window.__bv
    const at = bv?.world.driveIn?.projector
    const place = bv?.world.mazePlace
    if (!bv || !at || !place) throw new Error('no drive-in')
    // Back toward the booth's door (drive-in-local -z, the maze's own z).
    bv.player.relocate(
      at.x + Math.sin(place.yaw) * 1.4,
      at.z - Math.cos(place.yaw) * 1.4,
      0
    )
    return at
  })
  await faceSpot(page, projector.x, projector.z, 1.2)
  await expect(prompt).toHaveText(copy('prompts.projector'))
  await page.keyboard.press('KeyE')
  const booth = page.locator('.bv-films')
  await expect(booth).toBeVisible()
  await expect(booth.locator('[data-bv="films-now"]')).toHaveText(
    copy('drive_in.nothing_showing')
  )
  await booth
    .locator('[data-film="test-reel.mp4"] [data-bv="film-thread"]')
    .click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.valley?.reel?.film))
    .toBe('test-reel.mp4')
  await expect(booth.locator('[data-bv="films-now"]')).toHaveText('test-reel')
  await expect(page.locator('.bv-chat')).toContainText(
    copy('log.threaded', { film: 'test-reel' })
  )
  await page.keyboard.press('KeyE')
  await expect(booth).toBeHidden()
  // Standing on its lot wrote its page in the Book of Shadows.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.book.includes('drive-in')))
    .toBe(true)
})
