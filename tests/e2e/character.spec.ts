import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  passTitles,
  signIn,
  test,
  toCharacterSelect,
} from './fixtures.ts'

// The character select: the body an account raids in, and the finish on
// Church's guitar, both kept on the account.

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

  // The menu's Settings opens the account panel.
  await page.locator('[data-bv="overlay-settings"]').click()
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
    copy('outfits.terry')
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
