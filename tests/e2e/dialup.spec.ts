import { devices, expect, test } from '@playwright/test'
import { CONFIG } from '../../src/config.ts'
import { copy } from './copy.ts'
import {
  beginRaid,
  freshRaider,
  freshValley,
  heardWhere,
  signIn,
  watchErrors,
} from './fixtures.ts'
import type { Browser, Page } from '@playwright/test'

// Bull Valley Dial-Up (sharedworld.ts rule 29): a phone opens on the
// modem, dials the valley, and tends the account from wherever it is.

// Every page a spec opens, phone or desk, fails it on a console error or
// an uncaught page error, as the `page` fixture does for the other specs.
let errors: string[][] = []
test.beforeEach(() => {
  errors = []
})
test.afterEach(() => {
  expect(errors.flat()).toEqual([])
})

async function open(
  browser: Browser,
  options?: Parameters<Browser['newContext']>[0]
): Promise<Page> {
  const page = await (await browser.newContext(options)).newPage()
  errors.push(watchErrors(page))
  return page
}

// A phone: Chromium's own mobile emulation, so the full Chromium the
// other specs drive does the work.
function phone(browser: Browser): Promise<Page> {
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 5']
  return open(browser, pixel)
}

// Tap through the modem: one tap dials, a second skips the handshake.
async function dialIn(page: Page): Promise<void> {
  const modem = page.locator('.bv-modem')
  await expect(modem).toContainText(copy('dialup.tap'))
  await modem.click()
  await modem.click()
  await expect(page.locator('.bv-dial')).toBeVisible({ timeout: 15_000 })
}

test('a phone dials up instead of walking the valley', async ({ browser }) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await expect(page).toHaveTitle(copy('dialup.title'))
  await dialIn(page)
  await expect(page.locator('.bv-modem')).toHaveCount(0)
  // The raider on the lobby, in their character, with their record.
  const raider = page.locator('.bv-dial-raider')
  await expect(raider.locator('.bv-dial-portrait-canvas')).toBeVisible()
  await expect(raider.locator('.bv-dial-stat[data-stat="task"]')).toContainText(
    copy('dialup.raider.task')
  )
  // The way back to the valley.
  await expect(page.locator('.bv-dial-switch')).toHaveAttribute(
    'href',
    /valley3d/
  )
})

test('a phone no one is signed in on gets a login', async ({ browser }) => {
  const page = await phone(browser)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await page.locator('.bv-modem').click()
  await expect(page.locator('.bv-modem-screen')).toContainText(
    copy('dialup.modem.login'),
    { timeout: 15_000 }
  )
  await expect(page.locator('.bv-account')).toBeVisible({ timeout: 15_000 })
})

test('the pack only uses, the locker gives back, and both fit the phone', async ({
  browser,
}) => {
  test.slow()
  const valley = freshValley('dial')
  const raider = freshRaider('Both')
  // A joint stowed at the locker in the 3D valley, for the phone to take.
  const desk = await open(browser)
  await beginRaid(desk, 0, { valley, raider })
  await desk.evaluate(() => {
    const bv = window.__bv
    const station = bv?.world.spawnStation
    if (!bv || !station) throw new Error('no spawn station')
    const spot = bv.world.lockers[bv.world.fuelPoints.indexOf(station)]
    bv.player.relocate(spot.x, spot.z, 0)
  })
  await heardWhere(desk)
  await desk.keyboard.press('KeyE')
  await expect
    .poll(() => desk.evaluate(() => window.__bv?.lockerOpen))
    .toBe(true)
  await desk.locator('.bv-bag-cell[data-kind="joints"]').hover()
  await desk.keyboard.press('KeyF')
  await expect
    .poll(() => desk.evaluate(() => window.__bv?.stash.joints))
    .toBe(1)

  const page = await phone(browser)
  await signIn(page, raider)
  await page.goto(`/?valley=${encodeURIComponent(valley)}`)
  await dialIn(page)
  await page.locator('.bv-dial-tab[data-tab="pack"]').click()
  const pack = page.locator('.bv-dial-item[data-kind="marlboro"]')
  await pack.locator('summary').click()
  // Each row shows its item in 3D: a still, and opened, a turntable.
  await expect(pack.locator('.bv-dial-item-icon')).toHaveAttribute(
    'src',
    /^data:image\/png/
  )
  await expect(pack.locator('.bv-dial-item-spin')).toBeVisible()
  // Opened, it shows its stats as the 3D pack card does, and the one thing
  // a phone does with it: Use.
  await expect(pack.locator('.bv-item-stats')).toContainText(
    copy('stats.cigarette')
  )
  await expect(pack.locator('.bv-dial-btn')).toHaveText([
    copy('dialup.pack.use'),
  ])
  // The locker, from the lobby, wherever the raider is: what is on the
  // raider apart from what the locker holds, which comes back out.
  await page.locator('.bv-dial-tab[data-tab="lobby"]').click()
  await page.locator('.bv-dial-card[data-card="locker"]').click()
  // The kit every raider carries (sharedworld.ts rule 38) is on them.
  const keys = page.locator('.bv-dial-sheet [data-section="keys"]')
  await expect(keys).toContainText(copy('items.flashlight.label'))
  await expect(keys).toContainText(copy('items.citgo-phone.label'))
  const stowed = page.locator(
    '.bv-dial-sheet [data-section="locker"] .bv-dial-item[data-kind="joints"]'
  )
  await stowed.locator('summary').click()
  await stowed
    .getByRole('button', { name: copy('dialup.pack.take_all') })
    .click()
  await expect(stowed).toHaveCount(0)
  await expect(
    page.locator(
      '.bv-dial-sheet [data-section="pack"] .bv-dial-item[data-kind="joints"]'
    )
  ).toBeVisible()
  await page.getByRole('button', { name: copy('dialup.back') }).click()
  // The pack, with every row open, fits the phone's width: nothing
  // scrolls the page sideways.
  await page.locator('.bv-dial-tab[data-tab="pack"]').click()
  for (const row of await page.locator('.bv-dial-item summary').all()) {
    await row.click()
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true)
})

test('uses an item from the phone, having seen what it would do', async ({
  browser,
}) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  await page.locator('.bv-dial-tab[data-tab="pack"]').click()
  const joint = page.locator('.bv-dial-item[data-kind="joints"]')
  await joint.locator('summary').click()
  // Before it is used: what it does to the wards, said as the valley would.
  await expect(joint.locator('.bv-dial-impact')).toContainText(
    copy('wards.high')
  )
  await joint.getByRole('button', { name: copy('dialup.pack.use') }).click()
  // Out of the pack, and the high it brings shows at the top.
  await expect(joint).toHaveCount(0)
  await expect(page.locator('.bv-dial-top [data-ward="high"]')).toBeVisible()
})

test('opens the Cabbage Stand from anywhere', async ({ browser }) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  await page.locator('.bv-dial-card[data-card="stand"]').click()
  await expect(page.locator('.bv-stand')).toBeVisible()
  await expect(page.locator('#bv-stand-title')).toHaveText(copy('stand.title'))
})

test('opens the Recycling Center from anywhere, its level on the card', async ({
  browser,
}) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  const card = page.locator('.bv-dial-card[data-card="recycling"]')
  await expect(card).toContainText(
    copy('dialup.lobby.recycling_level', { level: 0 })
  )
  await card.click()
  await expect(page.locator('.bv-recycle')).toBeVisible()
  await expect(page.locator('#bv-recycle-title')).toHaveText(
    copy('recycling.title')
  )
})

test('fishes the firefly pond from anywhere, the raider on its shore', async ({
  browser,
}) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  const card = page.locator('.bv-dial-card[data-card="fishing"]')
  await expect(card).toContainText(
    copy('dialup.lobby.fishing_skill', {
      skill: '0.0',
      caught: 0,
      limit: CONFIG.fishing.perDay,
    })
  )
  await card.click()
  // The pond in its sheet: the raider on the shore, drawn on the phone.
  const sheet = page.locator('.bv-dial-fish')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.bv-dial-pond-canvas')).toBeVisible()
  // Dialed in, the rod comes out of the box from wherever the phone is,
  // and the bank is dug; then a cast puts a line in the water.
  await sheet.locator('[data-fish="rod"]').click()
  await expect(sheet.locator('.bv-dial-fish-angler')).toContainText(
    copy('items.fishing-rod.label')
  )
  await sheet.locator('[data-fish="dig"]').click()
  const cast = sheet.locator('[data-fish="cast-nightcrawlers"]')
  await expect(cast).toBeEnabled()
  await cast.click()
  await expect(sheet.locator('.bv-dial-pond-call')).toHaveText(
    copy('fishing.waiting')
  )
  await expect(sheet.locator('[data-fish="give-up"]')).toBeVisible()
})

test('a raider in the valley hears a phone dial in', async ({ browser }) => {
  const valley = freshValley('dial')
  const desk = await open(browser)
  await beginRaid(desk, 0, { valley })
  const page = await phone(browser)
  const raider = await signIn(page, freshRaider('Phone'))
  await page.goto(`/?valley=${encodeURIComponent(valley)}`)
  await dialIn(page)
  await expect
    .poll(() =>
      desk.evaluate(() => window.__bv?.chat.map((line) => line.text) ?? [])
    )
    .toContain(copy('log.peer_dialed', { name: raider.username }))
})

test('reads the Book of Shadows, a page at a time', async ({ browser }) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  await page.locator('.bv-dial-tab[data-tab="book"]').click()
  await page.locator('.bv-dial-chip[data-chapter="shadows"]').click()
  // Nothing found yet: every page dark.
  const entry = page.locator('.bv-dial-entry[data-entry="shadowman"]')
  await expect(entry).toHaveText(copy('book.unknown'))
  await entry.click()
  await expect(page.locator('.bv-dial-page-lore')).toHaveText(
    copy('book.unknown_lore')
  )
  await expect(page.locator('.bv-dial-page-portrait')).toBeVisible()
})

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

  // Moab offers the halo once the pack holds gold.
  await desk.evaluate(() => window.__bv?.grant('gold-bullion', 1))
  await page.locator('.bv-dial-card[data-card="moab"]').click()
  const moab = page.locator('.bv-moab')
  await expect(moab).toContainText(copy('moab.offer'))
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
  await moab.locator('[data-bv="trade-close"]').click()

  // A line said on the phone reaches the valley.
  await page.locator('.bv-dial-tab[data-tab="social"]').click()
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

test('a Citgo never stood at has no shelves on the phone', async ({
  browser,
}) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  await page.locator('.bv-dial-card[data-card="citgo"]').click()
  await expect(page.locator('.bv-dial-sheet')).toContainText(
    copy('dialup.citgo.none_visited')
  )
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
  await page.locator('.bv-dial-card[data-card="gron"]').click()
  const name = freshRaider('Renamed').username
  await page.locator('[data-bv="gron-username"]').fill(name)
  const rename = page.locator('[data-bv="gron-rename"]')
  await expect(rename).toBeEnabled()
  await rename.click()
  await page.locator('[data-bv="gron-close"]').click()
  await expect(page.locator('.bv-dial-name')).toHaveText(name)
  // The 3D valley takes it on as its own, and never as another raider's.
  const said = () =>
    desk.evaluate(() => window.__bv?.chat.map((line) => line.text) ?? [])
  await expect.poll(said).toContain(copy('gron.renamed', { name }))
  expect(await said()).not.toContain(
    copy('log.peer_renamed', { was: raider.username, name })
  )
})

test('signs out from the phone, back to the modem and a login', async ({
  browser,
}) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  await page.locator('[data-bv="dial-sign-out"]').click()
  const modem = page.locator('.bv-modem')
  await expect(modem).toContainText(copy('dialup.tap'))
  await modem.click()
  await expect(page.locator('.bv-modem-screen')).toContainText(
    copy('dialup.modem.login'),
    { timeout: 15_000 }
  )
})

test('sends a run out on an expedition, one at a time', async ({ browser }) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  await page.locator('.bv-dial-tab[data-tab="expeditions"]').click()
  // The Undercroft waits on a level a new raider has not reached.
  await expect(
    page.locator(
      '.bv-dial-expedition[data-expedition="undercroft"] .bv-dial-btn'
    )
  ).toBeDisabled()
  await page
    .locator('.bv-dial-expedition[data-expedition="ride"] .bv-dial-btn')
    .click()
  const out = page.locator('.bv-dial-run[data-run="ride"]')
  await expect(out).toBeVisible()
  await expect(
    out.getByRole('button', { name: copy('dialup.expeditions.claim') })
  ).toBeDisabled()
  await expect(
    page.locator('.bv-dial-expedition[data-expedition="corn"] .bv-dial-btn')
  ).toBeDisabled()
  // The clock moves the time left in place: the card a tap would land on
  // is the same node a tick later.
  const left = out.locator('.bv-dial-run-left')
  await out.evaluate((card) => {
    card.dataset.kept = 'yes'
  })
  const before = await left.textContent()
  await expect(left).not.toHaveText(before ?? '', { timeout: 5_000 })
  await expect(out).toHaveAttribute('data-kept', 'yes')
  // Kept by the valley: a redial finds it still out.
  await page.reload()
  await dialIn(page)
  await page.locator('.bv-dial-tab[data-tab="expeditions"]').click()
  await expect(page.locator('.bv-dial-run[data-run="ride"]')).toBeVisible()
})

test('a dropped line lets every ask go and says so', async ({ browser }) => {
  const page = await phone(browser)
  // Keep every socket the page opens, so the spec can drop the valley's.
  await page.addInitScript(() => {
    const Socket = window.WebSocket
    const kept: WebSocket[] = []
    Object.assign(window, { __sockets: kept })
    window.WebSocket = class extends Socket {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args)
        kept.push(this)
      }
    }
  })
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  await page.evaluate(() => {
    const kept = (window as unknown as { __sockets: WebSocket[] }).__sockets
    // The valley's line alone: Vite's own reloads the page when it drops.
    for (const socket of kept) {
      if (new URL(socket.url).pathname === '/ws') socket.close()
    }
  })
  await expect(page.locator('.bv-dial-toast')).toHaveText(
    copy('log.signal_lost')
  )
  // net.ts redials on its own, and the phone plays on.
  await page.locator('.bv-dial-tab[data-tab="expeditions"]').click()
  await expect(
    page.locator('.bv-dial-expedition[data-expedition="ride"] .bv-dial-btn')
  ).toBeEnabled({ timeout: 15_000 })
})

test('sets the volumes and opens the account from the phone', async ({
  browser,
}) => {
  const page = await phone(browser)
  const raider = await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  await page.locator('.bv-dial-card[data-card="audio"]').click()
  const slider = page.locator('[data-bv="setting-sfx"]')
  await expect(slider).toBeVisible()
  const start = Number(await slider.inputValue())
  const saved = page.waitForRequest(
    (r) => r.url().endsWith('/auth/settings') && r.method() === 'PUT'
  )
  await slider.focus()
  await page.keyboard.press('ArrowLeft')
  const want = String(start - 5)
  await expect(slider).toHaveValue(want)
  await saved
  // Kept on the account, the same as the 3D valley's Audio.
  await page.reload()
  await dialIn(page)
  await page.locator('.bv-dial-card[data-card="audio"]').click()
  await expect(slider).toHaveValue(want)
  await page.getByRole('button', { name: copy('dialup.back') }).click()
  // The 3D valley's own account panel.
  await page.locator('[data-bv="dial-account"]').click()
  const panel = page.getByRole('dialog', {
    name: copy('panel.title'),
    exact: true,
  })
  await expect(panel.locator('[data-bv="panel-username"]')).toHaveText(
    raider.username
  )
  await panel.locator('[data-bv="panel-close"]').click()
  await expect(panel).toHaveCount(0)
})
