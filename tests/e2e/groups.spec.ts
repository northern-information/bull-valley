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

// Parties and crews, the two ways raiders band together, on three raiders
// in one valley: Able and Baker band, and Char stands outside to show what
// the band says stays in it. Booting three valleys is slow on CI, so the
// two share one boot, in order, each its own test so a failure names
// which one broke.
//
// Parties (sharedworld.ts rule 34): /invite asks, inviting back joins,
// /p speaks to the party alone, its members show on the map, and /leave
// leaves.
//
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

const members = (page: Page) =>
  page.evaluate(() => window.__bv?.party.members.map((m) => m.name) ?? [])

const cash = (page: Page) => page.evaluate(() => window.__bv?.cash ?? 0)

// The crew tag a peer named `name` wears, as this page sees them.
const tagOf = (page: Page, name: string) =>
  page.evaluate(
    (n) => window.__bv?.net.peers().find((p) => p.name === n)?.crew ?? null,
    name
  )

base.describe('parties and crews', { tag: '@valley' }, () => {
  base.describe.configure({ mode: 'serial' })

  let a: Page
  let b: Page
  let c: Page
  let able: { username: string }
  let baker: { username: string }
  let errors: string[][] = []

  base.beforeAll(async ({ browser }) => {
    // Three valleys to boot, which on CI takes longer than one test.
    base.setTimeout(base.info().timeout * 3)
    const valley = freshValley('groups')
    const pages = await Promise.all(
      [0, 1, 2].map(async () => (await browser.newContext()).newPage())
    )
    ;[a, b, c] = pages
    errors = pages.map(watchErrors)
    ;[able, baker] = await Promise.all([
      beginRaid(a, 0, { valley, raider: freshRaider('Able') }),
      beginRaid(b, 1, { valley, raider: freshRaider('Baker') }),
      beginRaid(c, 2, { valley, raider: freshRaider('Char') }),
    ])
    await expect
      .poll(() => a.evaluate(() => window.__bv?.valley?.members.length))
      .toBe(3)
  })

  base.afterEach(() => {
    for (const collected of errors) expect(collected).toEqual([])
  })

  base.afterAll(async () => {
    for (const page of [a, b, c]) await page?.context().close()
  })

  base(
    'two raiders make a party, speak in it, find each other on the map, and part',
    async () => {
      base.slow()
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
      await expect
        .poll(() => members(a))
        .toEqual([able.username, baker.username])

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
    }
  )

  base('a crew is started, joined, worn, heard and handed on', async () => {
    base.slow()
    const tag = `C${Math.random().toString(36).slice(2, 5)}`.toUpperCase()

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
    await typeLine(b, 'said to the valley')
    await expect(log(c)).toContainText('said to the valley')
    await expect(log(c)).not.toContainText('meet at the keep')

    // Able leaves: Baker leads, and Able wears no tag.
    await typeLine(a, '/crew leave')
    await expect(log(b)).toContainText(copy('crew.you_lead'))
    await expect.poll(() => tagOf(c, able.username)).toBeNull()
    await expect
      .poll(() => b.evaluate(() => window.__bv?.crew.crew?.leader))
      .toBe(baker.username)
  })
})
