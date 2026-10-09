import { test as base } from '@playwright/test'
import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  freshRaider,
  freshValley,
  watchErrors,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// Two raiders in one valley, side by side: one types /wave, and the other
// sees their figure take the pose and gets a quiet line in the log; the
// emote ends on its own, and /sit holds until the sitter moves.

const say = async (page: Page, text: string) => {
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

const peerPose = (page: Page) =>
  page.evaluate(() => window.__bv?.net.peers()[0]?.next?.pose ?? null)

const log = (page: Page) =>
  page.getByRole('log', { name: copy('hud.chat_log_label') })

base(
  'an emote is seen by the raider beside you',
  { tag: '@valley' },
  async ({ browser }) => {
    base.slow()
    const valley = freshValley('emotes')
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const a = await contextA.newPage()
    const b = await contextB.newPage()
    const errorsA = watchErrors(a)
    const errorsB = watchErrors(b)
    const [able] = await Promise.all([
      beginRaid(a, 0, { valley, raider: freshRaider('Able') }),
      beginRaid(b, 1, { valley, raider: freshRaider('Baker') }),
    ])
    await expect
      .poll(() => b.evaluate(() => window.__bv?.net.peers().length))
      .toBe(1)
    // Side by side, a few metres apart, so B is near enough to be told.
    await b.evaluate(() => {
      const bv = window.__bv!
      const { x, z } = bv.player.pos
      bv.player.relocate(x + 3, z, bv.player.yaw)
    })

    await say(a, '/wave')
    await expect(log(a)).toContainText(copy('emotes.wave_self'))
    await expect
      .poll(() => a.evaluate(() => window.__bv?.sent?.pose))
      .toBe('wave')
    await expect.poll(() => peerPose(b)).toBe('wave')
    await expect(log(b)).toContainText(
      copy('emotes.wave_seen', { name: able.username })
    )
    // A wave holds three seconds, then A stands again.
    await expect.poll(() => peerPose(b), { timeout: 15_000 }).toBe('stand')

    // /sit holds until A moves.
    await say(a, '/sit')
    await expect.poll(() => peerPose(b)).toBe('sit')
    await a.waitForTimeout(4000)
    expect(await peerPose(b)).toBe('sit')
    await a.keyboard.down('KeyW')
    await expect.poll(() => peerPose(b)).not.toBe('sit')
    await a.keyboard.up('KeyW')

    // /emotes lists them; a name it does not know says so.
    await say(a, '/emotes')
    await expect(log(a)).toContainText('/kneel')
    await say(a, '/moonwalk')
    await expect(log(a)).toContainText(copy('chat.unknown_command'))

    expect(errorsA).toEqual([])
    expect(errorsB).toEqual([])
    await contextA.close()
    await contextB.close()
  }
)
