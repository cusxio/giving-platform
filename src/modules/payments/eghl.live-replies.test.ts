import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'
import { testDeps } from '#/server/testing/test-deps'

import { handleEghlCallback, handleEghlReturnGet } from './eghl.http.server'
import { outcomeOf, replyOf } from './eghl.outcome'
import type { EghlPaymentResponse, EghlQueryResponse, Verified } from './eghl.wire'
import { EghlPaymentResponseSchema, EghlQueryResponseSchema } from './eghl.wire'
import {
  findPendingAmountInCents,
  findProviderTxnIds,
  insertPayment,
  lockTransaction,
  moveTransaction,
} from './transactions.repository.server'

const { eghl } = testDeps().config

const inboundActionOf = (reply: EghlPaymentResponse) =>
  ({ pending: 'leave-pending', settled: 'settle-success', unconfirmed: 'confirm-by-query' })[
    replyOf(reply as Verified<EghlPaymentResponse>).kind
  ]

const finalStatusOf = (answer: EghlQueryResponse) =>
  outcomeOf(answer as Verified<EghlQueryResponse>).match({
    err: () => null,
    ok: (outcome) =>
      ({
        failed: 'failed',
        notFound: null,
        pending: null,
        refunded: 'refunded',
        succeeded: 'success',
      })[outcome.kind],
  })

const PAYMENT_ID = 'liveReply00000000001'

const sha256 = (fields: readonly string[]) =>
  createHash('sha256')
    .update([eghl.password, ...fields].join(''))
    .digest('hex')

const hashValueFields = (fields: Record<string, string>) =>
  [
    fields.TxnID,
    fields.ServiceID,
    fields.PaymentID,
    fields.TxnStatus,
    fields.Amount,
    fields.CurrencyCode,
    fields.AuthCode,
  ].map((value) => value ?? '')

const withHashValue = (fields: Record<string, string>) => ({
  ...fields,
  HashValue: sha256(hashValueFields(fields)),
})

const withBothHashes = (fields: Record<string, string>) => ({
  ...withHashValue(fields),
  HashValue2: sha256([
    ...hashValueFields(fields),
    ...[fields.OrderNumber, fields.Param6, fields.Param7].map((value) => value ?? ''),
  ]),
})

const cancelOrTimeoutReturn = withBothHashes({
  Amount: '1.00',
  CurrencyCode: 'MYR',
  OrderNumber: PAYMENT_ID,
  Param6: '',
  Param7: '',
  PaymentID: PAYMENT_ID,
  PymtMethod: 'ANY',
  ServiceID: eghl.serviceId,
  TransactionType: 'SALE',
  TxnID: '',
  TxnMessage: 'Buyer cancelled',
  TxnStatus: '1',
})

const duplicatePaymentIdReturn = withBothHashes({
  ...cancelOrTimeoutReturn,
  TxnMessage: 'Duplicate Payment ID',
})

/** The status query answer for any payment whose page was opened: cancelled, timed out or idle. */
const openedPageAnswer = withBothHashes({
  Amount: '1.00',
  CurrencyCode: 'MYR',
  OrderNumber: PAYMENT_ID,
  PaymentID: PAYMENT_ID,
  PymtMethod: 'ANY',
  ServiceID: eghl.serviceId,
  TransactionType: 'QUERY',
  TxnExists: '0',
  TxnID: '',
  TxnMessage: '',
  TxnStatus: '2',
})

const neverOpenedAnswer = withHashValue({
  Amount: '1.00',
  CurrencyCode: 'MYR',
  OrderNumber: PAYMENT_ID,
  PaymentID: PAYMENT_ID,
  PymtMethod: 'ANY',
  ServiceID: eghl.serviceId,
  TransactionType: 'QUERY',
  TxnExists: '1',
  TxnID: '',
  TxnMessage: '',
  TxnStatus: '-1',
})

const syntheticConfirmedFailureAnswer = withBothHashes({
  ...openedPageAnswer,
  TxnID: `GW${PAYMENT_ID}`,
  TxnMessage: 'Transaction Failed',
  TxnStatus: '1',
})

const encoded = (fields: Record<string, string>) => new URLSearchParams(fields).toString()

const answering = (answer: Record<string, string>) =>
  vi.fn<typeof fetch>(() => Promise.resolve(new Response(encoded(answer), { status: 200 })))

const pendingTransaction = () =>
  createFakeDb()
    .on(findPendingAmountInCents, () => 100)
    .on(lockTransaction, () => ({
      amountInCents: 100,
      createdAs: 'guest',
      status: 'pending',
      userId: 5,
    }))
    .on(findProviderTxnIds, () => [])
    .on(moveTransaction, ({ to }) => ({ status: to }))
    .on(insertPayment, () => {})

const withGateway = async <T>(gateway: typeof fetch, run: () => Promise<T>) => {
  vi.stubGlobal('fetch', gateway)
  try {
    return await run()
  } finally {
    vi.unstubAllGlobals()
  }
}

const returnWith = async (reply: Record<string, string>, answer: Record<string, string>) => {
  const db = pendingTransaction()
  const gateway = answering(answer)
  const redirect = await withGateway(gateway, async () =>
    handleEghlReturnGet(
      testDeps({ db }),
      new Request(`https://app.give.test/api/eghl/return?${encoded(reply)}`),
    ),
  ).catch((error: unknown) => error)
  return { db, gateway, redirect }
}

const callbackWith = async (reply: Record<string, string>, answer: Record<string, string>) => {
  const db = pendingTransaction()
  const gateway = answering(answer)
  const response = await withGateway(gateway, async () =>
    handleEghlCallback(
      testDeps({ db }),
      new Request('https://app.give.test/api/eghl/callback', {
        body: encoded(reply),
        method: 'POST',
      }),
    ),
  )
  return { db, gateway, response }
}

const queriesRun = (db: ReturnType<typeof pendingTransaction>) => db.calls.map(({ name }) => name)

const paymentsQueried = (gateway: ReturnType<typeof answering>) =>
  gateway.mock.calls.map(([, init]) =>
    new URLSearchParams(init?.body as URLSearchParams).get('PaymentID'),
  )

const SETTLED_WITH_A_PAYMENTS_ROW = [
  'payments.findPendingAmountInCents',
  'payments.lockTransaction',
  'payments.findProviderTxnIds',
  'payments.moveTransaction',
  'payments.insertPayment',
]

const movedToCancelled = {
  args: [{ from: 'pending', to: 'cancelled', transactionId: PAYMENT_ID }],
  name: 'payments.moveTransaction',
}

const cancelledPayment = {
  args: [
    expect.objectContaining({
      message: 'Buyer cancelled',
      providerTransactionId: '',
      transactionId: PAYMENT_ID,
    }),
  ],
  name: 'payments.insertPayment',
}

const toReceipt = {
  options: { params: { transactionId: PAYMENT_ID }, to: '/transaction/receipt/$transactionId' },
}

describe('eGHL live replies as classified today', () => {
  it('checks a cancel or timeout return with the gateway instead of settling it', () => {
    expect.hasAssertions()

    expect(inboundActionOf(EghlPaymentResponseSchema.Parse(cancelOrTimeoutReturn))).toBe(
      'confirm-by-query',
    )
  })

  it("checks a refreshed page's duplicate PaymentID return with the gateway instead of settling it", () => {
    expect.hasAssertions()

    expect(inboundActionOf(EghlPaymentResponseSchema.Parse(duplicatePaymentIdReturn))).toBe(
      'confirm-by-query',
    )
  })

  it('does not settle a payment whose page was opened, since the gateway answers pending with no TxnID', () => {
    expect.hasAssertions()

    expect(finalStatusOf(EghlQueryResponseSchema.Parse(openedPageAnswer))).toBeNull()
  })

  it('does not settle a payment whose page was never opened, since the gateway answers not found', () => {
    expect.hasAssertions()

    expect(finalStatusOf(EghlQueryResponseSchema.Parse(neverOpenedAnswer))).toBeNull()
  })
})

describe('a cancel or timeout return', () => {
  it("settles the transaction cancelled with the reply's message and shows the receipt when the gateway answers for an opened page", async () => {
    expect.hasAssertions()

    const { db, gateway, redirect } = await returnWith(cancelOrTimeoutReturn, openedPageAnswer)

    expect(paymentsQueried(gateway)).toStrictEqual([PAYMENT_ID])
    expect(queriesRun(db)).toStrictEqual(SETTLED_WITH_A_PAYMENTS_ROW)
    expect(db.calls).toContainEqual(movedToCancelled)
    expect(db.calls).toContainEqual(cancelledPayment)
    expect(redirect).toMatchObject(toReceipt)
  })

  it("acknowledges the callback and settles the transaction cancelled with the reply's message when the gateway answers for an opened page", async () => {
    expect.hasAssertions()

    const { db, gateway, response } = await callbackWith(cancelOrTimeoutReturn, openedPageAnswer)

    expect(paymentsQueried(gateway)).toStrictEqual([PAYMENT_ID])
    expect(queriesRun(db)).toStrictEqual(SETTLED_WITH_A_PAYMENTS_ROW)
    expect(db.calls).toContainEqual(movedToCancelled)
    expect(db.calls).toContainEqual(cancelledPayment)
    await expect(response.text()).resolves.toBe('OK')
  })

  it('leaves the transaction pending when the gateway has never seen the payment', async () => {
    expect.hasAssertions()

    const { db, gateway, redirect } = await returnWith(cancelOrTimeoutReturn, neverOpenedAnswer)

    expect(paymentsQueried(gateway)).toStrictEqual([PAYMENT_ID])
    expect(queriesRun(db)).toStrictEqual(['payments.findPendingAmountInCents'])
    expect(redirect).toMatchObject(toReceipt)
  })

  it('settles the transaction as failed when the gateway confirms a failure', async () => {
    expect.hasAssertions()

    const { db } = await returnWith(cancelOrTimeoutReturn, syntheticConfirmedFailureAnswer)

    expect(db.calls).toContainEqual({
      args: [{ from: 'pending', to: 'failed', transactionId: PAYMENT_ID }],
      name: 'payments.moveTransaction',
    })
  })
})

describe("a refreshed page's duplicate PaymentID return", () => {
  it('leaves the transaction pending and shows the receipt when the gateway answers for an opened page', async () => {
    expect.hasAssertions()

    const { db, gateway, redirect } = await returnWith(duplicatePaymentIdReturn, openedPageAnswer)

    expect(paymentsQueried(gateway)).toStrictEqual([PAYMENT_ID])
    expect(queriesRun(db)).toStrictEqual(['payments.findPendingAmountInCents'])
    expect(redirect).toMatchObject(toReceipt)
  })
})

const failedWithout = (TxnMessage: string) =>
  withBothHashes({ ...cancelOrTimeoutReturn, TxnMessage })

describe('a failed reply with no gateway transaction that does not say cancel', () => {
  it.each(['Duplicate PaymentID', 'Transaction Failed', ''])(
    'leaves the transaction pending and shows the receipt for %j when the gateway answers for an opened page',
    async (message) => {
      expect.hasAssertions()

      const { db, gateway, redirect } = await returnWith(failedWithout(message), openedPageAnswer)

      expect(paymentsQueried(gateway)).toStrictEqual([PAYMENT_ID])
      expect(queriesRun(db)).toStrictEqual(['payments.findPendingAmountInCents'])
      expect(redirect).toMatchObject(toReceipt)
    },
  )

  it.each(['Duplicate PaymentID', 'Transaction Failed', ''])(
    'acknowledges the callback and leaves the transaction pending for %j when the gateway answers for an opened page',
    async (message) => {
      expect.hasAssertions()

      const { db, gateway, response } = await callbackWith(failedWithout(message), openedPageAnswer)

      expect(paymentsQueried(gateway)).toStrictEqual([PAYMENT_ID])
      expect(queriesRun(db)).toStrictEqual(['payments.findPendingAmountInCents'])
      await expect(response.text()).resolves.toBe('OK')
    },
  )
})
