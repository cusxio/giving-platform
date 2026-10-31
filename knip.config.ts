import type { KnipConfig } from 'knip'

export default {
  // The drizzle plugin loads drizzle.config.ts, which needs the database env; CI has none.
  drizzle: false,
  entry: [
    './src/entry-server.tsx',
    './src/entry-client.tsx',
    './src/route-tree.gen.ts',
    './drizzle.config.ts',
  ],
  // moon's built-in command for tasks that only run their deps.
  ignoreBinaries: ['noop'],
  ignoreDependencies: [
    // Run by the commit-msg hook in .moon/workspace.yml, which knip does not read.
    '@commitlint/cli',
    // Unused. Removing it rewrites pnpm-lock.yaml, so the owner removes it and this entry.
    'msw',
  ],
  vitest: { entry: ['**/*.test.ts'] },
} satisfies KnipConfig
