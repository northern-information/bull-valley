import { test as base, expect } from '@playwright/test'
import { devSignInUrl } from '../../src/account.ts'
import { copy } from './copy.ts'
import type { Page } from '@playwright/test'

// Collect console errors, failed responses, and uncaught page errors.
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    // HTTP failures are logged below with their URL.
    if (msg.text().startsWith('Failed to load resource')) return
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`)
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

// Every spec fails on a console error or an uncaught page error.
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors = watchErrors(page)
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

// Start and skip the colophon, landing on the main menu.
export async function toMenu(page: Page): Promise<void> {
  // The game loads after the page (entry.ts imports it once it knows a
  // phone from a desk), so wait for the colophon to listen: its hint and
  // its keys come together.
  await page.locator('.bv-splash-hint').waitFor({ timeout: 30_000 })
  // The first press starts the colophon, the second skips it.
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  await expect(page.getByAltText(copy('titles.logo_alt'))).toBeVisible()
}

// From a fresh signed-in load to the character select: Die at the menu.
export async function toCharacterSelect(page: Page): Promise<void> {
  await toMenu(page)
  await page.getByRole('button', { name: copy('menu.die') }).click()
  await expect(page.locator('.bv-select-ui')).toBeVisible()
}

// From a signed-in load to the intro dialog, choosing at the character
// select after `steps` presses of →. The select opens on the account's
// pick, so 0 steps keeps it.
export async function passTitles(page: Page, steps = 0): Promise<void> {
  await toCharacterSelect(page)
  for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('.bv-select')).toHaveCount(0)
}

// A dev-provider account. Specs run in parallel against one accounts
// database, and a username is taken once, so each gets a tagged one.
export interface Raider {
  userId: string
  username: string
}

export function freshRaider(name = 'Raider'): Raider {
  const tag = Math.random().toString(36).slice(2, 7)
  return {
    userId: `e2e-${Date.now().toString(36)}-${tag}`,
    // At most 10 + 1 + 5 = 16, the username limit.
    username: `${name.slice(0, 10)}_${tag}`,
  }
}

// Sign a raider in through the dev provider, past the magic word
// and with a username, landing on the page a sign-in popup closes. The
// cookies are the browser context's, so the next load of the game is
// signed in. Signing the same raider in again finds the same account.
export async function signIn(
  page: Page,
  raider: Raider = freshRaider()
): Promise<Raider> {
  await page.goto(devSignInUrl({ ...raider, redirect: '/auth-done.html' }))
  await expect(page.getByText('Signed in.')).toBeVisible()
  return raider
}

interface BeginOptions {
  // The valley (Durable Object) to join. Specs run in parallel against one
  // dev server, so each page gets a valley of its own unless a spec wants
  // two pages to meet.
  valley?: string
  // Who to sign in as; a fresh raider unless a spec needs the same account
  // twice. Two pages that must be two raiders need two browser contexts,
  // since the session is a cookie.
  raider?: Raider
}

// After a teleport, until the valley has been told where the raider now
// stands: its shadowmen cross round the place it last heard, and one placed
// far from every raider it knows is gone in its next step.
// Lets the game step `count` frames (its loop runs on the animation
// frame): whatever a key held or typed would have moved by then, it has.
export async function frames(page: Page, count = 10): Promise<void> {
  await page.evaluate(
    (n) =>
      new Promise<void>((done) => {
        let left = n
        const step = () => (--left > 0 ? requestAnimationFrame(step) : done())
        requestAnimationFrame(step)
      }),
    count
  )
}

// Turn the raider to look at what lies on the ground at (x, z), as a
// raider would before taking it up: a pickup is offered only in view.
export async function faceSpot(
  page: Page,
  x: number,
  z: number
): Promise<void> {
  await page.evaluate(
    ([x, z]) => {
      const bv = window.__bv
      if (!bv) throw new Error('no dev hook')
      const { player, world } = bv
      const dx = x - player.pos.x
      const dz = z - player.pos.z
      const dy = world.ground.at(x, z) + 0.1 - (player.groundY + player.eye)
      // The view looks along (-sin yaw, -cos yaw).
      player.yaw = Math.atan2(-dx, -dz)
      player.pitch = Math.atan2(dy, Math.hypot(dx, dz))
    },
    [x, z] as const
  )
}

export async function heardWhere(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bv = window.__bv
        if (!bv?.sent) return Infinity
        const { x, z } = bv.player.pos
        return Math.hypot(bv.sent.x - x, bv.sent.z - z)
      })
    )
    .toBeLessThan(1)
}

// An open spot off the spawn lot, clear of Gron, the bush and the store,
// where nothing else answers E first; `dx` and `dz` metres off it.
export async function standInTheOpen(
  page: Page,
  dx = 0,
  dz = 0
): Promise<void> {
  await page.evaluate(
    ([x, z]) => {
      const bv = window.__bv
      if (!bv) throw new Error('no dev hook')
      const station = bv.world.spawnStation
      if (!station) throw new Error('no spawn station')
      bv.player.relocate(station.x - 150 + x, station.z - 150 + z, 0)
    },
    [dx, dz]
  )
  await heardWhere(page)
}

// Down to less geometrie than any touch takes (sharedworld.ts rule 24), so
// the next touch shatters: the valley's word, heard back. A frame sent as
// the line drops is lost, and the reconnect sends only where the raider
// stands, so ask again until the answer comes.
export async function onLastPoint(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bv = window.__bv
        if (bv && bv.health !== 100) bv.setHealth(100)
        return bv?.health
      })
    )
    .toBe(100)
}

export function freshValley(prefix = 'spec'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// Sign in, load the game, pass the titles, and begin the raid. Under
// webdriver the dev build starts without pointer lock. Resolves with the
// raider, whose username is the name the valley shows.
export async function beginRaid(
  page: Page,
  steps = 0,
  { valley = freshValley(), raider = freshRaider() }: BeginOptions = {}
): Promise<Raider> {
  await signIn(page, raider)
  await page.goto(`/?valley=${encodeURIComponent(valley)}`)
  await passTitles(page, steps)
  // boot() sets the dev hook last, after the input listeners; the button
  // reads "Click to Die" before boot starts, so its text is not a signal.
  await expect
    .poll(() => page.evaluate(() => !!window.__bv), { timeout: 30_000 })
    .toBe(true)
  // Nothing plays without the valley: Begin waits for its welcome.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.net.status), {
      timeout: 30_000,
    })
    .toBe('online')
  // Raiders are on foot from the start: a quiet valley, where only the
  // shadowmen a spec places come for anyone.
  await page.evaluate(() => window.__bv?.calm())
  const begin = page.locator('[data-bv="begin"]')
  await expect(begin).toBeEnabled()
  await begin.click()
  await expect
    .poll(() => page.evaluate(() => window.__bv?.player.locked))
    .toBe(true)
  return raider
}
