import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // The Durable Object extends a class from the Workers runtime; the
      // unit tests run in Node with a stub base class and mock sockets.
      'cloudflare:workers': fileURLToPath(
        new URL('./tests/worker/stubs/cloudflare-workers.ts', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/worker/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      // Report every source file, not only the ones a test imports, so the
      // Three and DOM modules show up at 0% instead of not at all.
      include: ['src/**/*.ts', 'worker/**/*.ts'],
      // The pure modules carry the game rules and run in Node, so each one
      // must stay well covered. The Three and DOM modules are covered by
      // the e2e specs instead, and have no threshold here.
      thresholds: {
        'src/{account,auth,bindings,cabbages,characters,chat,clock,cookies,coords,copy,copybook,cycle,daily,drinks,finishes,ground,hands,hotbar,interactions,inventory,items,maze,mist,outfits,packgrid,poses,presence,protocol,raid,raidsync,rng,roadgraph,roadside,shadowmen,shadowsync,shop,splashmachine,store,walls}.ts':
          {
            perFile: true,
            statements: 85,
            lines: 90,
            functions: 90,
            branches: 50,
          },
      },
    },
  },
})
