import { assertExhaustive } from '#/core/assert-exhaustive'

import type { EghlPaymentResponse, EghlQueryResponse } from './eghl.wire'
import { EghlQueryTxnStatus, EghlTxnExists, EghlTxnStatus } from './eghl.wire'

export type EghlFinalStatus = 'failed' | 'success'

/**
 * What a callback or return reply may do on its own. Its signature covers TxnStatus but not
 * TxnMessage, so a failure is only settled after our own status query confirms it.
 */
export type EghlInboundAction = 'confirm-by-query' | 'leave-pending' | 'settle-success'

export function inboundActionOf(reply: Pick<EghlPaymentResponse, 'TxnStatus'>): EghlInboundAction {
  switch (reply.TxnStatus) {
    case EghlTxnStatus.Success: {
      return 'settle-success'
    }
    case EghlTxnStatus.Failed: {
      return 'confirm-by-query'
    }
    case EghlTxnStatus.Pending: {
      return 'leave-pending'
    }
    default: {
      return assertExhaustive(reply.TxnStatus)
    }
  }
}

type EghlQueryReplyStatus = Pick<EghlQueryResponse, 'TxnExists' | 'TxnMessage' | 'TxnStatus'>

/** Returns null when the query reply does not settle the transaction, so it stays pending. */
export function finalStatusOf(reply: EghlQueryReplyStatus): EghlFinalStatus | null {
  if (reply.TxnExists !== EghlTxnExists.Exists) {
    return null
  }

  switch (reply.TxnStatus) {
    case EghlTxnStatus.Success: {
      return 'success'
    }
    case EghlTxnStatus.Failed: {
      // eGHL rejects a reused PaymentID (e.g. a refreshed payment page) with a failure that
      // describes the repeated request, not the original attempt.
      return reply.TxnMessage.toLowerCase().includes('duplicate payment id') ? null : 'failed'
    }
    case EghlTxnStatus.Pending:
    case EghlQueryTxnStatus.Authorized:
    case EghlQueryTxnStatus.Captured:
    case EghlQueryTxnStatus.InternalError:
    case EghlQueryTxnStatus.NotFound:
    case EghlQueryTxnStatus.Refunded:
    case EghlQueryTxnStatus.ReversalPending:
    case EghlQueryTxnStatus.Reversed: {
      return null
    }
    default: {
      return assertExhaustive(reply.TxnStatus)
    }
  }
}
