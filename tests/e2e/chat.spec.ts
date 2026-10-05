import { test as base } from '@playwright/test'
import { beginRaid, expect, freshValley, watchErrors } from './fixtures.ts'
import type { Page } from '@playwright/test'

// Two browsers in one valley: Enter opens the chat field, the keys type
// instead of walking, Enter sends, and both logs show the line under the
// sender's name.

const lines = (page: Page) =>
  page.evaluate(() => window.__bv?.chat.map((l) => l.text) ?? [])

base(
  'a chat line reaches everyone in the valley',
  { tag: '@valley' },
  async ({ browser }) => {
    base.slow()
    const valley = freshValley('chat')
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const a = await contextA.newPage()
    const b = await contextB.newPage()
    const errorsA = watchErrors(a)
    const errorsB = watchErrors(b)

    await Promise.all([
      beginRaid(a, 0, { valley, name: 'Able' }),
      beginRaid(b, 1, { valley, name: 'Baker' }),
    ])
    await expect
      .poll(() => b.evaluate(() => window.__bv?.net.peers().length))
      .toBe(1)

    const input = a.getByRole('textbox', { name: 'Say to the valley' })
    await expect(input).toBeHidden()
    await a.keyboard.press('Enter')
    await expect(input).toBeVisible()
    await expect(input).toBeFocused()

    // W types a letter; it does not walk.
    const before = await a.evaluate(() => {
      const { x, z } = window.__bv!.player.pos
      return { x, z }
    })
    await a.keyboard.type('wwww cabbages by the keep')
    await a.waitForTimeout(300)
    const after = await a.evaluate(() => {
      const { x, z } = window.__bv!.player.pos
      return { x, z }
    })
    expect(after).toEqual(before)
    expect(await a.evaluate(() => window.__bv?.player.locked)).toBe(true)

    await a.keyboard.press('Enter')
    await expect(input).toBeHidden()
    await expect.poll(() => lines(b)).toEqual(['wwww cabbages by the keep'])
    await expect.poll(() => lines(a)).toEqual(['wwww cabbages by the keep'])
    await expect(b.getByRole('log', { name: 'Chat' })).toContainText(
      'Able: wwww cabbages by the keep'
    )

    expect(errorsA).toEqual([])
    expect(errorsB).toEqual([])
    await contextA.close()
    await contextB.close()
  }
)
