import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  heardWhere,
  onLastPoint,
  passTitles,
  signIn,
  test,
  toCharacterSelect,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// Matthew Marx's truck, as the valley has it.
const leg = (page: Page) =>
  page.evaluate(() => window.__bv?.marx.leg.kind ?? null)

test('climbing into the bed starts the countdown, and Marx leaves with you', async ({
  page,
}) => {
  await beginRaid(page)
  expect(await leg(page)).toBe('parked')
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    bv.player.relocate(bv.truck.x + 1, bv.truck.z + 1, Math.atan2(1, 1))
  })
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.board'))
  await page.keyboard.press('KeyE')
  await expect.poll(() => page.evaluate(() => window.__bv?.aboard)).toBe(true)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const leg = window.__bv?.marx.leg
        return leg?.kind === 'parked' && leg.leavesAt !== null
      })
    )
    .toBe(true)
  await page.evaluate(() => window.__bv?.hurryTruck(0))
  await expect.poll(() => leg(page)).toBe('joyride')
  expect(await page.evaluate(() => window.__bv?.aboard)).toBe(true)
  await expect
    .poll(() => page.evaluate(() => window.__bv?.truck.moving))
    .toBe(true)
})

test('Marx does donuts in the field after reading, until whistled', async ({
  page,
}) => {
  await beginRaid(page)
  await page.evaluate(() => window.__bv?.hurryTruck(0))
  await expect.poll(() => leg(page)).toBe('donuts')
  const truck = () =>
    page.evaluate(() => {
      const bv = window.__bv
      const field = bv?.world.donutField
      if (!bv || !field) return null
      return {
        drifting: bv.truck.drifting,
        inField:
          Math.hypot(bv.truck.x - field.x, bv.truck.z - field.z) < field.radius,
      }
    })
  await expect
    .poll(truck, { timeout: 30_000 })
    .toEqual({ drifting: true, inField: true })
  await page.keyboard.press('t')
  await expect.poll(() => leg(page)).toBe('called')
  await expect.poll(truck).toMatchObject({ drifting: false })
})

test('shadowmen cross the valley and show on the scope', async ({ page }) => {
  await beginRaid(page)
  // They are the valley's: it sends them every step.
  await expect
    .poll(() =>
      page.evaluate(() => window.__bv?.shadowmen.table.next?.shadowmen.length)
    )
    .toBeGreaterThan(0)
  await page.keyboard.press('q')
  await expect(page.locator('.bv-phone')).toHaveClass(/bv-phone--raised/)
  // The crossings come in from well past its range, so stand one inside it,
  // out of the forecourt haven.
  await page.evaluate(() => window.__bv?.teleport(0.5, 0.5))
  await heardWhere(page)
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return
    bv.placeShadowman(bv.player.pos.x + 40, bv.player.pos.z)
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__bv?.shadowmen.contacts.some(
          (c) => c.kind === 'shadow' && Math.abs(c.dist - 40) < 2
        )
      )
    )
    .toBe(true)
})

test("a shadowman's touch takes a point, and the Citgo makes you whole", async ({
  page,
}) => {
  await beginRaid(page)
  const max = await page.evaluate(() => window.__bv?.health)
  expect(max).toBe(3)
  await expect(page.locator('.bv-health')).toHaveAttribute('data-health', '3')
  await page.evaluate(() => window.__bv?.grant('marlboro', 20))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory.marlboro))
    .toBeGreaterThan(19)
  // Out of the forecourt haven, then a shadowman beside you.
  await page.evaluate(() => window.__bv?.teleport(0.5, 0.5))
  await heardWhere(page)
  const before = await page.evaluate(() => {
    const bv = window.__bv
    return bv ? { x: bv.player.pos.x, z: bv.player.pos.z } : null
  })
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return
    bv.placeShadowman(bv.player.pos.x, bv.player.pos.z + 3)
  })
  await expect.poll(() => page.evaluate(() => window.__bv?.health)).toBe(2)
  await expect(page.locator('.bv-health')).toHaveAttribute('data-health', '2')
  await expect(page.locator('.bv-hurt')).toHaveClass(/bv-hurt--on/)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.hit'))
  // No static, no body: still standing where it struck, the pack whole.
  expect(await page.evaluate(() => window.__bv?.strikes)).toBe(0)
  await expect(page.locator('.bv-static')).toBeHidden()
  const after = await page.evaluate(() => {
    const bv = window.__bv
    return bv
      ? {
          x: bv.player.pos.x,
          z: bv.player.pos.z,
          marlboro: bv.inventory.marlboro,
          bodies: bv.myCorpses.length,
        }
      : null
  })
  expect(
    Math.hypot(
      (after?.x ?? 0) - (before?.x ?? 0),
      (after?.z ?? 0) - (before?.z ?? 0)
    )
  ).toBeLessThan(1)
  expect(after?.marlboro).toBeGreaterThan(19)
  expect(after?.bodies).toBe(0)
  // Back under the Citgo lights, whole again.
  await page.evaluate(() => {
    const bv = window.__bv
    if (bv) bv.player.relocate(bv.world.spawn.x, bv.world.spawn.z)
  })
  await expect.poll(() => page.evaluate(() => window.__bv?.health)).toBe(3)
  await expect(page.locator('.bv-chat')).toContainText(copy('log.mended'))
})

test("a shadowman's touch on the last point puts you back at the Citgo", async ({
  page,
}) => {
  await beginRaid(page)
  // The static is up for strikeSeconds of wall clock. On a runner at a frame
  // a second that can come and go between two polls, so the page records
  // when it shows and when it clears instead of the spec trying to catch it.
  await page.evaluate(() => {
    const el = document.querySelector('.bv-static')
    if (!el) throw new Error('no static overlay')
    const marks: { shownAt?: number; hiddenAt?: number } = {}
    Object.assign(window, { staticMarks: marks })
    new MutationObserver(() => {
      const hidden = el.hasAttribute('hidden')
      if (!hidden) marks.shownAt ??= performance.now()
      else if (marks.shownAt !== undefined) marks.hiddenAt ??= performance.now()
    }).observe(el, { attributes: true, attributeFilter: ['hidden'] })
  })
  const marks = () =>
    page.evaluate(
      () =>
        (window as { staticMarks?: { shownAt?: number; hiddenAt?: number } })
          .staticMarks
    )
  // Out of the forecourt haven on the last point, then a shadowman beside
  // you: the valley has it rush you, and says it touched you.
  await page.evaluate(() => window.__bv?.teleport(0.5, 0.5))
  await heardWhere(page)
  await onLastPoint(page)
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return
    bv.placeShadowman(bv.player.pos.x, bv.player.pos.z + 3)
  })
  await expect.poll(() => page.evaluate(() => window.__bv?.strikes)).toBe(1)
  // It showed, then cleared.
  await expect.poll(async () => (await marks())?.hiddenAt).toBeDefined()
  await expect(page.locator('.bv-static')).toBeHidden()
  // It lasted strikeSeconds (1.6 s) of wall clock, give or take a frame. On
  // frame-capped game time it would stretch to half a minute on a slow
  // runner, so this bound catches that coming back.
  const { shownAt = 0, hiddenAt = 0 } = (await marks()) ?? {}
  expect(hiddenAt - shownAt).toBeLessThan(10_000)
  const fromSpawn = await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return null
    const { pos } = bv.player
    return Math.hypot(pos.x - bv.world.spawn.x, pos.z - bv.world.spawn.z)
  })
  expect(fromSpawn).toBeLessThan(1)
  expect(await page.evaluate(() => window.__bv?.aboard)).toBe(false)
})

test('the chosen character is the body you raid in, and is remembered', async ({
  page,
}) => {
  // Two steps right of the player: Kvistad.
  const raider = await beginRaid(page, 2)
  const outfit = () =>
    page.evaluate((): unknown => {
      const body = window.__bv?.scene.getObjectByName('player-body')
      return body?.userData.outfit
    })
  expect(await outfit()).toBe('kvistad')

  // Still signed in after a reload, raiding under the account's username
  // in the same body: Die opens the select on it.
  await page.reload()
  await toCharacterSelect(page)
  await expect(page.locator('.bv-select-name')).toHaveText(
    copy('outfits.kvistad')
  )
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-bv="intro-username"]')).toHaveText(
    raider.username
  )
  await expect
    .poll(() => page.evaluate(() => !!window.__bv), { timeout: 30_000 })
    .toBe(true)
  expect(await outfit()).toBe('kvistad')

  // The pause overlay opens the account panel.
  await page.locator('[data-bv="intro-account"]').click()
  const panel = page.getByRole('dialog', {
    name: copy('panel.title'),
    exact: true,
  })
  await expect(panel.locator('[data-bv="panel-username"]')).toHaveText(
    raider.username
  )
})

test('the guitar finish is picked with Church and remembered', async ({
  page,
}) => {
  await signIn(page)
  await page.goto('/')
  await toCharacterSelect(page)
  const row = page.locator('.bv-select-finish')
  const finish = page.locator('.bv-select-finish-name')
  const checked = page.locator('.bv-swatch[aria-checked="true"]')
  // The player carries no guitar, so there is no row to show.
  await expect(row).toBeHidden()
  // ← wraps from the first character to the last.
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.bv-select-name')).toHaveText(
    copy('outfits.mathiesen')
  )
  await page.keyboard.press('ArrowRight')
  // Three steps right of the player: Church, with the EX-400 on his back.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.bv-select-name')).toHaveText(
    copy('outfits.church')
  )
  await expect(row).toBeVisible()
  await expect(finish).toHaveText(copy('finishes.black'))
  await expect(checked).toHaveAttribute('aria-label', copy('finishes.black'))

  // ↓ steps to the next finish; R lands on any other one.
  await page.keyboard.press('ArrowDown')
  await expect(finish).toHaveText(copy('finishes.olympic-white'))
  await page.keyboard.press('KeyR')
  await expect(finish).not.toHaveText(copy('finishes.olympic-white'))
  const picked = (await finish.textContent()) ?? ''
  await expect(checked).toHaveAttribute('aria-label', picked)

  // The swatch wears the finish's color, and so does the guitar.
  const color = await checked.evaluate((el) =>
    (el as HTMLElement).style.getPropertyValue('--swatch').trim()
  )
  await page.keyboard.press('Enter')
  await expect(page.locator('.bv-select')).toHaveCount(0)
  await page.reload()
  await passTitles(page)
  await expect
    .poll(() => page.evaluate(() => !!window.__bv), { timeout: 30_000 })
    .toBe(true)
  const body = await page.evaluate((): unknown => {
    const found = window.__bv?.scene.getObjectByName('player-body')
    return found ? { ...found.userData } : null
  })
  expect(body).toMatchObject({ outfit: 'church', guitarFinish: color })
})
