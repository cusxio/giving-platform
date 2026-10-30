import type { KnipConfig } from 'knip'

export default {
  entry: [
    './src/router.tsx',
    './src/entry-server.tsx',
    './src/entry-client.tsx',
    './src/route-tree.gen.ts',
  ],
  vitest: { entry: ['**/*.test.ts'] },
} satisfies KnipConfig
