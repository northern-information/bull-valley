import { defineConfig, devices } from '@playwright/test'

// E2E runs against the Vite dev server, never `preview`: the dev hooks
// (window.__bv, window.__akashic) and the webdriver pointer-lock bypass
// exist only in dev builds.
const PORT = 5175

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
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
    reuseExistingServer: !process.env.CI,
  },
})
