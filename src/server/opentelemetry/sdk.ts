import { DiagConsoleLogger, DiagLogLevel, diag, metrics } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import type { Resource } from '@opentelemetry/resources'
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources'
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs'
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs'
import type { MetricReader } from '@opentelemetry/sdk-metrics'
import {
  ConsoleMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import type { SpanProcessor } from '@opentelemetry/sdk-trace-node'
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

import {
  OTEL_LOGS_EXPORTER,
  OTEL_LOG_LEVEL,
  OTEL_METRICS_EXPORTER,
  OTEL_TRACES_EXPORTER,
} from '#/envvars'

export class Sdk {
  #initialized = false
  readonly #loggerProvider: LoggerProvider
  readonly #meterProvider: MeterProvider
  readonly #resource: Resource
  readonly #traceProvider: NodeTracerProvider

  constructor() {
    this.#resource = defaultResource().merge(
      resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'collective-backend' }),
    )

    // Traces
    const tracesExporters = processExporter(OTEL_TRACES_EXPORTER)
    const spanProcessors: SpanProcessor[] = []
    if (tracesExporters.includes('console')) {
      spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()))
    }
    if (tracesExporters.includes('otlp')) {
      spanProcessors.push(new BatchSpanProcessor(new OTLPTraceExporter()))
    }
    this.#traceProvider = new NodeTracerProvider({ resource: this.#resource, spanProcessors })

    // Logs
    const logsExporters = processExporter(OTEL_LOGS_EXPORTER)
    const logRecordProcessors: LogRecordProcessor[] = []
    if (logsExporters.includes('console')) {
      logRecordProcessors.push(new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()))
    }
    if (logsExporters.includes('otlp')) {
      logRecordProcessors.push(new BatchLogRecordProcessor(new OTLPLogExporter()))
    }
    this.#loggerProvider = new LoggerProvider({
      processors: logRecordProcessors,
      resource: this.#resource,
    })

    // Metrics
    const metricsExporters = processExporter(OTEL_METRICS_EXPORTER)
    const metricsReaders: MetricReader[] = []
    if (metricsExporters.includes('console')) {
      metricsReaders.push(
        new PeriodicExportingMetricReader({ exporter: new ConsoleMetricExporter() }),
      )
    }
    if (metricsExporters.includes('otlp')) {
      metricsReaders.push(new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }))
    }
    this.#meterProvider = new MeterProvider({ readers: metricsReaders, resource: this.#resource })
  }

  async shutdown() {
    await Promise.all([
      this.#traceProvider.shutdown(),
      this.#loggerProvider.shutdown(),
      this.#meterProvider.shutdown(),
    ])
  }

  start() {
    if (this.#initialized) {
      return
    }

    this.#initialized = true

    this.#traceProvider.register()

    logs.setGlobalLoggerProvider(this.#loggerProvider)

    metrics.setGlobalMeterProvider(this.#meterProvider)

    registerInstrumentations({ instrumentations: [getNodeAutoInstrumentations()] })

    if (OTEL_LOG_LEVEL !== undefined) {
      const logLevel = OTEL_LOG_LEVEL.toUpperCase()

      if (Object.hasOwn(DiagLogLevel, logLevel)) {
        diag.setLogger(new DiagConsoleLogger(), DiagLogLevel[logLevel as keyof typeof DiagLogLevel])
      }
    }

    diag.info('otel: started')
  }
}

function processExporter(exporter: string) {
  return exporter.split(',').map((v) => v.trim())
}
