import type { KnipConfig } from 'knip'

export default {
  ignore: ['./dist/**/*'],
  ignoreDependencies: ['@react-email/preview-server', '@types/eslint'],
  entry: [
    './src/router.tsx',
    './src/entry-server.tsx',
    './src/entry-client.tsx',
    './src/route-tree.gen.ts',
    './src/server/opentelemetry/nitro.ts',
  ],
  msw: { entry: ['**/tests/setup.ts'] },
  vitest: { entry: ['**/*.test.ts'] },
} satisfies KnipConfig
