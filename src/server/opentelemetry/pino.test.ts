import { SeverityNumber, context, logs } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs'
import { TracerProvider } from '@opentelemetry/sdk-trace'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'

import { createOtelLogStream, traceContextMixin } from './pino'

function setup() {
  const exporter = new InMemoryLogRecordExporter()
  context.disable()
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  logs.disable()
  logs.setGlobalLoggerProvider(
    new LoggerProvider({ processors: [new SimpleLogRecordProcessor({ exporter })] }),
  )

  return {
    exporter,
    logger: pino({ mixin: traceContextMixin }, createOtelLogStream()),
    tracer: new TracerProvider().getTracer('test'),
  }
}

describe('pino log bridge', () => {
  it('sends pino records to the logs API inside the active trace', () => {
    expect.hasAssertions()

    const { exporter, logger, tracer } = setup()
    const traceId = tracer.startActiveSpan('request', (span) => {
      logger.error({ err: new Error('boom'), event: 'payment.failed' }, 'Payment failed')
      span.end()
      return span.spanContext().traceId
    })

    const [record] = exporter.getFinishedLogRecords()

    expect(record).toMatchObject({
      attributes: { event: 'payment.failed', 'exception.message': 'boom' },
      body: 'Payment failed',
      severityNumber: SeverityNumber.ERROR,
      severityText: 'error',
    })
    expect(record?.attributes).not.toHaveProperty('trace_id')
    expect(record?.spanContext?.traceId).toBe(traceId)
  })
})

describe('trace context mixin', () => {
  it('adds trace ids to the log line only inside a span', () => {
    expect.hasAssertions()

    const { tracer } = setup()

    expect(traceContextMixin()).toStrictEqual({})

    const fields = tracer.startActiveSpan('request', (span) => {
      span.end()
      return { expected: span.spanContext(), mixin: traceContextMixin() }
    })

    expect(fields.mixin).toStrictEqual({
      span_id: fields.expected.spanId,
      trace_flags: '01',
      trace_id: fields.expected.traceId,
    })
  })
})
