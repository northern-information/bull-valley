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

// Inspecting another raider (inspect.ts): E on one standing in front, or
// /inspect name, opens their card, and its friend button asks them.

const typeLine = async (page: Page, text: string) => {
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

// A closed dialog takes the pointer back before the keys play again.
const closeCard = async (page: Page) => {
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)
}

const log = (page: Page) =>
  page.getByRole('log', { name: copy('hud.chat_log_label') })

base(
  'E on a raider opens their card, and it asks them to be friends',
  { tag: '@valley' },
  async ({ browser }) => {
    base.slow()
    const valley = freshValley('inspect')
    const a = await (await browser.newContext()).newPage()
    const b = await (await browser.newContext()).newPage()
    const errorsA = watchErrors(a)
    const errorsB = watchErrors(b)
    const [able, baker] = await Promise.all([
      beginRaid(a, 0, { valley, raider: freshRaider('Able') }),
      beginRaid(b, 1, { valley, raider: freshRaider('Baker') }),
    ])
    await expect
      .poll(() => a.evaluate(() => window.__bv?.valley?.members.length))
      .toBe(2)
    // Baker two metres in front of Able.
    await standInTheOpen(a)
    await standInTheOpen(b, 0, -2)
    await expect(
      a.getByText(copy('prompts.inspect', { name: baker.username }))
    ).toBeVisible()

    await a.keyboard.press('KeyE')
    const card = a.getByRole('dialog', { name: baker.username })
    await expect(card).toBeVisible()
    await expect(card).toContainText(copy('inspect.online'))
    await expect(card).toContainText(copy('inspect.level'))
    await expect(card).toContainText(copy('book.title'))
    await card.getByRole('button', { name: copy('inspect.add_friend') }).click()
    await expect(log(b)).toContainText(
      copy('friends.news_asked', { name: able.username })
    )
    await expect(
      card.getByRole('button', { name: copy('inspect.asked') })
    ).toBeDisabled()
    await closeCard(a)
    await expect(card).toBeHidden()

    // Baker looks Able up by name, and accepts from the card.
    await typeLine(b, `/inspect ${able.username.toLowerCase()}`)
    const back = b.getByRole('dialog', { name: able.username })
    await expect(back).toBeVisible()
    await back.getByRole('button', { name: copy('inspect.accept') }).click()
    await expect(log(a)).toContainText(
      copy('friends.news_accepted', { name: baker.username })
    )
    await expect(
      back.getByRole('button', { name: copy('inspect.friends') })
    ).toBeDisabled()
    await closeCard(b)

    // No one by that name: the log says so.
    await typeLine(b, '/inspect nobodyhere')
    await expect(log(b)).toContainText(
      copy('friends.unknown', { name: 'nobodyhere' })
    )

    expect(errorsA).toEqual([])
    expect(errorsB).toEqual([])
  }
)
