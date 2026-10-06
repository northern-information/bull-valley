import { PACK, PACK_IN_MENU, WORLD } from '../../src/bindings.ts'
import { copy } from './copy.ts'
import {
  beginRaid,
  expect,
  freshValley,
  passTitles,
  signIn,
  test,
} from './fixtures.ts'

// The controls players read are drawn from bindings.ts, so every bound
// action shows where it applies: the valley's on the intro card, the
// pack's in the open pack.

test('the intro card lists every key the valley answers to', async ({
  page,
}) => {
  await signIn(page)
  await page.goto(`/?valley=${encodeURIComponent(freshValley())}`)
  await passTitles(page)
  const table = page.getByRole('table', { name: copy('intro.controls_label') })
  await expect(table).toBeVisible()
  for (const { key, labelKey } of Object.values(WORLD)) {
    const label = copy(labelKey)
    await expect(
      table.getByRole('rowheader', { name: key, exact: true })
    ).toBeVisible()
    await expect(
      table.getByRole('cell', { name: label, exact: true })
    ).toBeVisible()
  }
  // The pack's drop keys too, saying where they work.
  for (const { key, labelKey } of PACK_IN_MENU) {
    const label = copy('keys.in_pack', { action: copy(labelKey) })
    await expect(
      table.getByRole('rowheader', { name: key, exact: true })
    ).toBeVisible()
    await expect(
      table.getByRole('cell', { name: label, exact: true })
    ).toBeVisible()
  }
})

test('the open pack lists every key it answers to', async ({ page }) => {
  await beginRaid(page)
  await page.keyboard.press('Tab')
  const pack = page.getByRole('dialog', { name: copy('inventory.label') })
  await expect(pack).toBeVisible()
  // E and the number keys are on the card of the item under the cursor.
  await pack.locator('.bv-bag-cell').first().hover()
  await expect(pack.locator('.bv-bag-card')).toBeVisible()
  for (const { key, labelKey } of Object.values(PACK)) {
    const label = copy(labelKey)
    await expect(pack).toContainText(key)
    await expect(pack).toContainText(label)
  }
})
