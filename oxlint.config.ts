import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'error',
    pedantic: 'error',
    perf: 'error',
    style: 'error',
    suspicious: 'error',
  },
  env: { browser: true, builtin: true, node: true },
  ignorePatterns: [
    'node_modules/**',
    '.moon/**',
    '.agents/**',
    '.claude/**',
    '.vercel/**',
    '.output/**',
    'src/route-tree.gen.ts',
  ],
  options: { typeAware: true },
  plugins: ['unicorn', 'oxc', 'import', 'promise', 'eslint'],
  rules: {
    // Formatting and style opinions handled by the project/codebase conventions.
    'eslint/func-style': 'off',
    'eslint/no-continue': 'off',
    'eslint/no-inline-comments': 'off',
    'eslint/no-magic-numbers': 'off',
    'eslint/no-ternary': 'off',
    'eslint/sort-imports': 'off',
    'eslint/sort-keys': 'off',

    // Size and complexity limits are intentionally not enforced globally.
    'eslint/max-classes-per-file': 'off',
    'eslint/max-lines': 'off',
    'eslint/max-lines-per-function': 'off',
    'eslint/max-params': 'off',
    'eslint/max-statements': 'off',

    // Naming and comments.
    'eslint/capitalized-comments': 'off',
    'eslint/id-length': 'off',
    'eslint/new-cap': 'off',
    'eslint/no-underscore-dangle': ['error', { allow: ['__error'] }],

    // JavaScript/ESLint correctness tweaks.
    'eslint/init-declarations': 'off',
    'eslint/no-duplicate-imports': 'off',
    'eslint/no-shadow': 'off',

    // Covered by TypeScript/tsc in this all-TypeScript project.
    'eslint/constructor-super': 'off',
    'eslint/getter-return': 'off',
    'eslint/no-class-assign': 'off',
    'eslint/no-const-assign': 'off',
    'eslint/no-dupe-class-members': 'off',
    'eslint/no-func-assign': 'off',
    'eslint/no-import-assign': 'off',
    'eslint/no-new-native-nonconstructor': 'off',
    'eslint/no-obj-calls': 'off',
    'eslint/no-redeclare': 'off',
    'eslint/no-setter-return': 'off',
    'eslint/no-this-before-super': 'off',
    'eslint/no-unused-vars': 'off',

    // Module export/import preferences.
    'import/exports-last': 'off',
    'import/group-exports': 'off',
    'import/max-dependencies': 'off',
    'import/no-named-export': 'off',
    'import/no-namespace': 'off',
    'import/prefer-default-export': 'off',

    // Covered by TypeScript's module checking in this all-TypeScript project.
    'import/default': 'off',
    'import/namespace': 'off',

    // This is a full-stack app, so Node.js built-ins are valid in server code.
    'import/no-nodejs-modules': 'off',

    // Unicorn.
    'unicorn/filename-case': ['error', { ignore: '^\\$[A-Za-z][A-Za-z0-9]*\\.(?:ts|tsx|js|jsx)$' }],
    'unicorn/no-null': 'off',

    // Promise rules.
    'promise/always-return': ['error', { ignoreLastCallback: true }],
    'promise/avoid-new': 'off',
    'promise/prefer-await-to-callbacks': 'off',
    'promise/prefer-await-to-then': 'off',
    'promise/prefer-catch': 'off',
  },
  overrides: [
    {
      files: ['**/*.{test,spec}.{ts,tsx}', 'src/tests/**/*.{ts,tsx}'],
      plugins: ['vitest'],
      rules: {
        'vitest/no-importing-vitest-globals': 'off',
        'vitest/prefer-importing-vitest-globals': 'error',
        'vitest/prefer-to-be-falsy': 'off',
        'vitest/prefer-to-be-truthy': 'off',
      },
    },
    {
      files: ['**/*.tsx'],
      plugins: ['react', 'react-perf', 'jsx-a11y'],
      rules: {
        // JSX accessibility.
        'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],

        // React preferences.
        'react/jsx-max-depth': 'off',
        'react/jsx-props-no-spreading': 'off',
        'react/react-in-jsx-scope': 'off',

        // React performance rules that are too noisy for this codebase.
        'react-perf/jsx-no-jsx-as-prop': 'off',
        'react-perf/jsx-no-new-array-as-prop': 'off',
        'react-perf/jsx-no-new-function-as-prop': 'off',
        'react-perf/jsx-no-new-object-as-prop': 'off',
      },
    },
    {
      files: ['**/*.{ts,tsx}'],
      plugins: ['typescript'],
      rules: {
        // TypeScript-specific equivalents or stricter variants.
        'eslint/no-throw-literal': 'off',
        'eslint/require-await': 'off',
        'typescript/no-empty-interface': ['error', { allowSingleExtends: true }],
        'typescript/no-unsafe-type-assertion': 'off',
        'typescript/prefer-readonly-parameter-types': 'off',

        // TanStack Router uses thrown control-flow objects for redirects and 404s.
        'typescript/only-throw-error': [
          'error',
          {
            allow: [
              {
                from: 'package',
                package: '@tanstack/router-core',
                name: ['Redirect', 'NotFoundError'],
              },
            ],
          },
        ],
      },
    },
  ],
})
