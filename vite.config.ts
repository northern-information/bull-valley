import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  // The Worker and its Durable Object run in workerd beside the dev server,
  // so `npm run dev` is the whole stack. Dev state (who was in the valley)
  // persists under .wrangler/state, except under e2e, where each run starts
  // from an empty valley.
  plugins: [cloudflare({ persistState: mode !== 'test' })],
  server: { port: 5174 },
  build: { outDir: 'dist', emptyOutDir: true },
}))
