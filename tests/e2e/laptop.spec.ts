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
  await expect(text).toHaveAttribute('aria-readonly', 'true')
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
  await expect(text).toHaveAttribute('aria-readonly', 'false')

  // Art wider than the screen keeps its lines whole: nothing wraps, and
  // the caret scrolls along a line as in any monospace editor, read-only
  // too, the way the readme opens.
  const wide = Array.from({ length: 6 }, (_, i) =>
    Array.from({ length: 500 }, (_, c) => '#/\\_ .|'[(c + i) % 7]).join('')
  ).join('\n')
  await text.fill(wide)
  await page.keyboard.press('Control+KeyS')
  await expect(page.locator('[data-bv="edit-said"]')).toHaveText(
    copy('laptop.saved')
  )
  const view = () =>
    text.evaluate((el: HTMLTextAreaElement) => ({
      left: el.scrollLeft,
      room: el.scrollWidth - el.clientWidth,
      height: el.scrollHeight,
    }))
  await text.press('Control+Home')
  const start = await view()
  expect(start.left).toBe(0)
  expect(start.room).toBeGreaterThan(0)
  await text.press('End')
  await expect(page.locator('[data-bv="caret"]')).toHaveText(
    copy('laptop.caret', { line: 1, col: 501 })
  )
  await expect.poll(async () => (await view()).left).toBeGreaterThan(0)
  await text.press('Home')
  await expect.poll(async () => (await view()).left).toBe(0)
  for (let i = 0; i < 120; i++) await text.press('ArrowRight')
  await expect.poll(async () => (await view()).left).toBeGreaterThan(0)
  await text.evaluate((el: HTMLTextAreaElement) => {
    el.setAttribute('aria-readonly', 'true')
  })
  await text.press('Home')
  await text.press('ArrowDown')
  await text.press('End')
  await expect(page.locator('[data-bv="caret"]')).toHaveText(
    copy('laptop.caret', { line: 2, col: 501 })
  )
  await expect.poll(async () => (await view()).left).toBeGreaterThan(0)
  // Locked, nothing typed lands.
  await text.press('KeyX')
  await text.press('Backspace')
  await expect(text).toHaveValue(wide)
  await text.evaluate((el: HTMLTextAreaElement) => {
    el.setAttribute('aria-readonly', 'false')
  })

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
