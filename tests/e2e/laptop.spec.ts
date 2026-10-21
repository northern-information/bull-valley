import { copy } from './copy.ts'
import { beginRaid, expect, heardWhere, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// In the spawn Citgo's bathroom, in front of the laptop on its card table
// (store.ts laptopAt): a step back from it along the station's local -Z.
async function toLaptop(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bv = window.__bv
    const station = bv?.world.spawnStation
    if (!bv || !station) throw new Error('no spawn station')
    const spot = bv.world.laptops[bv.world.fuelPoints.indexOf(station)]
    const back = 0.75
    bv.player.relocate(
      spot.x + back * Math.sin(station.yaw),
      spot.z - back * Math.cos(station.yaw),
      0
    )
  })
  await heardWhere(page)
}

test('the bathroom laptop opens on the readme, and keeps what you write', async ({
  page,
}) => {
  test.slow()
  const raider = await beginRaid(page)
  await toLaptop(page)
  await expect(page.locator('.bv-prompt')).toHaveText(copy('prompts.laptop'))
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.laptopOpen))
    .toBe(true)

  // It stands on the editor with the readme up, and no one writes on it.
  const editor = page.locator('[data-bv="editor"]')
  const text = page.locator('[data-bv="text"]')
  await expect(editor).toBeVisible()
  await expect(page.locator('[data-bv="name"]')).toHaveValue(
    copy('laptop.readme_name')
  )
  await expect(text).toHaveAttribute('readonly', '')
  await expect(page.locator('[data-bv="edit-said"]')).toHaveText(
    copy('laptop.read_only')
  )

  // Esc shows the desktop; a new file in My Documents, tabs and all.
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()
  await page.getByRole('button', { name: copy('laptop.my_documents') }).click()
  await expect(page.locator('[data-bv="path"]')).toHaveText(
    copy('laptop.folder_path', { owner: raider.username })
  )
  await page.locator('[data-bv="new"]').click()
  await expect(editor).toBeVisible()
  const typed = 'first line\n\tindented\n  two spaces'
  await text.fill(typed)
  await page.keyboard.press('Control+KeyS')
  await expect(page.locator('[data-bv="edit-said"]')).toHaveText(
    copy('laptop.saved')
  )

  // Out of the editor, the file is in the folder; opened again, word for
  // word.
  await page.keyboard.press('Escape')
  const row = page.locator('.bv-xp-row', {
    hasText: copy('laptop.untitled'),
  })
  await expect(row).toBeVisible()
  await row.dblclick()
  await expect(text).toHaveValue(typed)
  await expect(text).not.toHaveAttribute('readonly', '')

  // Getting up and sitting down again finds the readme.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.laptopOpen))
    .toBe(false)
  await page.keyboard.press('KeyE')
  await expect(page.locator('[data-bv="name"]')).toHaveValue(
    copy('laptop.readme_name')
  )
})
