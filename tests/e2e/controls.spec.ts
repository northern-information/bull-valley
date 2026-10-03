import { PACK, WORLD } from '../../src/bindings.ts'
import { beginRaid, expect, freshValley, passTitles, test } from './fixtures.ts'

// The controls players read are drawn from bindings.ts, so every bound
// action shows where it applies: the valley's on the intro card, the
// pack's in the open pack.

test('the intro card lists every key the valley answers to', async ({
  page,
}) => {
  await page.goto(`/?valley=${encodeURIComponent(freshValley())}`)
  await passTitles(page)
  const table = page.getByRole('table', { name: 'Controls' })
  await expect(table).toBeVisible()
  for (const { key, label } of Object.values(WORLD)) {
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
  const pack = page.getByRole('dialog', { name: 'Inventory' })
  await expect(pack).toBeVisible()
  for (const { key, label } of Object.values(PACK)) {
    await expect(pack).toContainText(key)
    await expect(pack).toContainText(label)
  }
})
