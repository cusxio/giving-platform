import { defineConfig } from 'oxfmt'

export default defineConfig({
  ignorePatterns: [
    '.moon/**',
    '.agents/**',
    '.claude/**',
    '.output/**',
    '.vercel/**',
    'node_modules/**',
    'src/route-tree.gen.ts',
  ],
  objectWrap: 'collapse',
  semi: false,
  singleQuote: true,
  sortImports: {
    groups: [
      'side_effect',
      ['type-builtin', 'value-builtin'],
      ['type-external', 'value-external'],
      ['type-subpath', 'value-subpath'],
      ['type-internal', 'value-internal'],
      ['type-parent', 'value-parent'],
      ['type-sibling', 'value-sibling'],
      ['type-index', 'value-index'],
      'style',
      'unknown',
    ],
  },
  sortPackageJson: { sortScripts: true },
  sortTailwindcss: { functions: ['cx'], stylesheet: './src/styles/globals.css' },
})
