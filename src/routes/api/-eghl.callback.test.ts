import { createHash } from 'node:crypto'

import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import { ok } from '#/core/result'
import type * as Envvars from '#/envvars'
import type { PaymentService } from '#/features/giving/payment.service'
import { EghlTxnExists, EghlTxnStatus } from '#/features/payment-gateway/eghl.schema'

const mockedEnv = vi.hoisted(() => ({
  BASE_URL: 'https://app.give.test',
  DATABASE_URL: 'postgres://user:pass@db.give.test/db',
  EGHL_PASSWORD: 'secret-password',
  EGHL_SERVICE_ID: 'service-123',
  EGHL_URL: 'https://eghl.test/pay',
}))

vi.mock<typeof Envvars>(import('#/envvars'), () => mockedEnv)

const { Route } = await import('./eghl.callback')
const { Route: ReturnRoute } = await import('./eghl.return')
const { EghlService } = await import('#/features/payment-gateway/eghl.service')

const TRANSACTION_ID = 'txn_abc123'
const AMOUNT_IN_CENTS = 5000

const sha256 = (fields: readonly string[]) =>
  createHash('sha256')
    .update([mockedEnv.EGHL_PASSWORD, ...fields].join(''))
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
  ServiceID: mockedEnv.EGHL_SERVICE_ID,
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

/** Stands in for eGHL: answers a status query for the stored transaction with `TxnStatus`. */
const gatewayAnswering = (TxnStatus: EghlTxnStatus, TxnMessage: string) =>
  vi.fn<typeof fetch>((_input, init) => {
    const query = new URLSearchParams(init?.body as URLSearchParams)
    const matches =
      query.get('TransactionType') === 'QUERY' &&
      query.get('PaymentID') === TRANSACTION_ID &&
      query.get('Amount') === '50.00'
    const reply = matches
      ? signedReply({
          ...paymentFields(TxnStatus, TxnMessage),
          QueryDesc: 'Exists',
          TransactionType: 'QUERY',
          TxnExists: EghlTxnExists.Exists,
        })
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

const stubPaymentService = () => ({
  finalizePaymentFromCallback: vi.fn<PaymentService['finalizePaymentFromCallback']>(() =>
    Promise.resolve(ok({ finalized: true })),
  ),
  findPendingAmountInCents: vi.fn<PaymentService['findPendingAmountInCents']>(() =>
    Promise.resolve(ok(AMOUNT_IN_CENTS)),
  ),
})

const handlerContext = (paymentService: ReturnType<typeof stubPaymentService>) => ({
  eghlService: new EghlService(),
  logger: pino({ level: 'silent' }),
  paymentService,
})

const postCallback = async (body: string, gateway: typeof fetch = unreachableGateway) => {
  const paymentService = stubPaymentService()
  const handlers = Route.options.server?.handlers
  const handlePost = typeof handlers === 'object' ? handlers.POST : undefined
  if (handlePost === undefined) {
    throw new TypeError('callback route has no POST handler')
  }
  const response = await withGateway(gateway, async () =>
    handlePost({
      context: handlerContext(paymentService),
      request: new Request('https://app.give.test/api/eghl/callback', { body, method: 'POST' }),
    } as never),
  )
  if (!(response instanceof Response)) {
    throw new TypeError('callback route did not answer with a Response')
  }
  return { finalizePaymentFromCallback: paymentService.finalizePaymentFromCallback, response }
}

const getReturn = async (query: string, gateway: typeof fetch = unreachableGateway) => {
  const paymentService = stubPaymentService()
  const handlers = ReturnRoute.options.server?.handlers
  const handleGet = typeof handlers === 'object' ? handlers.GET : undefined
  if (handleGet === undefined) {
    throw new TypeError('return route has no GET handler')
  }
  // The return route always answers by throwing a redirect.
  await withGateway(gateway, async () =>
    handleGet({
      context: handlerContext(paymentService),
      request: new Request(`https://app.give.test/api/eghl/return?${query}`),
    } as never),
  ).catch((error: unknown) => error)
  return { finalizePaymentFromCallback: paymentService.finalizePaymentFromCallback }
}

describe('eGHL callback route', () => {
  it('acknowledges a settled reply with the literal OK', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback, response } = await postCallback(
      signedCallbackBody(EghlTxnStatus.Success, 'Transaction Successful'),
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('OK')
    expect(finalizePaymentFromCallback).toHaveBeenCalledWith(
      expect.objectContaining({ PaymentID: TRANSACTION_ID }),
      'success',
    )
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

    const { finalizePaymentFromCallback, response } = await postCallback(
      signedCallbackBody(EghlTxnStatus.Failed, 'Transaction Failed'),
      gatewayAnswering(EghlTxnStatus.Failed, 'Transaction Failed'),
    )

    expect(finalizePaymentFromCallback).toHaveBeenCalledWith(
      expect.objectContaining({ PaymentID: TRANSACTION_ID, TransactionType: 'QUERY' }),
      'failed',
    )
    await expect(response.text()).resolves.toBe('OK')
  })

  it('settles a failed reply as success when the gateway reports the payment succeeded', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback } = await postCallback(
      replayedDuplicateBody(),
      gatewayAnswering(EghlTxnStatus.Success, 'Transaction Successful'),
    )

    expect(finalizePaymentFromCallback).toHaveBeenCalledWith(
      expect.objectContaining({ PaymentID: TRANSACTION_ID }),
      'success',
    )
  })
})

describe('eGHL return route', () => {
  it('leaves a replayed duplicate reply pending while the gateway still processes the payment', async () => {
    expect.hasAssertions()

    const { finalizePaymentFromCallback } = await getReturn(
      replayedDuplicateBody(),
      gatewayAnswering(EghlTxnStatus.Pending, 'Transaction Pending'),
    )

    expect(finalizePaymentFromCallback).not.toHaveBeenCalled()
  })
})
