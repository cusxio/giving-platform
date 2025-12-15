import eslintReact from '@eslint-react/eslint-plugin'
import eslintJs from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import pluginQuery from '@tanstack/eslint-plugin-query'
import pluginRouter from '@tanstack/eslint-plugin-router'
import gitignore from 'eslint-config-flat-gitignore'
import prettier from 'eslint-config-prettier'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { importX } from 'eslint-plugin-import-x'
import perfectionist from 'eslint-plugin-perfectionist'
import reactHooks from 'eslint-plugin-react-hooks'
import reactYouMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect'
import unicorn from 'eslint-plugin-unicorn'
import { defineConfig } from 'eslint/config'
import { configs as tsEslintConfigs } from 'typescript-eslint'

export default defineConfig([
  gitignore(),
  { ignores: ['src/route-tree.gen.ts'] },
  { files: ['eslint.config.mts'] },
  {
    extends: [
      eslintJs.configs.recommended,
      prettier,
      perfectionist.configs['recommended-natural'],
      unicorn.configs.recommended,
    ],
    rules: {
      'perfectionist/sort-objects': 'off',
      'perfectionist/sort-switch-case': 'off',
      'perfectionist/sort-modules': ['error', { partitionByComment: true }],
      // 'perfectionist/sort-named-imports': [
      //   'error',
      //   { groups: ['type-import', 'value-import'] },
      // ],
      'perfectionist/sort-imports': [
        'error',
        {
          groups: [
            'type-import',
            ['type-builtin', 'value-builtin'],
            ['type-external', 'value-external'],
            ['type-subpath', 'value-subpath'],
            ['type-internal', 'value-internal'],
            ['type-parent', 'value-parent'],
            ['type-sibling', 'value-sibling'],
            ['type-index', 'value-index'],
            'value-style',
            'ts-equals-import',
            'unknown',
          ],
        },
      ],
      'unicorn/filename-case': [
        'error',
        { case: 'kebabCase', ignore: [/^-.*/, /^\$.*/] },
      ],
      'unicorn/no-array-sort': 'off',
      'unicorn/no-nested-ternary': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-global-this': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/prevent-abbreviations': 'off',
    },
  },
  {
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ project: 'tsconfig.json' }),
      ],
    },
    // @ts-expect-error https://github.com/un-ts/eslint-plugin-import-x/issues/421
    plugins: { 'import-x': importX },
    extends: ['import-x/flat/recommended', 'import-x/flat/typescript'],
    rules: {
      'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],
      // 'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      tsEslintConfigs.strictTypeChecked,
      tsEslintConfigs.stylisticTypeChecked,
      pluginRouter.configs['flat/recommended'],
      pluginQuery.configs['flat/recommended'],
    ],
    rules: {
      // '@typescript-eslint/consistent-type-imports': [
      //   'error',
      //   {
      //     fixStyle: 'separate-type-imports',
      //     prefer: 'type-imports',
      //     disallowTypeAnnotations: true,
      //   },
      // ],
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
      '@typescript-eslint/no-unnecessary-condition': [
        'error',
        { allowConstantLoopConditions: 'only-allowed-literals' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/only-throw-error': [
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
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],
      '@typescript-eslint/strict-boolean-expressions': ['error'],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { stylistic },
    extends: [
      eslintReact.configs['recommended-type-checked'],
      reactHooks.configs.flat['recommended-latest'],
      reactYouMightNotNeedAnEffect.configs.recommended,
    ],
    rules: {
      'stylistic/jsx-child-element-spacing': 'error',
      'stylistic/jsx-curly-brace-presence': [
        'error',
        { propElementValues: 'always' },
      ],
      'stylistic/jsx-self-closing-comp': 'error',
    },
  },
])
