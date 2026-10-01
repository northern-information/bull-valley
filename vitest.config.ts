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
    },
  },
})
