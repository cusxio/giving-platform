import {
  context,
  Context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api'
import { createStartHandler } from '@tanstack/react-start/server'

export function createTracedHandler<
  T extends ReturnType<typeof createStartHandler>,
>(handler: T) {
  return async function tracedHandler(...args: Parameters<T>) {
    const [request] = args
    const url = new URL(request.url)

    const parentContext = extractContextFromRequest(request)
    const tracer = trace.getTracer('tanstack-server-handler')
    const spanName = `${request.method} ${url.pathname}`

    return tracer.startActiveSpan(
      spanName,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.request.method': request.method,
          'url.path': url.pathname,
          'url.full': request.url,
          'tanstack.type': 'request',
          ...(url.search && { 'url.search': url.search }),
        },
      },
      parentContext,
      async (span) => {
        const startTime = Date.now()

        try {
          const response = await handler(request)

          span.setAttribute('http.response.status_code', response.status)

          if (response.status >= 500) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${response.status}`,
            })
          } else if (response.status >= 400) {
            span.setStatus({
              code: SpanStatusCode.UNSET,
              message: `HTTP ${response.status}`,
            })
          } else {
            span.setStatus({ code: SpanStatusCode.OK })
          }

          return response
        } catch (error) {
          span.setAttribute('http.response.status_code', 500)
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          })

          span.recordException(error as Error)

          throw error
        } finally {
          const duration = Date.now() - startTime
          span.setAttribute('tanstack.request.duration_ms', duration)
          span.end()
        }
      },
    )
  }
}

function extractContextFromRequest(request: Request): Context {
  const carrier: Record<string, string> = {}

  // Extract W3C Trace Context headers
  const traceparent = request.headers.get('traceparent')
  const tracestate = request.headers.get('tracestate')
  const baggage = request.headers.get('baggage')

  if (traceparent !== null) carrier.traceparent = traceparent
  if (tracestate !== null) carrier.tracestate = tracestate
  if (baggage !== null) carrier.baggage = baggage

  // Return ROOT_CONTEXT if no trace headers present
  if (Object.keys(carrier).length === 0) {
    return ROOT_CONTEXT
  }

  return propagation.extract(context.active(), carrier)
}
