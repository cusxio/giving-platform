import { assertExhaustive } from '#/core/assert-exhaustive'

import { EghlQueryTxnStatus, EghlTxnStatus } from './eghl.schema'

export type EghlFinalStatus = 'failed' | 'success'

interface EghlReplyStatus {
  readonly TxnMessage: string
  readonly TxnStatus: EghlQueryTxnStatus | EghlTxnStatus
}

/** Returns null when the reply does not settle the transaction, so it stays pending. */
export function finalStatusOf(reply: EghlReplyStatus): EghlFinalStatus | null {
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
