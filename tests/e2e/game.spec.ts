import { beginRaid, expect, test, toCharacterSelect } from './fixtures.ts'

test('a raid starts in loadout and the truck leaves on time', async ({
  page,
}) => {
  await beginRaid(page)
  const state = () => page.evaluate(() => window.__bv?.raid.state)
  expect(await state()).toBe('LOADOUT')
  await page.evaluate(() => window.__bv?.hurryTruck(0))
  await expect.poll(state).not.toBe('LOADOUT')
})

test('shadowmen cross the valley and show on the scope', async ({ page }) => {
  await beginRaid(page)
  const slots = await page.evaluate(
    () => window.__bv?.shadowmen.field.slots.length
  )
  expect(slots).toBe(12)
  await page.keyboard.press('q')
  await expect(page.locator('.bv-phone')).toHaveClass(/bv-phone--raised/)
  // The bubble is populated from the first frame, so blips are already in.
  await expect
    .poll(() => page.evaluate(() => window.__bv?.shadowmen.contacts.length))
    .toBeGreaterThan(0)
})

test("a shadowman's touch puts you back at the Citgo", async ({ page }) => {
  await beginRaid(page)
  await page.evaluate(() => window.__bv?.hurryTruck(0))
  const state = () => page.evaluate(() => window.__bv?.raid.state)
  await expect.poll(state).toBe('ON_FOOT')
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
  // Out of the forecourt haven, then a rushing shadowman on top of you.
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) return
    bv.teleport(0.5, 0.5)
    bv.shadowmen.field.slots[0] = {
      x: bv.player.pos.x,
      z: bv.player.pos.z,
      dirX: 0,
      dirZ: 1,
      speed: 0,
      rushing: true,
    }
  })
  await expect.poll(() => page.evaluate(() => window.__bv?.raid.deaths)).toBe(1)
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
  expect(await state()).toBe('ON_FOOT')
})

test('the chosen character is the body you raid in, and is remembered', async ({
  page,
}) => {
  // Two steps right of the player: Kvistad.
  await beginRaid(page, 2)
  const outfit = () =>
    page.evaluate((): unknown => {
      const body = window.__bv?.scene.getObjectByName('player-body')
      return body?.userData.outfit
    })
  expect(await outfit()).toBe('kvistad')

  await page.reload()
  await toCharacterSelect(page)
  await expect(page.locator('.bv-select-name')).toHaveText('David Kvistad')
  await expect(page.locator('[data-bv="select-player-name"]')).toHaveValue(
    'Raider'
  )
  // ← wraps from the first character to the last.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.bv-select-name')).toHaveText('Justin Hanson')
})

test('a name is required at the character select, and remembered', async ({
  page,
}) => {
  await page.goto('/')
  await toCharacterSelect(page)
  const field = page.locator('[data-bv="select-player-name"]')
  const choose = page.locator('[data-bv="select-choose"]')
  // A fresh context has no name: the field is focused, Choose is off, and
  // Enter does nothing.
  await expect(field).toBeFocused()
  await expect(choose).toBeDisabled()
  await page.keyboard.press('Enter')
  await expect(page.locator('.bv-select')).toHaveCount(1)
  // Spaces alone are not a name; the first letter is.
  await field.fill('   ')
  await expect(choose).toBeDisabled()
  await field.fill('  Dave   Coleman ')
  await expect(choose).toBeEnabled()
  // The field clips at the wire's limit.
  await field.fill('x'.repeat(30))
  await expect(field).toHaveValue('x'.repeat(16))
  await field.fill('Dave  Coleman')
  await page.keyboard.press('Enter')
  await expect(page.locator('.bv-select')).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      localStorage.getItem('bull-valley-shadow-wars:v1:name')
    )
  ).toBe('Dave Coleman')
})

test('the guitar finish is picked with Church and remembered', async ({
  page,
}) => {
  await page.goto('/')
  await toCharacterSelect(page)
  const row = page.locator('.bv-select-finish')
  const finish = page.locator('.bv-select-finish-name')
  const checked = page.locator('.bv-swatch[aria-checked="true"]')
  // A fresh context starts in the name field; a name and Escape hand the
  // keys back to the turntable. Typing the name must not touch the finish.
  const field = page.locator('[data-bv="select-player-name"]')
  await field.fill('Russ Warner')
  await page.keyboard.press('Escape')
  // The player carries no guitar, so there is no row to show.
  await expect(row).toBeHidden()
  // Three steps right of the player: Church, with the EX-400 on his back.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.bv-select-name')).toHaveText('Kyle Church')
  await expect(row).toBeVisible()
  await expect(finish).toHaveText('Black')
  await expect(checked).toHaveAttribute('aria-label', 'Black')

  // ↓ steps to the next finish; R lands on any other one; letters typed
  // in the field stay in the field.
  await page.keyboard.press('ArrowDown')
  await expect(finish).toHaveText('Olympic White')
  await field.focus()
  await field.pressSequentially(' Sr')
  await page.keyboard.press('Escape')
  await expect(finish).toHaveText('Olympic White')
  await page.keyboard.press('KeyR')
  await expect(finish).not.toHaveText('Olympic White')
  const picked = (await finish.textContent()) ?? ''
  await expect(checked).toHaveAttribute('aria-label', picked)

  await page.keyboard.press('Enter')
  await expect(page.locator('.bv-select')).toHaveCount(0)
  await page.reload()
  await toCharacterSelect(page)
  await expect(page.locator('.bv-select-name')).toHaveText('Kyle Church')
  await expect(finish).toHaveText(picked)
})
