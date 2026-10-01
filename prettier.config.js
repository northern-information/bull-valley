/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config}
 */
const config = {
  trailingComma: 'es5',
  tabWidth: 2,
  semi: false,
  singleQuote: true,
  plugins: ['@ianvs/prettier-plugin-sort-imports'],
  importOrder: [
    '<BUILTIN_MODULES>',
    '<THIRD_PARTY_MODULES>',
    '^[./]',
    '<TYPES>',
  ],
  importOrderTypeScriptVersion: '6.0.0',
  importOrderCaseSensitive: false,
  overrides: [
    {
      files: ['*.html', '*.md'],
      options: {
        singleQuote: false,
      },
    },
  ],
}

export default config
