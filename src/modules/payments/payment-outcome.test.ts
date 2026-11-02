import { describe, expect, it } from 'vitest'

import type { TransactionStatus } from '#/core/transaction-status'
import { TRANSACTION_STATUSES } from '#/core/transaction-status'

import type {
  Decision,
  PaymentOutcome,
  PaymentRecord,
  Plan,
  Settling,
  StoredTransaction,
} from './payment-outcome'
import { decide, planTransition } from './payment-outcome'

const record: PaymentRecord = {
  amountInCents: 5000,
  currency: 'MYR',
  message: 'Transaction Successful',
  method: 'CC',
  paidAt: null,
  providerTxnId: 'CIVtxn_abc123',
  transactionId: 'txn_abc123',
}

const OUTCOMES: Record<Settling['kind'], Settling> = {
  expired: { kind: 'expired', transactionId: 'txn_abc123' },
  failed: { kind: 'failed', record },
  succeeded: { card: null, kind: 'succeeded', record },
}
const OUTCOME_KINDS = Object.keys(OUTCOMES) as Settling['kind'][]

const stored = (status: TransactionStatus): StoredTransaction => ({
  amountInCents: 5000,
  createdAs: 'guest',
  status,
  userId: 7,
})

const move = (from: TransactionStatus, to: 'failed' | 'success') => ({
  kind: 'move',
  transition: { from, to, transactionId: 'txn_abc123' },
})

/** A planned transition is a class instance, so the table compares its fields. */
const fieldsOf = (plan: Plan) =>
  plan.kind === 'move'
    ? {
        kind: plan.kind,
        transition: {
          from: plan.transition.from,
          to: plan.transition.to,
          transactionId: plan.transition.transactionId,
        },
      }
    : plan
const absorb = (at: TransactionStatus, why: 'contradiction' | 'replay'): Plan => ({
  at,
  kind: 'absorb',
  why,
})

const PLAN_TABLE: [TransactionStatus, Settling['kind'], Plan | ReturnType<typeof move>][] = [
  ['pending', 'succeeded', move('pending', 'success')],
  ['pending', 'failed', move('pending', 'failed')],
  ['pending', 'expired', move('pending', 'failed')],
  ['success', 'succeeded', absorb('success', 'replay')],
  ['success', 'failed', absorb('success', 'contradiction')],
  ['success', 'expired', absorb('success', 'contradiction')],
  ['failed', 'succeeded', absorb('failed', 'contradiction')],
  ['failed', 'failed', absorb('failed', 'replay')],
  ['failed', 'expired', absorb('failed', 'replay')],
]

const RANK: Record<TransactionStatus, number> = { failed: 1, pending: 0, success: 2 }

const apply = (status: TransactionStatus, kind: Settling['kind']): TransactionStatus => {
  const plan = planTransition(stored(status), OUTCOMES[kind])
  return plan.kind === 'move' ? plan.transition.to : status
}

function run(start: TransactionStatus, sequence: readonly Settling['kind'][]) {
  const trail = [start]
  for (const kind of sequence) {
    trail.push(apply(trail.at(-1)!, kind))
  }
  return trail
}

function sequences(maxLength: number): Settling['kind'][][] {
  let frontier: Settling['kind'][][] = [[]]
  const all: Settling['kind'][][] = []
  for (let length = 1; length <= maxLength; length++) {
    frontier = frontier.flatMap((prefix) => OUTCOME_KINDS.map((kind) => [...prefix, kind]))
    all.push(...frontier)
  }
  return all
}

const neverDecreases = (trail: readonly TransactionStatus[]) =>
  trail.every((status, index) => index === 0 || RANK[status] >= RANK[trail[index - 1]!])

describe('planning a transition', () => {
  it('covers every stored status against every outcome', () => {
    expect.hasAssertions()

    const cells = PLAN_TABLE.map(([status, kind]) => `${status}/${kind}`)
    const every = TRANSACTION_STATUSES.flatMap((status) =>
      OUTCOME_KINDS.map((kind) => `${status}/${kind}`),
    )

    expect(cells).toHaveLength(every.length)
    expect(new Set(cells)).toStrictEqual(new Set(every))
  })

  it.each(PLAN_TABLE)('plans %s + %s', (status, kind, plan) => {
    expect.hasAssertions()

    expect(fieldsOf(planTransition(stored(status), OUTCOMES[kind]))).toStrictEqual(plan)
  })
})

describe('any sequence of outcomes', () => {
  const all = sequences(4)

  it('enumerates every sequence of length 1 to 4', () => {
    expect.hasAssertions()

    expect(all).toHaveLength(3 + 9 + 27 + 81)
  })

  it.each(TRANSACTION_STATUSES)('from %s never lowers the status rank', (start) => {
    expect.hasAssertions()

    const violations = all.filter((sequence) => !neverDecreases(run(start, sequence)))

    expect(violations).toStrictEqual([])
  })

  it.each(TRANSACTION_STATUSES)('from %s ends where its replay ends', (start) => {
    expect.hasAssertions()

    const drifted = all.filter((sequence) => {
      const once = run(start, sequence).at(-1)!
      return run(once, sequence).at(-1) !== once
    })

    expect(drifted).toStrictEqual([])
  })
})

const polledAt = (ageMinutes: number) => ({ ageMinutes, transactionId: 'txn_abc123' })
const wait = (why: 'gateway_pending' | 'not_found'): Decision => ({ do: 'wait', why })

describe('deciding what a status query answer means', () => {
  const claim = { kind: 'failed', record: { ...record, message: 'Card declined' } } as const
  const answers = {
    failed: { kind: 'failed', record },
    notFound: { kind: 'notFound' },
    pending: { kind: 'pending', record },
    succeeded: { card: null, kind: 'succeeded', record },
  } as const satisfies Record<PaymentOutcome['kind'], PaymentOutcome>
  const expire: Decision = {
    do: 'record',
    settling: { kind: 'expired', transactionId: 'txn_abc123' },
  }

  it.each([
    ['a success, against a claim', answers.succeeded, { claim }, answers.succeeded],
    ['a failure, against a claim', answers.failed, { claim }, answers.failed],
    ['a success, for the cron', answers.succeeded, polledAt(45), answers.succeeded],
    ['a failure, for the cron', answers.failed, polledAt(45), answers.failed],
  ] as const)('records %s as the gateway gave it', (_case, outcome, context, settling) => {
    expect.hasAssertions()

    expect(decide(outcome, context)).toStrictEqual({ do: 'record', settling })
  })

  it.each([
    ['pending, against a claim', answers.pending, { claim }, wait('gateway_pending')],
    ['pending, for the cron at any age', answers.pending, polledAt(2000), wait('gateway_pending')],
    ['not found, against a claim', answers.notFound, { claim }, wait('not_found')],
    ['not found, for the cron at 30 minutes', answers.notFound, polledAt(30), wait('not_found')],
    ['not found, for the cron past 30 minutes', answers.notFound, polledAt(30.001), expire],
  ] as const)('decides %s', (_case, outcome, context, decision) => {
    expect.hasAssertions()

    expect(decide(outcome, context)).toStrictEqual(decision)
  })
})
