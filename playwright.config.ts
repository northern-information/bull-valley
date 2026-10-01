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
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
  },
})
