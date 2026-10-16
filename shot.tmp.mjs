import { chromium } from '@playwright/test'
const SP = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto('http://localhost:5176/?skipSplash&valley=mapshot1')
await page.waitForFunction(() => !!window.__bv?.valley, null, { timeout: 180000 })
await page.waitForTimeout(2000)
await page.locator('[data-bv="begin"]').click()
await page.waitForFunction(() => window.__bv.citgos.last !== null, null, { timeout: 60000 })
const home = await page.evaluate(() => window.__bv.citgos.last)
// Visit two more Citgos.
for (const i of [(home + 3) % 15, (home + 7) % 15]) {
  await page.evaluate((i) => { const bv = window.__bv; const at = bv.world.fuelPoints[i]; bv.player.relocate(at.x + 2, at.z + 2, 0) }, i)
  await page.waitForFunction((i) => window.__bv.citgos.visited.includes(i), i, { timeout: 60000 })
}
// Back out in the valley, then the portal.
await page.evaluate(() => { const bv = window.__bv; bv.calm(); bv.teleport(0.48, 0.52) })
await page.waitForTimeout(1500)
await page.keyboard.press('q')
await page.waitForFunction(() => window.__bv.myPortal !== null, null, { timeout: 90000 })
await page.waitForTimeout(500)
await page.screenshot({ path: SP + '/portal.png' })
await page.keyboard.press('m')
await page.waitForTimeout(1500)
await page.screenshot({ path: SP + '/map.png' })
console.log(JSON.stringify(await page.evaluate(() => ({ c: window.__bv.citgos, chat: window.__bv.chat.slice(-6).map((l) => l.text) }))))
await browser.close()
