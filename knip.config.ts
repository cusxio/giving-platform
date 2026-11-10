import type { KnipConfig } from 'knip'

export default {
  entry: ['./src/entry-server.tsx', './src/entry-client.tsx', './src/route-tree.gen.ts'],
  // moon's built-in command for tasks that only run their deps.
  ignoreBinaries: ['noop'],
  ignoreDependencies: [
    // Run by the commit-msg hook in .moon/workspace.yml, which knip does not read.
    '@commitlint/cli',
  ],
  vitest: { entry: ['**/*.test.ts'] },
} satisfies KnipConfig
