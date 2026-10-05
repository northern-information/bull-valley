import { defineConfig, devices } from '@playwright/test'

// E2E runs against the Vite dev server, never `preview`: the dev hooks
// (window.__bv, window.__akashic) and the webdriver pointer-lock bypass
// exist only in dev builds.
const PORT = 5175

// CI runners have no GPU, so WebGL runs in software and every step is
// slower. Each spec took about 3 times as long there as on a laptop.
const CI = !!process.env.CI

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  timeout: CI ? 120_000 : 30_000,
  expect: { timeout: CI ? 30_000 : 5_000 },
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Full Chromium in headless mode keeps GPU WebGL (about 60 fps).
        // The default headless shell falls back to SwiftShader at about
        // 2 fps, too slow to drive a raid.
        channel: 'chromium',
      },
    },
  ],
  webServer: {
    // --mode test keeps the valley server's state in .wrangler/state-test
    // (vite.config.ts). Emptying it and applying the accounts migration
    // first means every run starts from an empty valley and an empty
    // accounts database. Dev hooks stay on in any dev mode.
    command: [
      'rm -rf .wrangler/state-test',
      'npx wrangler d1 migrations apply bull-valley-accounts --local --persist-to .wrangler/state-test -c wrangler.jsonc',
      `npx vite --port ${PORT} --strictPort --mode test`,
    ].join(' && '),
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
  },
})
