import { describe, expect, it } from 'vitest'

import { assertExhaustive } from '#/core/assert-exhaustive'
import type { TransactionStatus } from '#/core/transaction-status'
import { TRANSACTION_STATUSES } from '#/core/transaction-status'

import type {
  Decision,
  HoldReason,
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

const MONEY = {
  'same money': record,
  'another amount': { ...record, amountInCents: 9900 },
  'another currency': { ...record, currency: 'USD' },
  'another amount and currency': { ...record, amountInCents: 9900, currency: 'USD' },
} as const satisfies Record<string, PaymentRecord>
type Money = keyof typeof MONEY
const MONIES = Object.keys(MONEY) as Money[]

const outcomeOf = (kind: Settling['kind'], money: Money = 'same money'): Settling => {
  switch (kind) {
    case 'succeeded': {
      return { card: null, kind, record: MONEY[money] }
    }
    case 'failed': {
      return { kind, record: MONEY[money] }
    }
    case 'expired': {
      return { kind, transactionId: 'txn_abc123' }
    }
    default: {
      return assertExhaustive(kind)
    }
  }
}
const OUTCOME_KINDS = ['succeeded', 'failed', 'expired'] as const satisfies Settling['kind'][]

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
const hold = (why: HoldReason, money: Money): Plan => ({
  kind: 'hold',
  received: MONEY[money],
  why,
})
const each = (plan: Expected): Record<Money, Expected> => ({
  'another amount': plan,
  'another amount and currency': plan,
  'another currency': plan,
  'same money': plan,
})

type Expected = Plan | ReturnType<typeof move>

const PLAN_TABLE: [TransactionStatus, Settling['kind'], Record<Money, Expected>][] = [
  [
    'pending',
    'succeeded',
    {
      'another amount': hold('amount_mismatch', 'another amount'),
      'another amount and currency': hold('currency_mismatch', 'another amount and currency'),
      'another currency': hold('currency_mismatch', 'another currency'),
      'same money': move('pending', 'success'),
    },
  ],
  ['pending', 'failed', each(move('pending', 'failed'))],
  ['pending', 'expired', each(move('pending', 'failed'))],
  ['success', 'succeeded', each(absorb('success', 'replay'))],
  ['success', 'failed', each(absorb('success', 'contradiction'))],
  ['success', 'expired', each(absorb('success', 'contradiction'))],
  ['failed', 'succeeded', each(absorb('failed', 'contradiction'))],
  ['failed', 'failed', each(absorb('failed', 'replay'))],
  ['failed', 'expired', each(absorb('failed', 'replay'))],
]
const PLAN_CELLS = PLAN_TABLE.flatMap(([status, kind, plans]) =>
  MONIES.map((money) => [status, kind, money, plans[money]] as const),
)

const STEPS = {
  expired: outcomeOf('expired'),
  failed: outcomeOf('failed'),
  mismatched: outcomeOf('succeeded', 'another amount'),
  succeeded: outcomeOf('succeeded'),
} as const satisfies Record<string, Settling>
type Step = keyof typeof STEPS
const STEP_KINDS = Object.keys(STEPS) as Step[]

const RANK: Record<TransactionStatus, number> = { failed: 1, pending: 0, success: 2 }

const apply = (status: TransactionStatus, step: Step): TransactionStatus => {
  const plan = planTransition(stored(status), STEPS[step])
  return plan.kind === 'move' ? plan.transition.to : status
}

function run(start: TransactionStatus, sequence: readonly Step[]) {
  const trail = [start]
  for (const step of sequence) {
    trail.push(apply(trail.at(-1)!, step))
  }
  return trail
}

function sequences(maxLength: number): Step[][] {
  let frontier: Step[][] = [[]]
  const all: Step[][] = []
  for (let length = 1; length <= maxLength; length++) {
    const next: Step[][] = []
    for (const prefix of frontier) {
      for (const step of STEP_KINDS) {
        next.push([...prefix, step])
      }
    }
    frontier = next
    all.push(...frontier)
  }
  return all
}

const neverDecreases = (trail: readonly TransactionStatus[]) =>
  trail.every((status, index) => index === 0 || RANK[status] >= RANK[trail[index - 1]!])

describe('planning a transition', () => {
  it('covers every stored status against every outcome and every money', () => {
    expect.hasAssertions()

    const cells = PLAN_CELLS.map(([status, kind, money]) => `${status}/${kind}/${money}`)
    const every = TRANSACTION_STATUSES.flatMap((status) =>
      OUTCOME_KINDS.flatMap((kind) => MONIES.map((money) => `${status}/${kind}/${money}`)),
    )

    expect(cells).toHaveLength(every.length)
    expect(new Set(cells)).toStrictEqual(new Set(every))
  })

  it.each(PLAN_CELLS)('plans %s + %s with %s', (status, kind, money, plan) => {
    expect.hasAssertions()

    expect(fieldsOf(planTransition(stored(status), outcomeOf(kind, money)))).toStrictEqual(plan)
  })

  it('absorbs a mismatched success replayed onto a success row as a replay, not a hold', () => {
    expect.hasAssertions()

    const mismatched = outcomeOf('succeeded', 'another amount and currency')

    expect(planTransition(stored('pending'), mismatched)).toStrictEqual(
      hold('currency_mismatch', 'another amount and currency'),
    )
    expect(planTransition(stored('success'), mismatched)).toStrictEqual(absorb('success', 'replay'))
  })
})

describe('any sequence of outcomes', () => {
  const all = sequences(4)

  it('enumerates every sequence of length 1 to 4', () => {
    expect.hasAssertions()

    expect(all).toHaveLength(4 + 16 + 64 + 256)
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
  const cancelRecord = { ...record, message: 'Buyer cancelled', providerTxnId: '' }
  const cancelled = { claim: { kind: 'cancelled', record: cancelRecord } } as const
  const noReference = { ...record, message: '', providerTxnId: '' }
  const answers = {
    failed: { kind: 'failed', record },
    notFound: { kind: 'notFound' },
    pending: { answer: 'gateway_pending', kind: 'pending', record },
    succeeded: { card: null, kind: 'succeeded', record },
  } as const satisfies Record<PaymentOutcome['kind'], PaymentOutcome>
  const openedPage = { answer: 'gateway_pending', kind: 'pending', record: noReference } as const
  const repeatedId = { answer: 'inconclusive', kind: 'pending', record: noReference } as const
  const expire: Decision = {
    do: 'record',
    settling: { kind: 'expired', transactionId: 'txn_abc123' },
  }

  it.each([
    ['a success, against a claim', answers.succeeded, { claim }, answers.succeeded],
    ['a failure, against a claim', answers.failed, { claim }, answers.failed],
    ['a success, for the cron', answers.succeeded, polledAt(45), answers.succeeded],
    ['a failure, for the cron', answers.failed, polledAt(45), answers.failed],
    ['a success, against a cancelled claim', answers.succeeded, cancelled, answers.succeeded],
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
    ['a failed claim, pending with no reference', openedPage, { claim }, wait('gateway_pending')],
    ['a cancel, pending with a reference', answers.pending, cancelled, wait('gateway_pending')],
    ['a cancel, a rejected repeat', repeatedId, cancelled, wait('gateway_pending')],
    ['a cancel, not found', answers.notFound, cancelled, wait('not_found')],
    ['the cron, pending with no reference', openedPage, polledAt(2000), wait('gateway_pending')],
  ] as const)('decides %s', (_case, outcome, context, decision) => {
    expect.hasAssertions()

    expect(decide(outcome, context)).toStrictEqual(decision)
  })

  it("settles a cancel the gateway still reports pending with no reference as failed, with the reply's record", () => {
    expect.hasAssertions()

    expect(decide(openedPage, cancelled)).toStrictEqual({
      do: 'record',
      settling: { kind: 'failed', record: cancelRecord },
    })
  })
})
