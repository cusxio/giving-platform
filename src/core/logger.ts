import { createRequire } from 'node:module'

import type pinoModule from 'pino'

const require = createRequire(import.meta.url)
const pino = require('pino') as typeof pinoModule

// Do not set `NITRO_TRACE_PINO` in any environment.
//
// This branch is intentionally never enabled at runtime. It is a build-time hint
// for Nitro's dependency tracer: the static `import('pino')` makes Nitro include
// pino in `.vercel/output/functions/__server.func/node_modules`, while the real logger still uses
// `createRequire(...)("pino")` so OpenTelemetry's pino instrumentation can patch
// the CommonJS require path correctly.
if (process.env.NITRO_TRACE_PINO === 'true') {
  void import('pino')
}

const options: pinoModule.LoggerOptions = {}

if (import.meta.env.MODE === 'development') {
  options.transport = { target: 'pino-pretty', options: { colorize: true } }
}

export const logger = pino(options)
