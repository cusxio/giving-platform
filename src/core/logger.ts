// Import ensures Vite bundles pino for OpenTelemetry instrumentation via createRequire
import 'pino'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const { pino } = require('pino') as typeof import('pino')

export const logger = pino({
  ...(import.meta.env.DEV && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})
