import { SeverityNumber, logs, trace } from '@opentelemetry/api'
import type { DestinationStream } from 'pino'
import { levels } from 'pino'

const SEVERITY_BY_PINO_LEVEL: Record<number, SeverityNumber> = {
  10: SeverityNumber.TRACE,
  20: SeverityNumber.DEBUG,
  30: SeverityNumber.INFO,
  40: SeverityNumber.WARN,
  50: SeverityNumber.ERROR,
  60: SeverityNumber.FATAL,
}

interface PinoRecord {
  [key: string]: unknown
  err?: unknown
  hostname?: string
  level: number
  msg?: string
  pid?: number
  span_id?: string
  time: unknown
  trace_flags?: string
  trace_id?: string
}

export function traceContextMixin() {
  const span = trace.getActiveSpan()
  if (span === undefined) {
    return {}
  }

  const { spanId, traceFlags, traceId } = span.spanContext()
  return { span_id: spanId, trace_flags: `0${traceFlags.toString(16)}`, trace_id: traceId }
}

// Emits each pino line through the OpenTelemetry Logs API. The record is emitted
// synchronously inside the request, so the active span supplies its trace context.
// The logger is looked up per line so it follows a provider registered after this stream.
export function createOtelLogStream(): DestinationStream {
  return {
    write(line) {
      const {
        err,
        hostname: _hostname,
        level,
        msg,
        pid: _pid,
        span_id: _spanId,
        time,
        trace_flags: _traceFlags,
        trace_id: _traceId,
        ...attributes
      } = JSON.parse(line) as PinoRecord

      // A `time` key in the log call overrides pino's epoch timestamp in the JSON line.
      const hasEpochTime = typeof time === 'number'
      const timestamp = hasEpochTime ? time : Date.now()

      logs
        .getLogger('pino')
        .emit({
          attributes: hasEpochTime ? attributes : { ...attributes, time },
          body: msg,
          exception: withErrorName(err),
          observedTimestamp: timestamp,
          severityNumber: SEVERITY_BY_PINO_LEVEL[level] ?? SeverityNumber.UNSPECIFIED,
          severityText: levels.labels[level],
          timestamp,
        })
    },
  }
}

// pino's err serializer stores the class in `type`, but the SDK reads `name` for exception.type.
function withErrorName(err: unknown) {
  if (typeof err !== 'object' || err === null) {
    return err
  }

  const { name, type } = err as { name?: unknown; type?: unknown }
  return typeof type === 'string' && typeof name !== 'string' ? { ...err, name: type } : err
}
