import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { bundleStats } from 'rollup-plugin-bundle-stats'
import { defineConfig } from 'vite'

export default defineConfig(({ mode, command }) => {
  const baseConfig = { resolve: { tsconfigPaths: true } }

  if (mode === 'test') {
    return baseConfig
  }

  return {
    ...baseConfig,
    plugins: [
      tailwindcss(),
      tanstackStart({
        client: { entry: 'entry-client.tsx' },
        router: {
          generatedRouteTree: './route-tree.gen.ts',
          quoteStyle: 'single',
          semicolons: false,
        },
        server: { entry: 'entry-server.tsx' },
        srcDirectory: 'src',
        start: { entry: 'entry-start.tsx' },
      }),
      viteReact(),
      nitro({
        preset: 'vercel',
        // Nitro's Vercel preset only recognizes Node 22 and 24 and otherwise falls back to 24.
        vercel: { functions: { runtime: 'nodejs26.x' } },
      }),
      command === 'build' && mode === 'production' && process.env.CI !== 'true' && bundleStats(),
    ],
    server: { port: 3003, allowedHosts: mode === 'development' ? true : undefined },
  }
})
