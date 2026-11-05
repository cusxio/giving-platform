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
      logger.error({ err: new RangeError('boom'), event: 'payment.failed' }, 'Payment failed')
      span.end()
      return span.spanContext().traceId
    })

    const [record] = exporter.getFinishedLogRecords()

    expect(record).toMatchObject({
      attributes: {
        event: 'payment.failed',
        'exception.message': 'boom',
        'exception.type': 'RangeError',
      },
      body: 'Payment failed',
      severityNumber: SeverityNumber.ERROR,
      severityText: 'error',
    })
    expect(record?.attributes).not.toHaveProperty('trace_id')
    expect(record?.spanContext?.traceId).toBe(traceId)
  })

  it('follows a logger provider registered after the stream was created', () => {
    expect.hasAssertions()

    const { exporter: replaced, logger } = setup()
    const current = new InMemoryLogRecordExporter()
    logs.disable()
    logs.setGlobalLoggerProvider(
      new LoggerProvider({ processors: [new SimpleLogRecordProcessor({ exporter: current })] }),
    )

    logger.info('After reload')

    expect(current.getFinishedLogRecords().map((r) => r.body)).toStrictEqual(['After reload'])
    expect(replaced.getFinishedLogRecords()).toHaveLength(0)
  })

  it('keeps a log call that passes its own time field', () => {
    expect.hasAssertions()

    const { exporter, logger } = setup()

    expect(() => {
      logger.info({ time: 'yesterday' }, 'Backfilled')
    }).not.toThrow()
    expect(exporter.getFinishedLogRecords()[0]).toMatchObject({
      attributes: { time: 'yesterday' },
      body: 'Backfilled',
    })
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
