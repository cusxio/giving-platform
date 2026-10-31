import { defineConfig } from 'oxlint'

interface ImportPattern {
  readonly group?: string[]
  readonly message: string
  readonly regex?: string
}

// Import boundaries. An override replaces the rule's whole pattern list, so each zone below
// composes these constants instead of repeating them.

// Any path below a module except exactly `server`. Spelled out because oxlint lets a `!` group
// entry allow the import past every other pattern too, and its regex has no lookahead.
const MODULE_ENTRY_ONLY: ImportPattern = {
  message:
    'Import another module only through #/modules/<name> (client) or #/modules/<name>/server (server).',
  regex: String.raw`^#/modules/[^/]+/([^s]|s([^e]|$)|se([^r]|$)|ser([^v]|$)|serv([^e]|$)|serve([^r]|$)|server.)`,
}
const NO_RELATIVE_INTO_MODULES: ImportPattern = {
  message: 'Reach a module through its #/modules/<name> entry, not a relative path.',
  regex: String.raw`(^|/)\.\./(.*/)?modules/`,
}
const FLAT_MODULES: ImportPattern = {
  message:
    'Modules are flat: import siblings with ./ and other modules through #/modules/<name>/server.',
  regex: String.raw`^\.\./`,
}
const SQL_IN_REPOSITORIES: ImportPattern = {
  group: ['drizzle-orm', 'drizzle-orm/*', '#/server/schema.server', '#/server/sql.server'],
  message:
    'SQL lives in *.repository.server.ts. Export a defineQuery factory there and run it with deps.db.',
}
const PLATFORM_INTERNALS: ImportPattern = {
  group: ['#/server/env.server', '#/server/logger.server', '#/server/neon.server'],
  message:
    'Env, the root logger and the neon clients stay in src/server/. Take them from deps (Pick<Deps, ...>).',
}
const SERVER_CODE_IN_CLIENT: ImportPattern = {
  group: ['#/server/**', '#/modules/*/server'],
  message:
    'Client code never imports server code, even types. Import client-safe types from #/modules/<name>.',
}
const NO_REPOSITORY_IN_FUNCTIONS: ImportPattern = {
  message: 'A server function calls a *.server.ts workflow, never a repository.',
  regex: String.raw`\.repository\.server$`,
}

const restrictImports = (
  ...patterns: ImportPattern[]
): { 'eslint/no-restricted-imports': ['error', { patterns: ImportPattern[] }] } => ({
  'eslint/no-restricted-imports': ['error', { patterns }],
})
const EVERYWHERE = [MODULE_ENTRY_ONLY, NO_RELATIVE_INTO_MODULES]
const OUTSIDE_PLATFORM = [...EVERYWHERE, SQL_IN_REPOSITORIES, PLATFORM_INTERNALS]

// Files that break a boundary today because their code has not moved into src/modules yet.
// They keep only the module-entry rules. Each Phase 1 step deletes the entries it fixes, and
// the list must end empty.
const LEGACY_FILES: string[] = ['src/core/errors.ts']

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
    'eslint/one-var': 'off',
    'eslint/sort-imports': 'off',
    'eslint/sort-keys': 'off',

    // Size and complexity limits are intentionally not enforced globally.
    'eslint/max-classes-per-file': 'off',
    'eslint/max-lines': 'off',
    'eslint/max-lines-per-function': 'off',
    'eslint/max-params': 'off',
    'eslint/max-statements': 'off',
    'unicorn/max-nested-calls': 'off',

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
    'unicorn/filename-case': [
      'error',
      { ignore: [String.raw`^\$[A-Za-z][A-Za-z0-9]*\.(?:ts|tsx|js|jsx)$`] },
    ],
    'unicorn/no-null': 'off',
    // Its fix swaps parseInt/parseFloat for Number, which parses user-entered amounts differently.
    'unicorn/prefer-number-coercion': 'off',

    ...restrictImports(...OUTSIDE_PLATFORM),

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
        // Recharts takes render functions as props (`<Tooltip content={...}>`).
        'react/no-unstable-nested-components': ['error', { allowAsProps: true }],
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
    { files: ['src/server/**'], rules: restrictImports(...EVERYWHERE) },
    {
      files: ['src/routes/**', 'src/components/**', 'src/hooks/**', 'src/core/**'],
      rules: restrictImports(...OUTSIDE_PLATFORM, SERVER_CODE_IN_CLIENT),
    },
    { files: ['src/routes/api/**'], rules: restrictImports(...OUTSIDE_PLATFORM) },
    { files: ['src/modules/**'], rules: restrictImports(...OUTSIDE_PLATFORM, FLAT_MODULES) },
    {
      files: ['src/modules/**/*.repository.server.ts'],
      rules: restrictImports(...EVERYWHERE, FLAT_MODULES, PLATFORM_INTERNALS),
    },
    {
      files: ['src/modules/**/*.functions.ts'],
      rules: restrictImports(...OUTSIDE_PLATFORM, FLAT_MODULES, NO_REPOSITORY_IN_FUNCTIONS),
    },
    { files: LEGACY_FILES, rules: restrictImports(...EVERYWHERE) },
  ],
})
