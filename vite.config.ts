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
        plugins: ['./src/server/opentelemetry/nitro'],
        // Keep the full pino package available for the runtime CommonJS require
        // used in src/core/logger.ts for OpenTelemetry pino instrumentation.
        traceDeps: ['pino*'],
      }),
      command === 'build' && mode === 'production' && process.env.CI !== 'true' && bundleStats(),
    ],
    server: { port: 3003, allowedHosts: mode === 'development' ? true : undefined },
  }
})
