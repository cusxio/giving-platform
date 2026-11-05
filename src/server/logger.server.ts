import { pino } from 'pino'

import { createOtelLogStream, traceContextMixin } from '#/server/opentelemetry/pino.server'

async function createStdoutStream() {
  if (import.meta.env.MODE === 'development') {
    const { default: pretty } = await import('pino-pretty')
    return pretty({ colorize: true })
  }

  return pino.destination(1)
}

// Multistream entries default to `info`, so open them fully and let the logger's level filter.
export const logger = pino(
  { mixin: traceContextMixin },
  pino.multistream([
    { level: 'trace', stream: await createStdoutStream() },
    { level: 'trace', stream: createOtelLogStream() },
  ]),
)
