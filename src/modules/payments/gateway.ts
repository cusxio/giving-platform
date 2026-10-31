/** What the payments module needs from a payment gateway, in its own terms. */
export interface PaymentGateway {
  /** The gateway page that takes the donor's payment for a pending transaction. */
  readonly paymentRequestUrl: (request: PaymentRequest) => string
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
