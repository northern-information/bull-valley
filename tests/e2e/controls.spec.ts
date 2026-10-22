import { PACK_IN_MENU, WORLD } from '../../src/bindings.ts'
import { copy } from './copy.ts'
import { expect, freshValley, passTitles, signIn, test } from './fixtures.ts'

// The controls players read are drawn from bindings.ts, so every bound
// action shows where it applies: the valley's on the intro card, and the
// pack's in the open pack (inventory.spec.ts).

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
