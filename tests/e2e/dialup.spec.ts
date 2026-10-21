import { devices, expect, test } from '@playwright/test'
import { copy } from './copy.ts'
import {
  beginRaid,
  freshRaider,
  freshValley,
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

test('stows from the pack, takes it back out of the locker, and keeps the hotbar', async ({
  browser,
}) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
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
  // Opened, it shows its stats as the 3D pack card does.
  await expect(pack.locator('.bv-item-stats')).toContainText(
    copy('stats.cigarette')
  )
  await pack.getByRole('button', { name: copy('dialup.pack.stow_one') }).click()
  // The locker, from the lobby, wherever the raider is: what is on the
  // raider apart from what the locker holds, and either way from there.
  await page.locator('.bv-dial-tab[data-tab="lobby"]').click()
  await page.locator('.bv-dial-card[data-card="locker"]').click()
  const stowed = page.locator(
    '.bv-dial-sheet [data-section="locker"] .bv-dial-item[data-kind="marlboro"]'
  )
  await expect(stowed).toBeVisible()
  // Key items have a list of their own, and never go in.
  await expect(
    page.locator('.bv-dial-sheet [data-section="keys"]')
  ).toContainText(copy('inventory.empty_key_items'))
  // What is still on the raider goes in from the sheet too, and back.
  const carried = page.locator(
    '.bv-dial-sheet [data-section="pack"] .bv-dial-item[data-kind="joints"]'
  )
  await carried.locator('summary').click()
  await carried
    .getByRole('button', { name: copy('dialup.pack.stow_all') })
    .click()
  await expect(carried).toHaveCount(0)
  const joints = page.locator(
    '.bv-dial-sheet [data-section="locker"] .bv-dial-item[data-kind="joints"]'
  )
  await joints.locator('summary').click()
  await joints
    .getByRole('button', { name: copy('dialup.pack.take_all') })
    .click()
  await expect(carried).toBeVisible()
  await stowed.locator('summary').click()
  await stowed
    .getByRole('button', { name: copy('dialup.pack.take_all') })
    .click()
  await expect(stowed).toHaveCount(0)
  await page.getByRole('button', { name: copy('dialup.back') }).click()
  // A slot on the hotbar, kept on the account.
  await page.locator('.bv-dial-tab[data-tab="pack"]').click()
  const joint = page.locator('.bv-dial-item[data-kind="joints"]')
  await joint.locator('summary').click()
  await joint.getByRole('button', { name: copy('dialup.pack.hotbar') }).click()
  await page.locator('.bv-dial-slot[data-slot="2"]').click()
  await expect(page.locator('.bv-dial-toast')).toHaveText(
    copy('dialup.pack.hotbar_saved', {
      item: copy('items.joints.label'),
      slot: 3,
    })
  )
  // Onto the slot that holds it already takes it off, and says so.
  await joint.getByRole('button', { name: copy('dialup.pack.hotbar') }).click()
  await page.locator('.bv-dial-slot[data-slot="2"]').click()
  await expect(page.locator('.bv-dial-toast')).toHaveText(
    copy('dialup.pack.hotbar_cleared', {
      item: copy('items.joints.label'),
      slot: 3,
    })
  )
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

  // The Citgo: its shelves, bought off from the phone.
  await page.locator('.bv-dial-card[data-card="citgo"]').click()
  const cash = page.locator('.bv-dial-cash')
  const before = await cash.textContent()
  const shelf = page.locator('.bv-dial-shelf').first()
  await shelf.getByRole('button', { name: copy('dialup.citgo.buy') }).click()
  await expect(cash).not.toHaveText(before ?? '')
  await page.getByRole('button', { name: copy('dialup.back') }).click()

  // Erwin gives the rose from anywhere.
  await page.locator('.bv-dial-card[data-card="erwin"]').click()
  const deal = page.locator('.bv-deal')
  await expect(deal).toBeVisible()
  await deal.locator('[data-bv="deal-quest-go"]').click()
  await expect(deal.locator('[data-bv="deal-said"]')).toHaveText(
    copy('quests.rose_given')
  )
  await deal.locator('[data-bv="deal-close"]').click()

  // Moab offers the halo once the pack holds gold.
  await desk.evaluate(() => window.__bv?.grant('gold-bullion', 1))
  await page.locator('.bv-dial-card[data-card="moab"]').click()
  const offer = page.locator('.bv-dial-folk-act .bv-dial-btn')
  await expect(offer).toBeVisible()
  await offer.click()
  await expect(page.locator('.bv-dial-toast')).toHaveText(
    copy('log.cosmetic_worn', {
      cosmetic: copy('cosmetics.flaming-halo.label'),
    })
  )
  await page.getByRole('button', { name: copy('dialup.back') }).click()

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

test('Gron changes the name from the phone', async ({ browser }) => {
  const page = await phone(browser)
  await signIn(page)
  await page.goto(`/?valley=${freshValley('dial')}`)
  await dialIn(page)
  await page.locator('.bv-dial-card[data-card="gron"]').click()
  const name = freshRaider('Renamed').username
  await page.locator('[data-bv="gron-username"]').fill(name)
  const rename = page.locator('[data-bv="gron-rename"]')
  await expect(rename).toBeEnabled()
  await rename.click()
  await page.locator('[data-bv="gron-close"]').click()
  await expect(page.locator('.bv-dial-name')).toHaveText(name)
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
