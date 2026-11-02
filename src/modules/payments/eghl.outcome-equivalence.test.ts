import { describe, expect, it } from 'vitest'

import { finalStatusOf, inboundActionOf, outcomeOf, replyOf } from './eghl.outcome'
import type { EghlPaymentResponse, EghlQueryResponse } from './eghl.wire'
import { EghlQueryTxnStatus, EghlTxnExists, EghlTxnStatus } from './eghl.wire'

const messages = ['Transaction Failed', 'Buyer cancelled', 'Duplicate Payment ID', '']
const paymentStatuses = Object.values(EghlTxnStatus)
const queryStatuses = [...paymentStatuses, ...Object.values(EghlQueryTxnStatus)]

const fields = {
  Amount: '50.00',
  CurrencyCode: 'MYR',
  HashValue: 'hash',
  HashValue2: 'hash2',
  OrderNumber: 'txn_abc123',
  PaymentID: 'txn_abc123',
  PymtMethod: 'ANY',
  ServiceID: 'service-123',
  TransactionType: 'SALE',
  TxnID: 'CIVtxn_abc123',
}

const reply = (TxnStatus: EghlTxnStatus, TxnMessage: string): EghlPaymentResponse => ({
  ...fields,
  TxnMessage,
  TxnStatus,
})

const replies = paymentStatuses.flatMap((TxnStatus) =>
  messages.map((TxnMessage) => reply(TxnStatus, TxnMessage)),
)

const answer = (
  TxnExists: EghlTxnExists,
  TxnStatus: EghlQueryResponse['TxnStatus'],
  TxnMessage: string,
) => ({ ...fields, TxnExists, TxnMessage, TxnStatus }) as EghlQueryResponse

// Every pairing the old function was written against, including ones the schema now rejects.
const answers = Object.values(EghlTxnExists).flatMap((TxnExists) =>
  queryStatuses.flatMap((TxnStatus) =>
    messages.map((TxnMessage) => answer(TxnExists, TxnStatus, TxnMessage)),
  ),
)

const actionOf = (wire: EghlPaymentResponse) =>
  ({ pending: 'leave-pending', settled: 'settle-success', unconfirmed: 'confirm-by-query' })[
    replyOf(wire).kind
  ]

const statusOf = (wire: EghlQueryResponse) => {
  const outcome = outcomeOf(wire)
  if (outcome.isErr()) {
    return null
  }
  return { failed: 'failed', notFound: null, pending: null, succeeded: 'success' }[
    outcome.value.kind
  ]
}

describe('the domain mapping against the classification it replaces', () => {
  it.each(replies.map((wire) => [wire.TxnStatus, wire.TxnMessage, wire] as const))(
    'decides a reply with status %s and message %j as before',
    (_status, _message, wire) => {
      expect.hasAssertions()

      expect(actionOf(wire)).toBe(inboundActionOf(wire))
    },
  )

  it.each(answers.map((wire) => [wire.TxnExists, wire.TxnStatus, wire.TxnMessage, wire] as const))(
    'settles a query answer with TxnExists %s, status %s and message %j as before',
    (_exists, _status, _message, wire) => {
      expect.hasAssertions()

      expect(statusOf(wire)).toBe(finalStatusOf(wire))
    },
  )
})
