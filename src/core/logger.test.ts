import { logs } from '@opentelemetry/api'
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs'
import { describe, expect, it } from 'vitest'

describe('logger', () => {
  it('sends debug logs to OpenTelemetry once the level allows them', async () => {
    expect.hasAssertions()

    const exporter = new InMemoryLogRecordExporter()
    logs.disable()
    logs.setGlobalLoggerProvider(
      new LoggerProvider({ processors: [new SimpleLogRecordProcessor({ exporter })] }),
    )
    const { logger } = await import('./logger')

    logger.level = 'debug'
    logger.debug('Checking session')

    expect(exporter.getFinishedLogRecords().map((r) => r.body)).toStrictEqual(['Checking session'])
  })
})
