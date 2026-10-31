import { context, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import type { ReadableSpan } from '@opentelemetry/sdk-trace'
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'

/** Registers a tracer that keeps every finished span, as the SDK does in production. */
export function recordSpans(): InMemorySpanExporter {
  const exporter = new InMemorySpanExporter()
  context.disable()
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  trace.disable()
  trace.setGlobalTracerProvider(
    new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] }),
  )
  return exporter
}

/** How `work` settled. `reason` is `unknown`, unlike the lib type's `any`. */
export type Settled<T> =
  | { readonly reason: unknown; readonly status: 'rejected' }
  | { readonly status: 'fulfilled'; readonly value: T }

/**
 * Runs `work` inside an active request span, as the traced handler does, and returns the
 * finished span with whatever `work` settled to.
 */
export async function inRequestSpan<T>(
  work: () => Promise<T>,
): Promise<{ settled: Settled<T>; span: ReadableSpan }> {
  const exporter = recordSpans()
  const settled: Settled<T> = await trace
    .getTracer('test')
    .startActiveSpan('request', async (span) => {
      const [outcome] = await Promise.allSettled([work()])
      span.end()
      return outcome
    })
  const [span] = exporter.getFinishedSpans()
  if (span === undefined) {
    throw new Error('no span finished')
  }
  return { settled, span }
}
