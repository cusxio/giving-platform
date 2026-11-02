import type { Result } from 'better-result'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { outcomeOf, replyOf } from './eghl.outcome'
import type { EghlPaymentResponse, EghlQueryResponse, Verified } from './eghl.wire'
import type { PaymentGateway } from './gateway'
import type { GatewayReply, PaymentOutcome, PaymentRecord } from './payment-outcome'

type OkOf<F extends (...args: never[]) => Promise<unknown>> =
  Awaited<ReturnType<F>> extends Result<infer V, unknown> ? V : never

type Keys<T> = T extends Date
  ? never
  : T extends readonly (infer E)[]
    ? Keys<E>
    : T extends object
      ? { [K in keyof T]-?: (K & string) | Keys<T[K]> }[keyof T]
      : never

type PascalCase<K> = K extends `${infer First}${string}`
  ? First extends Uppercase<First>
    ? First extends Lowercase<First>
      ? never
      : K
    : never
  : never

type PortData =
  | OkOf<PaymentGateway['queryStatus']>
  | OkOf<PaymentGateway['readReply']>
  | Parameters<PaymentGateway['paymentRequestUrl']>[0]
  | Parameters<PaymentGateway['queryStatus']>[0]

const record: PaymentRecord = {
  amountInCents: 5000,
  currency: 'MYR',
  message: 'Transaction Failed',
  method: 'ANY',
  paidAt: null,
  providerTxnId: '',
  transactionId: 'txn_abc123',
}

describe('the payment gateway port', () => {
  it('names no wire field in anything it takes or returns', () => {
    expect.assertions(0)

    expectTypeOf<PascalCase<Keys<PortData>>>().toBeNever()
    expectTypeOf<PascalCase<Keys<EghlPaymentResponse>>>().not.toBeNever()
  })

  it('returns exactly the domain types', () => {
    expect.assertions(0)

    expectTypeOf<OkOf<PaymentGateway['readReply']>>().toEqualTypeOf<GatewayReply>()
    expectTypeOf<OkOf<PaymentGateway['queryStatus']>>().toEqualTypeOf<PaymentOutcome>()
  })

  it('accepts no wire reply where a domain value is expected', () => {
    expect.assertions(0)

    expectTypeOf<EghlPaymentResponse>().not.toExtend<GatewayReply>()
    expectTypeOf<EghlQueryResponse>().not.toExtend<PaymentOutcome>()
  })

  it('maps only a reply or answer the adapter verified', () => {
    expect.assertions(0)

    expectTypeOf<EghlPaymentResponse>().not.toExtend<Parameters<typeof replyOf>[0]>()
    expectTypeOf<EghlQueryResponse>().not.toExtend<Parameters<typeof outcomeOf>[0]>()
    expectTypeOf<Verified<EghlPaymentResponse>>().toExtend<Parameters<typeof replyOf>[0]>()
    expectTypeOf<Verified<EghlQueryResponse>>().toExtend<Parameters<typeof outcomeOf>[0]>()
  })

  it('settles a reply only on a success', () => {
    expect.hasAssertions()

    // @ts-expect-error: a reply alone never settles a failure
    const settledFailure: GatewayReply = { kind: 'settled', outcome: { kind: 'failed', record } }

    expect(settledFailure.kind).toBe('settled')
  })
})
