import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      // Report every source file, not only the ones a test imports, so the
      // Three and DOM modules show up at 0% instead of not at all.
      include: ['src/**/*.ts'],
      // The pure modules carry the game rules and run in Node, so each one
      // must stay well covered. The Three and DOM modules are covered by
      // the e2e specs instead, and have no threshold here.
      thresholds: {
        'src/{cabbages,carousel,characters,coords,drinks,ground,interactions,inventory,items,outfits,poses,raid,rng,roadgraph,shop,splashmachine}.ts':
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
