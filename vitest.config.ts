import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The modules the unit tests cannot load or cannot cover: the Three and DOM
// glue (the scene, the HUD and its dialogs, the rigs, the input and the
// frame), the canvas art (every painter draws on a document canvas), the
// socket (net.ts) and the music (an <audio>). The e2e specs cover these
// instead. Everything else under src/ is a pure module carrying the game's
// rules, and gets the floor below: a new module is floored unless it is
// listed here.
const THREE_AND_DOM = [
  'accountpanel',
  'actions',
  'adart',
  'akashic',
  'akashicassets',
  'akashicmap',
  'assetkit',
  'assets',
  'berrybush',
  'billart',
  'bookhud',
  'bookportraits',
  'cabbagestandmodel',
  'canart',
  'canvas',
  'caretakermodel',
  'caretakerrig',
  'characterselect',
  'citgo',
  'cornmazeparts',
  'corpsemeshes',
  'decalart',
  'devhook',
  'dishes',
  'drinkmodels',
  'dropmeshes',
  'figure',
  'fire',
  'fog',
  'fphands',
  'game',
  'glow',
  'graveart',
  'gravestones',
  'grondialog',
  'hud',
  'input',
  'itemthumbs',
  'levelhud',
  'loop',
  'main',
  'mainmenu',
  'mazeart',
  'medart',
  'medicinemodels',
  'mistcards',
  'mudart',
  'musicrig',
  'net',
  'packart',
  'peers',
  'pickups',
  'player',
  'playerbody',
  'props',
  'ps1',
  'roadsideparts',
  'scope',
  'seasonhud',
  'settingsui',
  'shadowburst',
  'shadowburstmodel',
  'shadowcards',
  'shadowspider',
  'signin',
  'skeletonhorse',
  'sky',
  'splash',
  'standart',
  'standdialog',
  'surfaces',
  'targets',
  'taskhud',
  'terrain',
  'titles',
  'trails',
  'truck',
  'truckbody',
  'valleysync',
  'world',
  'wreck',
]

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
      // must stay well covered: every module under src/ but the Three and
      // DOM ones above (a picomatch exclusion, matched against the path
      // from the repo root).
      thresholds: {
        [`src/!(${THREE_AND_DOM.join('|')}).ts`]: {
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
