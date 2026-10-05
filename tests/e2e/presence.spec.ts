import { test as base } from '@playwright/test'
import {
  beginRaid,
  expect,
  freshRaider,
  freshValley,
  watchErrors,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

// Two browsers in one valley: each sees the other arrive as a figure in
// their outfit, follows them as they move, hears them on the Scaduscope,
// and sees them go. Each context has its own localStorage, so the two
// are strangers to the saved picks.

const peers = (page: Page) =>
  page.evaluate(() => window.__bv?.net.peers() ?? [])

base(
  'two players see each other in the valley',
  { tag: '@valley' },
  async ({ browser }) => {
    // Two valleys to boot; on CI each takes most of a minute in software GL.
    base.slow()
    const valley = freshValley('presence')
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    const a = await contextA.newPage()
    const b = await contextB.newPage()
    const errorsA = watchErrors(a)
    const errorsB = watchErrors(b)

    // One step right of the player: Coleman. Each is seen by the other
    // under the username of the account they signed in with.
    const [able, baker] = await Promise.all([
      beginRaid(a, 0, { valley, raider: freshRaider('Able') }),
      beginRaid(b, 1, { valley, raider: freshRaider('Baker') }),
    ])
    expect(await a.evaluate(() => window.__bv?.net.status)).toBe('online')
    expect(await b.evaluate(() => window.__bv?.net.status)).toBe('online')

    await expect.poll(() => peers(a)).toHaveLength(1)
    await expect.poll(() => peers(b)).toHaveLength(1)
    const [seenByA] = await peers(a)
    expect(seenByA).toMatchObject({ name: baker.username, outfit: 'coleman' })
    const [seenByB] = await peers(b)
    expect(seenByB).toMatchObject({ name: able.username, outfit: 'player' })
    const idB = await b.evaluate(() => window.__bv?.net.id)
    expect(seenByA.id).toBe(idB)

    // B's figure stands in A's scene once B's first frame lands.
    const figureVisible = () =>
      a.evaluate((id) => {
        const group = window.__bv?.scene.getObjectByName(`peer-${id}`)
        return group ? group.visible : null
      }, idB)
    await expect.poll(figureVisible).toBe(true)

    // B steps 20 m east; A's copy of B follows, and the scope hears it.
    const start = await b.evaluate(() => {
      const { x, z } = window.__bv!.player.pos
      return { x, z }
    })
    await b.evaluate(({ x, z }) => {
      const bv = window.__bv!
      bv.player.relocate(x + 20, z, bv.player.yaw)
    }, start)
    await expect
      .poll(async () => (await peers(a))[0]?.next?.x ?? null)
      .toBeCloseTo(start.x + 20, 0)
    await expect
      .poll(() =>
        a.evaluate((id) => {
          const group = window.__bv?.scene.getObjectByName(`peer-${id}`)
          return group ? group.position.x : null
        }, idB)
      )
      .toBeCloseTo(start.x + 20, 0)

    // B leaves; A's valley empties.
    await contextB.close()
    await expect.poll(() => peers(a)).toHaveLength(0)
    await expect.poll(figureVisible).toBeNull()

    expect(errorsA).toEqual([])
    expect(errorsB).toEqual([])
    await contextA.close()
  }
)
