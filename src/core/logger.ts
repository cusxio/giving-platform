import { pino } from 'pino'

import { createOtelLogStream, traceContextMixin } from '#/server/opentelemetry/pino'

async function createStdoutStream() {
  if (import.meta.env.MODE === 'development') {
    const { default: pretty } = await import('pino-pretty')
    return pretty({ colorize: true })
  }

  return pino.destination(1)
}

export const logger = pino(
  { mixin: traceContextMixin },
  pino.multistream([{ stream: await createStdoutStream() }, { stream: createOtelLogStream() }]),
)
