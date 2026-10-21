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

// Crews (sharedworld.ts rule 35): started for their price, an invite
// taken up by the tag, the tag worn on every member's name tag, /c to
// the crew alone, and a leader's leaving handing it on.

const typeLine = async (page: Page, text: string) => {
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

const log = (page: Page) =>
  page.getByRole('log', { name: copy('hud.chat_log_label') })

const cash = (page: Page) => page.evaluate(() => window.__bv?.cash ?? 0)

// The crew tag a peer named `name` wears, as this page sees them.
const tagOf = (page: Page, name: string) =>
  page.evaluate(
    (n) => window.__bv?.net.peers().find((p) => p.name === n)?.crew ?? null,
    name
  )

base(
  'a crew is started, joined, worn, heard and handed on',
  { tag: '@valley' },
  async ({ browser }) => {
    base.slow()
    const valley = freshValley('crew')
    const pages = await Promise.all(
      [0, 1, 2].map(async () => (await browser.newContext()).newPage())
    )
    const [a, b, c] = pages
    const errors = pages.map(watchErrors)
    const tag = `C${Math.random().toString(36).slice(2, 5)}`.toUpperCase()
    const [able, baker] = await Promise.all([
      beginRaid(a, 0, { valley, raider: freshRaider('Able') }),
      beginRaid(b, 1, { valley, raider: freshRaider('Baker') }),
      beginRaid(c, 2, { valley, raider: freshRaider('Char') }),
    ])
    await expect
      .poll(() => a.evaluate(() => window.__bv?.valley?.members.length))
      .toBe(3)

    // Short of the price, then started for it.
    await typeLine(a, `/crew create ${tag} Crew ${tag}`)
    await expect(log(a)).toContainText(copy('crew.short', { cost: '$100.00' }))
    await a.evaluate(() => window.__bv?.earn(100_00))
    await expect.poll(() => cash(a)).toBeGreaterThanOrEqual(100_00)
    const before = await cash(a)
    await typeLine(a, `/crew create ${tag} Crew ${tag}`)
    await expect(log(a)).toContainText(
      copy('crew.created', { tag, crew: `Crew ${tag}` })
    )
    await expect.poll(() => cash(a)).toBe(before - 100_00)
    await expect.poll(() => tagOf(c, able.username)).toBe(tag)

    // Invited, Baker joins by the tag and wears it.
    await typeLine(a, `/crew invite ${baker.username}`)
    await expect(log(b)).toContainText(
      copy('crew.news_invited', {
        name: able.username,
        tag,
        crew: `Crew ${tag}`,
      })
    )
    await typeLine(b, `/crew join ${tag.toLowerCase()}`)
    await expect(log(a)).toContainText(
      copy('crew.news_joined', { name: baker.username })
    )
    await expect.poll(() => tagOf(c, baker.username)).toBe(tag)

    // The crew hears its line; Char does not.
    await typeLine(b, '/c meet at the keep')
    await expect(log(a)).toContainText('meet at the keep')
    await typeLine(b, 'said to everyone')
    await expect(log(c)).toContainText('said to everyone')
    await expect(log(c)).not.toContainText('meet at the keep')

    // Able leaves: Baker leads, and Able wears no tag.
    await typeLine(a, '/crew leave')
    await expect(log(b)).toContainText(copy('crew.you_lead'))
    await expect.poll(() => tagOf(c, able.username)).toBeNull()
    await expect
      .poll(() => b.evaluate(() => window.__bv?.crew.crew?.leader))
      .toBe(baker.username)

    for (const collected of errors) expect(collected).toEqual([])
  }
)
