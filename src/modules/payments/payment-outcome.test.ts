import { describe, expect, it } from 'vitest'

import type { TransactionStatus } from '#/core/transaction-status'
import { TRANSACTION_STATUSES } from '#/core/transaction-status'

import type {
  PaymentRecord,
  Plan,
  Settling,
  StoredTransaction,
  Transition,
} from './payment-outcome'
import { planTransition } from './payment-outcome'

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

const move = (from: TransactionStatus, to: 'failed' | 'success'): Plan => ({
  kind: 'move',
  transition: { from, to, transactionId: 'txn_abc123' } as Transition,
})
const absorb = (at: TransactionStatus, why: 'contradiction' | 'replay'): Plan => ({
  at,
  kind: 'absorb',
  why,
})

const PLAN_TABLE: [TransactionStatus, Settling['kind'], Plan][] = [
  ['pending', 'succeeded', move('pending', 'success')],
  ['pending', 'failed', move('pending', 'failed')],
  ['success', 'succeeded', absorb('success', 'replay')],
  ['success', 'failed', absorb('success', 'contradiction')],
  ['failed', 'succeeded', absorb('failed', 'contradiction')],
  ['failed', 'failed', absorb('failed', 'replay')],
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

    expect(planTransition(stored(status), OUTCOMES[kind])).toStrictEqual(plan)
  })

  it('carries no runtime brand, so a transition is a plain record', () => {
    expect.hasAssertions()

    const plan = planTransition(stored('pending'), OUTCOMES.succeeded)

    expect(plan).toStrictEqual({
      kind: 'move',
      transition: { from: 'pending', to: 'success', transactionId: 'txn_abc123' },
    })
  })

  it('lets only the planner make a transition', () => {
    expect.hasAssertions()

    // @ts-expect-error only planTransition constructs a Transition
    const forged: Transition = { from: 'pending', to: 'success', transactionId: 'txn_abc123' }

    expect(forged.to).toBe('success')
  })
})

describe('any sequence of outcomes', () => {
  const all = sequences(4)

  it('enumerates every sequence of length 1 to 4', () => {
    expect.hasAssertions()

    expect(all).toHaveLength(2 + 4 + 8 + 16)
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
