import { SpanStatusCode } from '@opentelemetry/api'
import type { createStartHandler } from '@tanstack/react-start/server'
import { Result } from 'better-result'
import { describe, expect, it } from 'vitest'

import { anyone } from '#/server/authorize.server'
import { infra } from '#/server/infra-error'
import { noInput } from '#/server/input.server'
import { defineMutation } from '#/server/procedure.server'
import { recordSpans } from '#/server/testing/spans'
import { testContext } from '#/server/testing/test-context'

import { createTracedHandler } from './create-traced-handler.server'

const failing = defineMutation({
  auth: anyone,
  event: 'm.x',
  input: noInput,
  run: () => Promise.resolve(Result.err(infra('q.find', new Error('connection terminated')))),
  wire: {},
})

async function statusOf(handle: () => Promise<Response>) {
  const exporter = recordSpans()
  const handler = handle as unknown as ReturnType<typeof createStartHandler>
  const traced = createTracedHandler(handler, { flush: () => Promise.resolve() })
  await traced(new Request('https://give.test/_serverFn/x', { method: 'POST' }))
  return exporter.getFinishedSpans()[0]?.status.code
}

describe('the request span', () => {
  it('stays failed when a server function answered SERVER_ERROR with a 200', async () => {
    expect.hasAssertions()

    const status = await statusOf(async () => {
      await failing({ context: testContext(null) })
      return new Response('{}', { status: 200 })
    })

    expect(status).toBe(SpanStatusCode.ERROR)
  })

  it('is left unset by a healthy response and failed by a 5xx', async () => {
    expect.hasAssertions()

    await expect(statusOf(() => Promise.resolve(new Response('ok')))).resolves.toBe(
      SpanStatusCode.UNSET,
    )
    await expect(
      statusOf(() => Promise.resolve(new Response('no', { status: 503 }))),
    ).resolves.toBe(SpanStatusCode.ERROR)
  })
})
