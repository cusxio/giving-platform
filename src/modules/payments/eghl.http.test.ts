import { createHash } from 'node:crypto'

import { SpanStatusCode } from '@opentelemetry/api'
import { Result } from 'better-result'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import type { FakeDb } from '#/server/testing/fake-db'
import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { errValue } from '#/server/testing/result'
import { inRequestSpan } from '#/server/testing/spans'
import { testDeps } from '#/server/testing/test-deps'

import { handleEghlCallback, handleEghlReturnGet, handleEghlReturnPost } from './eghl.http.server'
import { EghlTxnExists, EghlTxnStatus } from './eghl.wire'
import type { recordOutcome } from './record-outcome.server'
import { findPendingAmountInCents, insertPayment } from './transactions.repository.server'

type Finalize = (outcome: Parameters<typeof recordOutcome>[1]) => ReturnType<typeof recordOutcome>

/** Stands in for recordOutcome, the one writer, so each test sees what would be settled. */
const finalizePaymentFromCallback = vi.hoisted(() => vi.fn<Finalize>())

vi.mock(import('./record-outcome.server'), () => ({
  recordOutcome: (_deps, outcome) => finalizePaymentFromCallback(outcome),
}))

const { eghl } = testDeps().config

const TRANSACTION_ID = 'txn_abc123'
const AMOUNT_IN_CENTS = 5000

/** recordOutcome was asked to settle the stored transaction once, with an outcome of `kind`. */
const settling = (kind: 'failed' | 'succeeded') => [
  [{ kind, record: { transactionId: TRANSACTION_ID } }],
]

const sha256 = (fields: readonly string[]) =>
  createHash('sha256')
    .update([eghl.password, ...fields].join(''))
    .digest('hex')

const signedReply = (fields: Record<string, string>) => {
  const signedPart = [
    fields.TxnID,
    fields.ServiceID,
    fields.PaymentID,
    fields.TxnStatus,
    fields.Amount,
    fields.CurrencyCode,
    fields.AuthCode,
  ].map((value) => value ?? '')
  const HashValue = sha256(signedPart)
  const HashValue2 = sha256([
    ...signedPart,
    ...[fields.OrderNumber, fields.Param6, fields.Param7].map((value) => value ?? ''),
  ])
  return new URLSearchParams({ ...fields, HashValue, HashValue2 }).toString()
}

const paymentFields = (TxnStatus: string, TxnMessage: string) => ({
  Amount: '50.00',
  AuthCode: '',
  CurrencyCode: 'MYR',
  OrderNumber: TRANSACTION_ID,
  Param6: '',
  Param7: '',
  PaymentID: TRANSACTION_ID,
  PymtMethod: 'ANY',
  ServiceID: eghl.serviceId,
  TransactionType: 'SALE',
  TxnID: `CIV${TRANSACTION_ID}`,
  TxnMessage,
  TxnStatus,
})

const signedCallbackBody = (TxnStatus: EghlTxnStatus, TxnMessage: string) =>
  signedReply(paymentFields(TxnStatus, TxnMessage))

// A signed duplicate-payment-id rejection whose unsigned TxnMessage was rewritten in transit.
const replayedDuplicateBody = () =>
  signedCallbackBody(EghlTxnStatus.Failed, 'Duplicate Payment ID').replace(
    /TxnMessage=[^&]*/u,
    'TxnMessage=Transaction+Failed',
  )

// A signed success reply with an added TxnExists field, rewritten HashValue2-only fields and a
// junk HashValue2.
const tamperedSuccessBody = () => {
  const body = new URLSearchParams(
    signedCallbackBody(EghlTxnStatus.Success, 'Transaction Successful'),
  )
  body.set('OrderNumber', 'txn_other')
  body.set('Param6', 'tampered')
  body.set('Param7', 'tampered')
  body.set('HashValue2', '0'.repeat(64))
  body.set('TxnExists', EghlTxnExists.NotFound)
  return body.toString()
}

const existingQueryReply = (
  TxnStatus: EghlTxnStatus,
  TxnMessage: string,
  overrides: Record<string, string> = {},
) =>
  signedReply({
    ...paymentFields(TxnStatus, TxnMessage),
    QueryDesc: 'Exists',
    TransactionType: 'QUERY',
    TxnExists: EghlTxnExists.Exists,
    ...overrides,
  })

/** Stands in for eGHL: answers every status query with the same signed `reply`. */
const gatewayReplying = (reply: string) =>
  vi.fn<typeof fetch>(() => Promise.resolve(new Response(reply, { status: 200 })))

const timedOutGateway = vi.fn<typeof fetch>(() =>
  Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
)

const gatewayTimingOutMidReply = vi.fn<typeof fetch>(() => {
  const body = new ReadableStream({
    start(controller) {
      controller.error(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    },
  })
  return Promise.resolve(new Response(body, { status: 200 }))
})

/** Stands in for eGHL: answers a status query for the stored transaction with `TxnStatus`. */
const gatewayAnswering = (TxnStatus: EghlTxnStatus, TxnMessage: string) =>
  vi.fn<typeof fetch>((_input, init) => {
    const query = new URLSearchParams(init?.body as URLSearchParams)
    const matches =
      query.get('TransactionType') === 'QUERY' &&
      query.get('PaymentID') === TRANSACTION_ID &&
      query.get('Amount') === '50.00'
    const reply = matches
      ? existingQueryReply(TxnStatus, TxnMessage)
      : signedReply({
          ...paymentFields('-1', ''),
          QueryDesc: 'Not found',
          TransactionType: 'QUERY',
          TxnExists: EghlTxnExists.NotFound,
          TxnID: '',
        })
    return Promise.resolve(new Response(reply, { status: 200 }))
  })

const unreachableGateway = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('network down')))

const withGateway = async <T>(gateway: typeof fetch, run: () => Promise<T>) => {
  vi.stubGlobal('fetch', gateway)
  try {
    return await run()
  } finally {
    vi.unstubAllGlobals()
  }
}

const stubPaymentService = (
  logger = pino({ level: 'silent' }),
  db: FakeDb = createFakeDb().on(findPendingAmountInCents, () => AMOUNT_IN_CENTS),
) => {
  finalizePaymentFromCallback.mockReset().mockResolvedValue(Result.ok({ finalized: true }))
  return testDeps({ db, logger })
}

const postCallback = async (body: string, gateway: typeof fetch = unreachableGateway) => {
  const deps = stubPaymentService()
  const response = await withGateway(gateway, async () =>
    handleEghlCallback(
      deps,
      new Request('https://app.give.test/api/eghl/callback', { body, method: 'POST' }),
    ),
  )
  return { finalizePaymentFromCallback, response }
}

const getReturn = async (query: string, gateway: typeof fetch = unreachableGateway) => {
  const deps = stubPaymentService()
  // The return route always answers by throwing a redirect.
  await withGateway(gateway, async () =>
    handleEghlReturnGet(deps, new Request(`https://app.give.test/api/eghl/return?${query}`)),
  ).catch((error: unknown) => error)
  return { finalizePaymentFromCallback }
}

describe('eGHL callback route', () => {
  it('acknowledges a settled reply with the literal OK', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback, response } = await postCallback(
      signedCallbackBody(EghlTxnStatus.Success, 'Transaction Successful'),
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('OK')
    expect(finalizePaymentFromCallback.mock.calls).toMatchObject(settling('succeeded'))
  })

  it('acknowledges a pending reply without settling the transaction', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback, response } = await postCallback(
      signedCallbackBody(EghlTxnStatus.Pending, 'Transaction Pending'),
    )

    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('OK')
  })

  it('leaves a replayed duplicate reply pending while the gateway still processes the payment', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback, response } = await postCallback(
      replayedDuplicateBody(),
      gatewayAnswering(EghlTxnStatus.Pending, 'Transaction Pending'),
    )

    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('OK')
  })

  it('leaves a failed reply pending when the gateway cannot be queried', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback, response } = await postCallback(
      signedCallbackBody(EghlTxnStatus.Failed, 'Transaction Failed'),
      unreachableGateway,
    )

    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('OK')
  })

  it('settles a failed reply as failed once the gateway confirms the failure', async () => {
    expect.hasAssertions()

    const gateway = gatewayAnswering(EghlTxnStatus.Failed, 'Transaction Failed')
    const { finalizePaymentFromCallback, response } = await postCallback(
      signedCallbackBody(EghlTxnStatus.Failed, 'Transaction Failed'),
      gateway,
    )

    expect(gateway.mock.calls.map(([url]) => url)).toStrictEqual([eghl.url])
    expect(finalizePaymentFromCallback.mock.calls).toMatchObject(settling('failed'))
    await expect(response.text()).resolves.toBe('OK')
  })

  it('settles a failed reply as success when the gateway reports the payment succeeded', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback } = await postCallback(
      replayedDuplicateBody(),
      gatewayAnswering(EghlTxnStatus.Success, 'Transaction Successful'),
    )

    expect(finalizePaymentFromCallback.mock.calls).toMatchObject(settling('succeeded'))
  })

  it('rejects a reply whose HashValue2 does not match, whatever fields it adds', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback, response } = await postCallback(tamperedSuccessBody())

    expect(response.status).toBe(400)
    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
  })

  it('leaves a failed reply pending when the gateway answers for another payment', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback, response } = await postCallback(
      signedCallbackBody(EghlTxnStatus.Failed, 'Transaction Failed'),
      gatewayReplying(
        existingQueryReply(EghlTxnStatus.Failed, 'Transaction Failed', {
          OrderNumber: 'txn_other',
          PaymentID: 'txn_other',
        }),
      ),
    )

    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('OK')
  })

  it('leaves a failed reply pending when the gateway answers with another amount', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback, response } = await postCallback(
      signedCallbackBody(EghlTxnStatus.Failed, 'Transaction Failed'),
      gatewayReplying(
        existingQueryReply(EghlTxnStatus.Failed, 'Transaction Failed', { Amount: '5.00' }),
      ),
    )

    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
    await expect(response.text()).resolves.toBe('OK')
  })

  it('leaves a failed reply pending when the gateway query times out', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback, response } = await postCallback(
      signedCallbackBody(EghlTxnStatus.Failed, 'Transaction Failed'),
      timedOutGateway,
    )

    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('OK')
  })

  it('leaves a failed reply pending when the gateway reply times out mid-body', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback, response } = await postCallback(
      signedCallbackBody(EghlTxnStatus.Failed, 'Transaction Failed'),
      gatewayTimingOutMidReply,
    )

    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('OK')
  })
})

describe('eGHL return route', () => {
  it('does not settle a reply whose HashValue2 does not match, whatever fields it adds', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback } = await getReturn(tamperedSuccessBody())

    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
  })

  it('leaves a replayed duplicate reply pending while the gateway still processes the payment', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback } = await getReturn(
      replayedDuplicateBody(),
      gatewayAnswering(EghlTxnStatus.Pending, 'Transaction Pending'),
    )

    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
  })
})

/** A POST whose body stream fails as it is read. */
const unreadableRequest = (url: string) =>
  new Request(url, {
    body: new ReadableStream({
      start(controller) {
        controller.error(new Error('connection reset'))
      },
    }),
    duplex: 'half',
    method: 'POST',
  } as RequestInit)

const CALLBACK_URL = 'https://app.give.test/api/eghl/callback'
const RETURN_URL = 'https://app.give.test/api/eghl/return'
const post = (url: string, body: string) => new Request(url, { body, method: 'POST' })

describe('refusing a reply', () => {
  it('names the failure under error.type', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const deps = stubPaymentService(logger)
    await handleEghlCallback(deps, post(CALLBACK_URL, 'PaymentID=txn_abc123'))
    await withGateway(unreachableGateway, async () =>
      handleEghlCallback(
        deps,
        post(CALLBACK_URL, signedCallbackBody(EghlTxnStatus.Failed, 'Transaction Failed')),
      ),
    )

    expect(events.filter((e) => e.level >= 40)).toMatchObject([
      { 'error.type': 'ParseError', event: 'eghl.callback.validation_failed' },
      { 'error.type': 'EghlFetchError', event: 'eghl.settlement.query_failed' },
    ])
    expect(events.some((e) => 'error_type' in e)).toBe(false)
  })

  it.each([
    ['a tampered signature', post(CALLBACK_URL, tamperedSuccessBody()), 400, 'verification_failed'],
    [
      'fields that fail the schema',
      post(CALLBACK_URL, 'PaymentID=txn_abc123'),
      400,
      'validation_failed',
    ],
    [
      'a method other than GET or POST',
      new Request(CALLBACK_URL, { method: 'PUT' }),
      400,
      'method_invalid',
    ],
    ['a body that cannot be read', unreadableRequest(CALLBACK_URL), 500, 'read_failed'],
  ])(
    'answers the callback with %s by its status and logs why',
    async (_case, request, status, why) => {
      expect.hasAssertions()

      const { events, logger } = recordingLogger()
      const response = await handleEghlCallback(stubPaymentService(logger), request)

      expect(response.status).toBe(status)
      expect(events.map(({ event }) => event)).toStrictEqual([
        'eghl.callback.received',
        `eghl.callback.${why}`,
      ])
      expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['a tampered signature', post(RETURN_URL, tamperedSuccessBody()), 'verification_failed'],
    ['fields that fail the schema', post(RETURN_URL, 'PaymentID=txn_abc123'), 'validation_failed'],
    ['a body that cannot be read', unreadableRequest(RETURN_URL), 'read_failed'],
  ])(
    'sends the donor of a return with %s to the error page and logs why',
    async (_case, request, why) => {
      expect.hasAssertions()

      const { events, logger } = recordingLogger()
      const response = await handleEghlReturnPost(stubPaymentService(logger), request)

      expect(response).toMatchObject({ options: { replace: true, to: '/uh-oh' } })
      expect(events.map(({ event }) => event)).toStrictEqual([
        'eghl.return.received',
        `eghl.return.${why}`,
      ])
      expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
    },
  )
})

/** A failed payment insert, as the port reports it: its driver error quotes the parameters. */
const failedWrite = async () => {
  const db = createFakeDb().on(insertPayment, () => {
    throw new Error('connection reset')
  })
  const result = await db.run(
    insertPayment({ message: 'tok_secret', provider: 'eghl', transactionId: TRANSACTION_ID }),
  )
  return errValue(result)
}

describe('failing to record a settlement', () => {
  it('answers the callback 500, so the gateway sends it again, and logs the failure once', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const deps = stubPaymentService(logger)
    finalizePaymentFromCallback.mockResolvedValue(Result.err(await failedWrite()))

    const { settled, span } = await inRequestSpan(async () => {
      const response = await handleEghlCallback(
        deps,
        post(CALLBACK_URL, signedCallbackBody(EghlTxnStatus.Success, 'Transaction Successful')),
      )
      return { body: await response.text(), status: response.status }
    })

    expect(settled).toStrictEqual({
      status: 'fulfilled',
      value: { body: '{"message":"Internal Server Error"}', status: 500 },
    })
    expect(events.filter(({ level }) => level >= 50)).toMatchObject([
      {
        'error.type': 'Error',
        err: { message: 'connection reset' },
        event: 'eghl.callback.failed',
        msg: 'payments.insertPayment failed',
        op: 'payments.insertPayment',
        transaction_id: TRANSACTION_ID,
      },
    ])
    expect(JSON.stringify(events)).not.toContain('tok_secret')
    expect(span.status.code).toBe(SpanStatusCode.ERROR)
  })

  it('answers the callback 500 when the amount to confirm a failure cannot be read', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = createFakeDb().on(findPendingAmountInCents, () => {
      throw new Error('connection reset')
    })

    const response = await handleEghlCallback(
      stubPaymentService(logger, db),
      post(CALLBACK_URL, signedCallbackBody(EghlTxnStatus.Failed, 'Transaction Failed')),
    )

    expect(response.status).toBe(500)
    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
    expect(events.at(-1)).toMatchObject({
      event: 'eghl.callback.failed',
      op: 'payments.findPendingAmountInCents',
      transaction_id: TRANSACTION_ID,
    })
  })

  it.each([
    [
      'GET',
      async (deps: ReturnType<typeof stubPaymentService>) =>
        handleEghlReturnGet(
          deps,
          new Request(
            `${RETURN_URL}?${signedCallbackBody(EghlTxnStatus.Success, 'Transaction Successful')}`,
          ),
        ).catch((error: unknown) => error),
    ],
    [
      'POST',
      async (deps: ReturnType<typeof stubPaymentService>) =>
        handleEghlReturnPost(
          deps,
          post(RETURN_URL, signedCallbackBody(EghlTxnStatus.Success, 'Transaction Successful')),
        ),
    ],
  ])(
    'sends the donor of a %s return to the error page and logs the failure once',
    async (_method, run) => {
      expect.hasAssertions()

      const { events, logger } = recordingLogger()
      const deps = stubPaymentService(logger)
      finalizePaymentFromCallback.mockResolvedValue(Result.err(await failedWrite()))

      const { settled, span } = await inRequestSpan(() => run(deps))

      expect(settled).toMatchObject({
        status: 'fulfilled',
        value: { options: { replace: true, to: '/uh-oh' } },
      })
      expect(events.filter(({ level }) => level >= 50)).toMatchObject([
        {
          event: 'eghl.return.failed',
          op: 'payments.insertPayment',
          transaction_id: TRANSACTION_ID,
        },
      ])
      expect(span.status.code).toBe(SpanStatusCode.ERROR)
    },
  )
})

type TestDeps = ReturnType<typeof stubPaymentService>
const successBody = () => signedCallbackBody(EghlTxnStatus.Success, 'Transaction Successful')

describe('a defect while settling', () => {
  const bug = new TypeError('settlement bug')

  it.each([
    [
      'callback',
      'eghl.callback',
      (deps: TestDeps) => handleEghlCallback(deps, post(CALLBACK_URL, successBody())),
    ],
    [
      'GET return',
      'eghl.return',
      (deps: TestDeps) => handleEghlReturnGet(deps, new Request(`${RETURN_URL}?${successBody()}`)),
    ],
    [
      'POST return',
      'eghl.return',
      (deps: TestDeps) => handleEghlReturnPost(deps, post(RETURN_URL, successBody())),
    ],
  ])(
    'is logged once by the %s route, fails the span and is rethrown',
    async (_route, event, run) => {
      expect.hasAssertions()

      const { events, logger } = recordingLogger()
      const deps = stubPaymentService(logger)
      finalizePaymentFromCallback.mockRejectedValue(bug)

      const { settled, span } = await inRequestSpan(() => run(deps))

      expect(settled).toStrictEqual({ reason: bug, status: 'rejected' })
      expect(events.filter(({ level }) => level >= 50)).toMatchObject([
        { 'error.type': 'TypeError', err: { message: 'settlement bug' }, event: `${event}.defect` },
      ])
      expect(span.status.code).toBe(SpanStatusCode.ERROR)
    },
  )

  it('lets the return route redirect a settled donor without logging a defect', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const { settled, span } = await inRequestSpan(() =>
      handleEghlReturnGet(
        stubPaymentService(logger),
        new Request(`${RETURN_URL}?${successBody()}`),
      ),
    )

    expect(settled).toMatchObject({
      reason: { options: { to: '/transaction/receipt/$transactionId' } },
      status: 'rejected',
    })
    expect(events.some(({ event }) => event?.endsWith('.defect') === true)).toBe(false)
    expect(span.status.code).toBe(SpanStatusCode.UNSET)
  })
})

const eghlEvents = (events: { event?: string }[]) =>
  events.filter(({ event }) => event?.startsWith('eghl.') === true)

describe('logging a verified reply', () => {
  it('logs the amount in cents while processing, and leaves the wire status to the adapter', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    await handleEghlCallback(stubPaymentService(logger), post(CALLBACK_URL, successBody()))

    expect(eghlEvents(events)).toMatchObject([
      { event: 'eghl.callback.received' },
      { event: 'eghl.reply.verified', status: '0', transaction_id: TRANSACTION_ID },
      {
        amount_in_cents: AMOUNT_IN_CENTS,
        event: 'eghl.callback.processing',
        provider_txn_id: `CIV${TRANSACTION_ID}`,
        transaction_id: TRANSACTION_ID,
      },
      { event: 'eghl.callback.success' },
    ])
    expect(events.find(({ event }) => event === 'eghl.callback.processing')).not.toHaveProperty(
      'status',
    )
  })

  it('logs the answer the gateway gave to the confirming query', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    await withGateway(gatewayAnswering(EghlTxnStatus.Pending, 'Transaction Pending'), async () =>
      handleEghlCallback(
        stubPaymentService(logger),
        post(CALLBACK_URL, signedCallbackBody(EghlTxnStatus.Failed, 'Transaction Failed')),
      ),
    )

    expect(eghlEvents(events)).toMatchObject([
      { event: 'eghl.callback.received' },
      { event: 'eghl.reply.verified', status: '1' },
      { amount_in_cents: AMOUNT_IN_CENTS, event: 'eghl.callback.processing' },
      {
        event: 'eghl.query.answered',
        status: '2',
        transaction_id: TRANSACTION_ID,
        txn_exists: '0',
      },
      { event: 'eghl.settlement.not_final', transaction_id: TRANSACTION_ID },
      { event: 'eghl.callback.success' },
    ])
  })
})
