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
      // Report every source file, not only the ones a test imports. A file
      // no test imports is listed with 0 of 0 statements, which reads as
      // 100%, so a floor below says nothing of a module no test loads:
      // give every module listed there a test.
      include: ['src/**/*.ts', 'worker/**/*.ts'],
      // The pure modules carry the game rules and run in Node, so each one
      // must stay well covered. The Three and DOM modules are covered by
      // the e2e specs instead, and have no threshold here.
      thresholds: {
        'src/{account,auth,bindings,book,cabbages,caretaker,characters,chat,clock,cookies,coords,copy,copybook,corpses,cosmetics,cycle,daily,dailytask,dealer,donuts,drinks,drops,emotes,finishes,friends,geometrie,graves,ground,hands,hotbar,interactions,inventory,items,keys,landmarks,mapedit,marx,maze,mist,music,names,npcs,outfits,packgrid,poses,presence,progression,protocol,quests,rng,roadgraph,roadside,season,settings,shadowmen,shadowsync,sharedworld,shop,splashmachine,stand,stash,store,stripmall,trip,truckplan,tunnelshades,undercroft,walls,waterside,worldsync}.ts':
          {
            perFile: true,
            statements: 85,
            lines: 90,
            functions: 90,
            branches: 50,
          },
        // The Worker: the valley, the accounts and the money.
        'worker/*.ts': {
          perFile: true,
          statements: 85,
          lines: 90,
          functions: 85,
          branches: 75,
        },
      },
    },
  },
})
