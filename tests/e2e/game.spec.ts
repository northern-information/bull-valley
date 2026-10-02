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
  // ← wraps from the first character to the last.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.bv-select-name')).toHaveText('Justin Hanson')
})
