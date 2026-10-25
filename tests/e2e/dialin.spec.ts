import { expect, test } from '@playwright/test'
import { copy } from './copy.ts'
import { beginRaid, freshRaider, freshValley, signIn } from './fixtures.ts'
import { dialIn, phonePages } from './phone.ts'

// Bull Valley Dial-Up beside the 3D valley (sharedworld.ts rule 29): an
// account on foot at a desk and dialed in on a phone at once. The heavy
// Dial-Up specs, a whole game and a phone each, kept apart from
// dialup.spec.ts so they sort into another e2e shard (docs/testing.md).

const { open, phone } = phonePages()

test('with a raider on foot in the valley: the Citgo, Erwin, Moab and the chat', async ({
  browser,
}) => {
  // A whole game on a desk and a phone beside it.
  test.slow()
  const valley = freshValley('dial')
  const raider = freshRaider('Both')
  // The account stands at the spawn Citgo in 3D first.
  const desk = await open(browser)
  await beginRaid(desk, 0, { valley, raider })
  await expect
    .poll(() => desk.evaluate(() => window.__bv?.citgos.visited.length ?? 0))
    .toBeGreaterThan(0)
  const page = await phone(browser)
  await signIn(page, raider)
  await page.goto(`/?valley=${encodeURIComponent(valley)}`)
  await dialIn(page)

  // The Citgo: the one stood at, its shelves in the trade window, bought
  // off from the phone.
  await page.locator('.bv-dial-card[data-card="citgo"]').click()
  const cash = page.locator('.bv-dial-cash')
  const before = await cash.textContent()
  await page.locator('.bv-dial-citgo').first().click()
  const shop = page.locator('.bv-citgo')
  await expect(shop).toBeVisible()
  // What is picked turns in the table, on the shell's renderer.
  await expect(shop.locator('[data-bv="trade-view"]')).toBeVisible()
  await shop.locator('[data-bv="trade-go"]').click()
  await expect(cash).not.toHaveText(before ?? '')
  await expect(shop.locator('.bv-banner-kicker')).toHaveText(
    copy('shop.fanfare')
  )
  await shop.locator('[data-bv="trade-close"]').click()
  await page.getByRole('button', { name: copy('dialup.back') }).click()

  // Erwin barters and gives the rose from anywhere.
  await desk.evaluate(() => window.__bv?.grant('marlboro', 100))
  await page.locator('.bv-dial-card[data-card="erwin"]').click()
  const deal = page.locator('.bv-deal')
  await expect(deal).toBeVisible()
  await deal.locator('[data-bv="trade-even"]').click()
  await deal.locator('[data-bv="trade-go"]').click()
  await expect(deal.locator('[data-bv="trade-said"]')).toHaveText(
    copy('dealer.bought', { item: copy('items.lsd.label') })
  )
  await expect(deal.locator('.bv-banner')).toContainText(
    copy('dealer.fanfare') + copy('items.lsd.label')
  )
  await deal.locator('[data-bv="trade-tab-quest"]').click()
  await deal.locator('[data-bv="trade-quest-go"]').click()
  await expect(deal.locator('[data-bv="trade-said"]')).toHaveText(
    copy('quests.rose_given')
  )
  await deal.locator('[data-bv="trade-close"]').click()

  // Gron gives his first quest from anywhere, the same dialog as at the
  // bush.
  await page.locator('.bv-dial-card[data-card="gron"]').click()
  const gron = page.getByRole('dialog', {
    name: copy('outfits.gron'),
    exact: true,
  })
  await expect(gron).toContainText(copy('quests.berries_title'))
  const go = gron.locator('[data-bv="gron-quest-go"]')
  await expect(go).toHaveText(copy('quests.berries_accept'))
  await go.click()
  await expect(gron.locator('[data-bv="gron-said"]')).toHaveText(
    copy('quests.berries_given')
  )
  await expect(gron.locator('[data-bv="gron-quest-line"]')).toHaveText(
    copy('quests.berries_waiting')
  )
  await gron.locator('[data-bv="gron-close"]').click()
  await expect(gron).toHaveCount(0)

  // Moab offers the halo once the pack holds gold.
  await desk.evaluate(() => window.__bv?.grant('gold-bullion', 1))
  await page.locator('.bv-dial-card[data-card="moab"]').click()
  const moab = page.locator('.bv-moab')
  await expect(moab).toContainText(copy('moab.offer'))
  // His goods are no items: nothing turns.
  await expect(moab.locator('[data-bv="trade-view"]')).toBeHidden()
  await moab.locator('[data-bv="trade-even"]').click()
  await moab.locator('[data-bv="trade-go"]').click()
  await expect(moab.locator('[data-bv="trade-said"]')).toHaveText(
    copy('log.cosmetic_worn', {
      cosmetic: copy('cosmetics.flaming-halo.label'),
    })
  )
  await expect(moab.locator('.bv-banner')).toContainText(
    copy('moab.fanfare') + copy('cosmetics.flaming-halo.label')
  )
  // Your Character beside the trade: the 3D valley's turntable, loaded
  // with the phone's 3D, on the character worn.
  await moab
    .getByRole('tab', { name: copy('moab.your_character'), exact: true })
    .click()
  await expect(moab.locator('[data-bv="look-status"]')).toHaveText(
    copy('moab.character_now')
  )
  await expect(moab.locator('.bv-look-preview')).toBeVisible()
  await moab.locator('[data-bv="trade-close"]').click()

  // A line said on the phone reaches the valley.
  await page.locator('.bv-dial-tab[data-tab="social"]').click()
  // The crew has its place on the tab, as the party does.
  await expect(page.locator('.bv-dial-crew')).toContainText(
    copy('crew.heading')
  )
  await page.locator('.bv-dial-say-field').fill('hello from the phone')
  await page.getByRole('button', { name: copy('dialup.social.send') }).click()
  await expect(page.locator('.bv-dial-log')).toContainText(
    'hello from the phone'
  )
  await expect
    .poll(() =>
      desk.evaluate(() => window.__bv?.chat.map((line) => line.text) ?? [])
    )
    .toContain('hello from the phone')

  // A name on the online list opens the card, the halo on it.
  await page
    .locator(`.bv-dial-online-name[data-raider="${raider.username}"]`)
    .first()
    .click()
  const card = page.getByRole('dialog', { name: raider.username })
  await expect(card).toContainText(copy('cosmetics.flaming-halo.label'))
  await expect(card.locator('[data-bv="inspect-friend"]')).toBeHidden()
  await card.locator('[data-bv="inspect-close"]').click()
  await expect(card).toBeHidden()
})

test('a new name from the phone reaches the account in the 3D valley', async ({
  browser,
}) => {
  test.slow()
  const valley = freshValley('dial')
  const raider = freshRaider('Both')
  const desk = await open(browser)
  await beginRaid(desk, 0, { valley, raider })
  const page = await phone(browser)
  await signIn(page, raider)
  await page.goto(`/?valley=${encodeURIComponent(valley)}`)
  await dialIn(page)
  await page.locator('[data-bv="dial-name"]').click()
  const name = freshRaider('Renamed').username
  await page.locator('[data-bv="name-username"]').fill(name)
  const rename = page.locator('[data-bv="name-rename"]')
  await expect(rename).toBeEnabled()
  await rename.click()
  await page.locator('[data-bv="name-close"]').click()
  await expect(page.locator('.bv-dial-name')).toHaveText(name)
  // The 3D valley takes it on as its own, and never as another raider's.
  const said = () =>
    desk.evaluate(() => window.__bv?.chat.map((line) => line.text) ?? [])
  await expect.poll(said).toContain(copy('name.renamed', { name }))
  expect(await said()).not.toContain(
    copy('log.peer_renamed', { was: raider.username, name })
  )
})
