import type { Result } from 'better-result'

import type { EghlQueryError, EghlReplyError } from './eghl.errors'
import type { GatewayReply, PaymentOutcome } from './payment-outcome'

/** What the payments module needs from a payment gateway. No wire field crosses it. */
export interface PaymentGateway {
  /** The gateway page that takes the donor's payment for a pending transaction. */
  readonly paymentRequestUrl: (request: PaymentRequest) => string
  /** Reads a callback or return request and checks its signature. */
  readonly readReply: (request: Request) => Promise<Result<GatewayReply, EghlReplyError>>
  /** Asks the gateway, server to server, where a transaction stands. */
  readonly queryStatus: (query: StatusQuery) => Promise<Result<PaymentOutcome, EghlQueryError>>
}

export interface PaymentRequest {
  readonly amountInCents: number
  readonly customerEmail: string
  readonly customerName: string
  readonly description: string
  /** A saved card's token; the gateway charges that card instead of asking for one. */
  readonly token?: string
  readonly transactionId: string
}

interface StatusQuery {
  readonly amountInCents: number
  readonly transactionId: string
}
