import { devices, expect, test } from '@playwright/test'
import { copy } from './copy.ts'
import { watchErrors } from './fixtures.ts'
import type { Browser, Page } from '@playwright/test'

// What the Bull Valley Dial-Up specs share (dialup.spec.ts, and
// dialin.spec.ts for the ones that drive a 3D raider beside the phone):
// pages that fail the spec on a console error or an uncaught page error,
// as the `page` fixture does for the other specs, a phone, and the tap
// through the modem.

export interface PhonePages {
  open: (
    browser: Browser,
    options?: Parameters<Browser['newContext']>[0]
  ) => Promise<Page>
  phone: (browser: Browser) => Promise<Page>
}

// Registers the spec file's error check on every page it opens, phone or
// desk, and hands back the openers.
export function phonePages(): PhonePages {
  let errors: string[][] = []
  test.beforeEach(() => {
    errors = []
  })
  test.afterEach(() => {
    expect(errors.flat()).toEqual([])
  })
  const open: PhonePages['open'] = async (browser, options) => {
    const page = await (await browser.newContext(options)).newPage()
    errors.push(watchErrors(page))
    return page
  }
  return {
    open,
    // Chromium's own mobile emulation, so the full Chromium the other
    // specs drive does the work.
    phone: (browser) => {
      const { defaultBrowserType: _, ...pixel } = devices['Pixel 5']
      return open(browser, pixel)
    },
  }
}

// Tap through the modem: one tap dials, a second skips the handshake.
export async function dialIn(page: Page): Promise<void> {
  const modem = page.locator('.bv-modem')
  await expect(modem).toContainText(copy('dialup.tap'))
  await modem.click()
  await modem.click()
  await expect(page.locator('.bv-dial')).toBeVisible({ timeout: 15_000 })
}
