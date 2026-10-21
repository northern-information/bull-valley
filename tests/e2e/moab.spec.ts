import { copy } from './copy.ts'
import { beginRaid, expect, test } from './fixtures.ts'
import type { Page } from '@playwright/test'

// What the log says, every line: other lines (a Citgo found, Carlsten
// at the Citgo) may come between or after his, so his are looked for,
// never taken as the last.
const said = (page: Page) =>
  page.evaluate(() => window.__bv?.chat.map((line) => line.text) ?? [])

// Whether `first` is in the log with `then` somewhere after it.
const inOrder = (lines: string[], first: string, then: string) => {
  const at = lines.lastIndexOf(first)
  return at >= 0 && lines.indexOf(then, at) > at
}

// Moab Coldë stands by his burning horse under every Citgo sign. Come near
// and he glows, with no prompt; E and he says his one line, in the chat log
// under his own name.

async function standAtMoab(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bv = window.__bv
    if (!bv) throw new Error('no dev hook')
    const { world } = bv
    const station = world.spawnStation
    if (!station) throw new Error('no spawn station')
    const moab = world.moabs[world.fuelPoints.indexOf(station)]
    // A stride toward the pump island, in front of him.
    const dx = station.x - moab.x
    const dz = station.z - moab.z
    const d = Math.hypot(dx, dz)
    bv.player.relocate(
      moab.x + (dx / d) * 1.8,
      moab.z + (dz / d) * 1.8,
      bv.player.yaw
    )
  })
}

test('Moab Coldë says his line', async ({ page }) => {
  await beginRaid(page)
  await standAtMoab(page)
  // The spawn station's Moab glows, and nothing else says so.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bv = window.__bv
        const station = bv?.world.spawnStation
        if (!bv || !station) return false
        const rig = bv.world.moabRigs[bv.world.fuelPoints.indexOf(station)]
        return bv.glow === rig?.figure.group
      })
    )
    .toBe(true)
  await expect(page.locator('.bv-prompt')).toBeHidden()
  await page.keyboard.press('KeyE')
  await expect
    .poll(() =>
      page.evaluate(
        (text) => window.__bv?.chat.find((line) => line.text === text) ?? null,
        copy('moab.says')
      )
    )
    .toEqual({
      kind: 'npc',
      name: copy('outfits.moab'),
      text: copy('moab.says'),
      at: expect.any(Number),
    })
  await expect(
    page.getByRole('log', { name: copy('hud.chat_log_label') })
  ).toContainText(`${copy('outfits.moab')}: ${copy('moab.says')}`)
  // He opens nothing: the game keeps the pointer.
  expect(await page.evaluate(() => window.__bv?.player.locked)).toBe(true)
})

test('Moab Coldë trades the Flaming Halo for an ounce of gold', async ({
  page,
}) => {
  await beginRaid(page)
  // Gold bullion has no way into the pack yet but the dev hook.
  await page.evaluate(() => window.__bv?.grant('gold-bullion'))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['gold-bullion']))
    .toBe(1)
  await standAtMoab(page)
  // In his reach he makes his offer, and the prompt says what he wants.
  await expect.poll(() => said(page)).toContain(copy('moab.offer'))
  await expect(page.locator('.bv-prompt')).toHaveText(
    copy('prompts.trade', {
      count: 1,
      price: copy('items.gold-bullion.label'),
      cosmetic: copy('cosmetics.flaming-halo.label'),
    })
  )
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.cosmetics))
    .toEqual(['flaming-halo'])
  expect(
    await page.evaluate(() => window.__bv?.inventory['gold-bullion'])
  ).toBe(0)
  await expect
    .poll(async () =>
      inOrder(
        await said(page),
        copy('moab.traded'),
        copy('log.cosmetic_worn', {
          cosmetic: copy('cosmetics.flaming-halo.label'),
        })
      )
    )
    .toBe(true)
  // Worn for good, he has nothing more to offer: E hears his line again.
  await expect(page.locator('.bv-prompt')).toBeHidden()
  await page.keyboard.press('KeyE')
  await expect.poll(() => said(page)).toContain(copy('moab.says'))
  // The account wears it from the titles on: the select dresses every
  // character in what /auth/me says.
  const me = (await (await page.request.get('/auth/me')).json()) as {
    account: { cosmetics: string[] } | null
  }
  expect(me.account?.cosmetics).toEqual(['flaming-halo'])
  // And the pack shows the raider in it, beside the grid.
  await page.keyboard.press('Tab')
  await expect(page.locator('.bv-bag')).toBeVisible()
  await expect(page.locator('.bv-bag-avatar')).toBeVisible()
})

test('Moab Coldë trades David Coleman: #1 for ten ounces of gold', async ({
  page,
}) => {
  await beginRaid(page)
  const look = (outfit: string) =>
    page.evaluate(
      async (outfit) =>
        (
          await fetch('/auth/look', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outfit, finish: 'black' }),
          })
        ).status,
      outfit
    )
  // The refusal before the trade is the Worker tests' (tests/worker
  // auth.test.ts): the fixture counts any 4xx as a page error.
  await page.evaluate(() => window.__bv?.grant('gold-bullion', 10))
  await expect
    .poll(() => page.evaluate(() => window.__bv?.inventory['gold-bullion']))
    .toBe(10)
  await standAtMoab(page)
  // Carrying enough, he offers #1 before the halo.
  await expect
    .poll(() => said(page))
    .toContain(copy('cosmetics.coleman-1.offer'))
  await expect(page.locator('.bv-prompt')).toHaveText(
    copy('prompts.trade', {
      count: 10,
      price: copy('items.gold-bullion.label'),
      cosmetic: copy('cosmetics.coleman-1.label'),
    })
  )
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => page.evaluate(() => window.__bv?.cosmetics))
    .toEqual(['coleman-1'])
  expect(
    await page.evaluate(() => window.__bv?.inventory['gold-bullion'])
  ).toBe(0)
  await expect
    .poll(async () =>
      inOrder(
        await said(page),
        copy('cosmetics.coleman-1.traded'),
        copy('cosmetics.coleman-1.worn')
      )
    )
    .toBe(true)
  // His now: the account may raid as him.
  expect(await look('coleman1')).toBe(200)
})
