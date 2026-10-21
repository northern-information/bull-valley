import { test as base } from '@playwright/test'
import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  freshRaider,
  freshValley,
  standInTheOpen,
  watchErrors,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// Parties (sharedworld.ts rule 34): /invite asks, inviting back joins,
// /p speaks to the party alone, its members show on the map, and /leave
// leaves.

const typeLine = async (page: Page, text: string) => {
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

const log = (page: Page) =>
  page.getByRole('log', { name: copy('hud.chat_log_label') })

const members = (page: Page) =>
  page.evaluate(() => window.__bv?.party.members.map((m) => m.name) ?? [])

base(
  'two raiders make a party, speak in it, find each other on the map, and part',
  { tag: '@valley' },
  async ({ browser }) => {
    base.slow()
    const valley = freshValley('party')
    const pages = await Promise.all(
      [0, 1, 2].map(async () => (await browser.newContext()).newPage())
    )
    const [a, b, c] = pages
    const errors = pages.map(watchErrors)
    const [able, baker] = await Promise.all([
      beginRaid(a, 0, { valley, raider: freshRaider('Able') }),
      beginRaid(b, 1, { valley, raider: freshRaider('Baker') }),
      beginRaid(c, 2, { valley, raider: freshRaider('Char') }),
    ])
    await expect
      .poll(() => a.evaluate(() => window.__bv?.valley?.members.length))
      .toBe(3)

    await typeLine(a, `/invite ${baker.username}`)
    await expect(log(a)).toContainText(
      copy('party.invited', { name: baker.username })
    )
    await expect(log(b)).toContainText(
      copy('party.news_invited', { name: able.username })
    )
    await typeLine(b, `/invite ${able.username}`)
    await expect(log(a)).toContainText(
      copy('party.news_joined', { name: baker.username })
    )
    await expect(log(b)).toContainText(copy('party.you_joined'))
    await expect.poll(() => members(a)).toEqual([able.username, baker.username])

    // A line to the party reaches Baker, and not Char.
    await typeLine(a, '/p meet at the maze')
    await expect(log(b)).toContainText('meet at the maze')
    await typeLine(a, 'said to everyone')
    await expect(log(c)).toContainText('said to everyone')
    await expect(log(c)).not.toContainText('meet at the maze')

    // Baker on Able's map.
    await standInTheOpen(a)
    await standInTheOpen(b, 30, 30)
    await a.keyboard.press('KeyM')
    await expect(a.locator('canvas[data-party]')).toHaveAttribute(
      'data-party',
      baker.username
    )
    await a.keyboard.press('KeyM')
    await expect
      .poll(() => a.evaluate(() => window.__bv?.player.locked))
      .toBe(true)

    await typeLine(b, '/leave')
    await expect(log(b)).toContainText(copy('party.left'))
    await expect(log(a)).toContainText(
      copy('party.news_left', { name: baker.username })
    )
    await expect.poll(() => members(a)).toEqual([])

    for (const collected of errors) expect(collected).toEqual([])
  }
)
