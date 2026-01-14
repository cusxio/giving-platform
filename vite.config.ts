import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { bundleStats } from 'rollup-plugin-bundle-stats'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode, command }) => {
  return {
    resolve: { dedupe: ['use-sync-external-store'] },
    plugins: [
      tsConfigPaths(),
      tanstackStart({
        start: { entry: 'entry-start.tsx' },
        client: { entry: 'entry-client.tsx' },
        server: { entry: 'entry-server.tsx' },
        router: {
          generatedRouteTree: './route-tree.gen.ts',
          quoteStyle: 'single',
          semicolons: false,
        },
      }),
      mode !== 'test' &&
        nitro({
          plugins: ['./src/server/opentelemetry/nitro'],
          ...(mode === 'production' && {
            preset: 'vercel',
            features: { websocket: true },
            vercel: { functions: { runtime: 'bun1.x', regions: ['sin1'] } },
          }),
        }),
      viteReact(),
      tailwindcss(),
      command === 'build' &&
        mode === 'production' &&
        process.env.CI !== 'true' &&
        bundleStats(),
    ],
    server: {
      port: 3003,
      allowedHosts: mode === 'development' ? true : undefined,
    },
  }
})
