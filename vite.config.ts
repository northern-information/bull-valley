import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  // The Worker, its Durable Object, and the accounts database run in workerd
  // beside the dev server, so `npm run dev` is the whole stack. Dev state
  // (who was in the valley, who has an account) persists under
  // .wrangler/state. Under e2e it goes to .wrangler/state-test instead,
  // which the Playwright server command empties and migrates before every
  // run, so each run starts from an empty valley with the schema in place.
  plugins: [
    cloudflare({
      persistState: mode === 'test' ? { path: '.wrangler/state-test' } : true,
    }),
  ],
  server: { port: 5174 },
  build: { outDir: 'dist', emptyOutDir: true },
}))
