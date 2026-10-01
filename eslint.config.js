import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const unusedVars = [
  'error',
  { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
]

export default defineConfig([
  globalIgnores([
    'dist',
    'node_modules',
    'public/data',
    'test-results',
    'playwright-report',
    'coverage',
  ]),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': unusedVars,
    },
  },
  {
    files: ['*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  // The config files and the geo fetch script stay plain JS.
  {
    files: ['**/*.{js,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': unusedVars,
    },
  },
])
