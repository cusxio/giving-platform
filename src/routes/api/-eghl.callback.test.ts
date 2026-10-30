import { createHash } from 'node:crypto'

import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import { ok } from '#/core/result'
import type * as Envvars from '#/envvars'
import type { PaymentService } from '#/features/giving/payment.service'
import { EghlTxnStatus } from '#/features/payment-gateway/eghl.schema'

const mockedEnv = vi.hoisted(() => ({
  BASE_URL: 'https://app.give.test',
  DATABASE_URL: 'postgres://user:pass@db.give.test/db',
  EGHL_PASSWORD: 'secret-password',
  EGHL_SERVICE_ID: 'service-123',
  EGHL_URL: 'https://eghl.test/pay',
}))

vi.mock<typeof Envvars>(import('#/envvars'), () => mockedEnv)

const { Route } = await import('./eghl.callback')
const { EghlService } = await import('#/features/payment-gateway/eghl.service')

const signedCallbackBody = (TxnStatus: EghlTxnStatus, TxnMessage: string) => {
  const fields = {
    Amount: '50.00',
    AuthCode: '',
    CurrencyCode: 'MYR',
    HashValue: 'unused',
    OrderNumber: 'txn_abc123',
    Param6: '',
    Param7: '',
    PaymentID: 'txn_abc123',
    PymtMethod: 'ANY',
    ServiceID: mockedEnv.EGHL_SERVICE_ID,
    TransactionType: 'SALE',
    TxnID: 'CIVtxn_abc123',
    TxnMessage,
    TxnStatus,
  }
  const HashValue2 = createHash('sha256')
    .update(
      [
        mockedEnv.EGHL_PASSWORD,
        fields.TxnID,
        fields.ServiceID,
        fields.PaymentID,
        fields.TxnStatus,
        fields.Amount,
        fields.CurrencyCode,
        fields.AuthCode,
        fields.OrderNumber,
        fields.Param6,
        fields.Param7,
      ].join(''),
    )
    .digest('hex')
  return new URLSearchParams({ ...fields, HashValue2 }).toString()
}

const postCallback = async (body: string) => {
  const finalizePaymentFromCallback = vi.fn<PaymentService['finalizePaymentFromCallback']>(() =>
    Promise.resolve(ok({ finalized: true })),
  )
  const handlers = Route.options.server?.handlers
  if (typeof handlers !== 'object' || handlers.POST === undefined) {
    throw new TypeError('callback route has no POST handler')
  }
  const response = await handlers.POST({
    context: {
      eghlService: new EghlService(),
      logger: pino({ level: 'silent' }),
      paymentService: { finalizePaymentFromCallback },
    },
    request: new Request('https://app.give.test/api/eghl/callback', { body, method: 'POST' }),
  } as never)
  if (!(response instanceof Response)) {
    throw new TypeError('callback route did not answer with a Response')
  }
  return { finalizePaymentFromCallback, response }
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
      expect.objectContaining({ PaymentID: 'txn_abc123' }),
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
})
