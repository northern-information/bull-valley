import { copy } from './copy.ts'
import { beginRaid, expect, test } from './fixtures.ts'

// The portal at the heart of the corn maze: walk into it and you come out
// on the trail outside the gate, facing it, with a line in the chat log.

test('the portal at the heart of the maze puts you back at the gate', async ({
  page,
}) => {
  await beginRaid(page)
  const exit = await page.evaluate(() => {
    const bv = window.__bv
    const portal = bv?.world.portal
    if (!bv || !portal) throw new Error('no portal')
    // A stride short of it, then a step into it.
    bv.player.relocate(portal.at.x + 0.3, portal.at.z, bv.player.yaw)
    return portal.exit
  })
  // How far the player stands from the exit.
  await expect
    .poll(() =>
      page.evaluate(({ x, z }) => {
        const p = window.__bv?.player.pos
        return p ? Math.hypot(p.x - x, p.z - z) : Infinity
      }, exit)
    )
    .toBeLessThan(0.5)
  expect(await page.evaluate(() => window.__bv?.player.yaw)).toBeCloseTo(
    exit.yaw
  )
  // Said in the log; another line (a Citgo found on the way out) may
  // follow it, so it is looked for, not taken as the last.
  await expect
    .poll(() =>
      page.evaluate(() => window.__bv?.chat.map((line) => line.text) ?? [])
    )
    .toContain(copy('log.portal'))
})
