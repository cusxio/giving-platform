import {
  DiagConsoleLogger,
  DiagLogLevel,
  context,
  diag,
  logs,
  propagation,
  trace,
} from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources'
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs'
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs'
import type { SpanProcessor } from '@opentelemetry/sdk-trace'
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

import { OTEL_LOGS_EXPORTER, OTEL_LOG_LEVEL, OTEL_TRACES_EXPORTER } from '#/server/env.server'

export interface Telemetry {
  flush: () => Promise<void>
}

// The dev server re-evaluates server modules on edit without running HMR dispose
// callbacks, so each start releases whatever the previous evaluation registered.
const RELEASE_PREVIOUS = Symbol.for('giving-platform.telemetry.release')
const registry = globalThis as { [RELEASE_PREVIOUS]?: () => void }

export function startTelemetry(): Telemetry {
  registry[RELEASE_PREVIOUS]?.()
  setDiagLogLevel(OTEL_LOG_LEVEL)

  const resource = defaultResource().merge(
    resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'collective-backend' }),
  )

  const tracerProvider = new TracerProvider({
    resource,
    spanProcessors: exportersOf(OTEL_TRACES_EXPORTER).map((exporter): SpanProcessor =>
      exporter === 'console'
        ? new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() })
        : new BatchSpanProcessor({ exporter: new OTLPTraceExporter() }),
    ),
  })

  const loggerProvider = new LoggerProvider({
    processors: exportersOf(OTEL_LOGS_EXPORTER).map((exporter): LogRecordProcessor =>
      exporter === 'console'
        ? new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() })
        : new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() }),
    ),
    resource,
  })

  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  )
  trace.setGlobalTracerProvider(tracerProvider)
  logs.setGlobalLoggerProvider(loggerProvider)

  // Subscribes to undici's diagnostics channels rather than patching modules, so it
  // still sees `fetch` calls after Nitro bundles the server.
  const undici = new UndiciInstrumentation()
  undici.enable()

  registry[RELEASE_PREVIOUS] = () => {
    undici.disable()
    trace.disable()
    logs.disable()
    propagation.disable()
    context.disable()
    diag.disable()
    void Promise.all([tracerProvider.shutdown(), loggerProvider.shutdown()])
  }

  return {
    flush: async () => {
      await Promise.all([tracerProvider.forceFlush(), loggerProvider.forceFlush()])
    },
  }
}

function exportersOf(value: string) {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v): v is 'console' | 'otlp' => v === 'console' || v === 'otlp')
}

function setDiagLogLevel(level: string | undefined) {
  const key = level?.toUpperCase()
  if (key !== undefined && Object.hasOwn(DiagLogLevel, key)) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel[key as keyof typeof DiagLogLevel])
  }
}
