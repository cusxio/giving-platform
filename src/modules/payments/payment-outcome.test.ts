import { describe, expect, it } from 'vitest'

import { assertExhaustive } from '#/core/assert-exhaustive'
import type { Reachable, TransactionStatus } from '#/core/transaction-status'
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
import {
  decide,
  EXPIRE_AFTER_MINUTES,
  PAGE_TIMEOUT_MINUTES,
  planTransition,
  RECONCILE_MIN_AGE_MINUTES,
} from './payment-outcome'

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

const stored = (
  status: TransactionStatus,
  providerTxnIds: readonly (string | null)[] = [],
): StoredTransaction => ({
  amountInCents: 5000,
  createdAs: 'guest',
  providerTxnIds,
  status,
  userId: 7,
})

const transition = (to: Reachable, from: TransactionStatus) => ({
  from,
  to,
  transactionId: 'txn_abc123',
})
const move = (to: 'failed' | 'success', from: TransactionStatus = 'pending') => ({
  kind: 'move',
  transition: transition(to, from),
})
const hold = (why: HoldReason, money: Money, from: TransactionStatus = 'pending') => ({
  kind: 'hold',
  received: MONEY[money],
  transition: transition('held', from),
  why,
})

/** A planned transition is a class instance, so the table compares its fields. */
const fieldsOf = (plan: Plan) =>
  plan.kind === 'absorb'
    ? plan
    : {
        ...plan,
        transition: {
          from: plan.transition.from,
          to: plan.transition.to,
          transactionId: plan.transition.transactionId,
        },
      }
const absorb = (at: TransactionStatus, why: 'contradiction' | 'replay'): Plan => ({
  at,
  kind: 'absorb',
  why,
})
const each = (plan: Expected): Record<Money, Expected> => ({
  'another amount': plan,
  'another amount and currency': plan,
  'another currency': plan,
  'same money': plan,
})
const holdEach = (why: HoldReason, from?: TransactionStatus): Record<Money, Expected> => ({
  'another amount': hold(why, 'another amount', from),
  'another amount and currency': hold(why, 'another amount and currency', from),
  'another currency': hold(why, 'another currency', from),
  'same money': hold(why, 'same money', from),
})

type Expected = Plan | ReturnType<typeof hold> | ReturnType<typeof move>

const PLAN_TABLE: [TransactionStatus, Settling['kind'], Record<Money, Expected>][] = [
  [
    'pending',
    'succeeded',
    {
      'another amount': hold('amount_mismatch', 'another amount'),
      'another amount and currency': hold('currency_mismatch', 'another amount and currency'),
      'another currency': hold('currency_mismatch', 'another currency'),
      'same money': move('success'),
    },
  ],
  ['pending', 'failed', each(move('failed'))],
  ['pending', 'expired', each(move('failed'))],
  ['success', 'succeeded', each(absorb('success', 'replay'))],
  ['success', 'failed', each(absorb('success', 'contradiction'))],
  ['success', 'expired', each(absorb('success', 'contradiction'))],
  [
    'failed',
    'succeeded',
    {
      'another amount': hold('amount_mismatch', 'another amount', 'failed'),
      'another amount and currency': hold(
        'currency_mismatch',
        'another amount and currency',
        'failed',
      ),
      'another currency': hold('currency_mismatch', 'another currency', 'failed'),
      'same money': move('success', 'failed'),
    },
  ],
  ['failed', 'failed', each(absorb('failed', 'replay'))],
  ['failed', 'expired', each(absorb('failed', 'replay'))],
  [
    'held',
    'succeeded',
    {
      'another amount': absorb('held', 'replay'),
      'another amount and currency': absorb('held', 'replay'),
      'another currency': absorb('held', 'replay'),
      'same money': absorb('held', 'contradiction'),
    },
  ],
  ['held', 'failed', each(absorb('held', 'contradiction'))],
  ['held', 'expired', each(absorb('held', 'contradiction'))],
]

/** eGHL gives a PaymentID's failure and its success the same TxnID. */
const RECORDED = [record.providerTxnId]

const RECORDED_PLAN_TABLE: typeof PLAN_TABLE = [
  ['pending', 'succeeded', holdEach('conflict')],
  ['success', 'succeeded', each(absorb('success', 'replay'))],
  ['failed', 'succeeded', holdEach('conflict', 'failed')],
  ['held', 'succeeded', each(absorb('held', 'replay'))],
  ...PLAN_TABLE.filter(([, kind]) => kind !== 'succeeded'),
]

const cellsOf = (table: typeof PLAN_TABLE) =>
  table.flatMap(([status, kind, plans]) =>
    MONIES.map((money) => [status, kind, money, plans[money]] as const),
  )
const PLAN_CELLS = cellsOf(PLAN_TABLE)
const RECORDED_PLAN_CELLS = cellsOf(RECORDED_PLAN_TABLE)

const STEPS = {
  expired: outcomeOf('expired'),
  failed: outcomeOf('failed'),
  mismatched: outcomeOf('succeeded', 'another amount'),
  otherTxnId: { card: null, kind: 'succeeded', record: { ...record, providerTxnId: 'CIVother' } },
  succeeded: outcomeOf('succeeded'),
} as const satisfies Record<string, Settling>
type Step = keyof typeof STEPS
const STEP_KINDS = Object.keys(STEPS) as Step[]

const RANK: Record<TransactionStatus, number> = { failed: 1, held: 2, pending: 0, success: 2 }

interface Row {
  readonly status: TransactionStatus
  readonly txnIds: readonly string[]
}

const STARTS = {
  'failed by a gateway failure': { status: 'failed', txnIds: RECORDED },
  'failed by the cron': { status: 'failed', txnIds: [] },
  held: { status: 'held', txnIds: [] },
  'held after a gateway failure': { status: 'held', txnIds: RECORDED },
  pending: { status: 'pending', txnIds: [] },
  success: { status: 'success', txnIds: RECORDED },
} as const satisfies Record<string, Row>
type Start = keyof typeof STARTS
const START_NAMES = Object.keys(STARTS) as Start[]

const planAndRecord = (row: Row, step: Step): Row => {
  const outcome = STEPS[step]
  const plan = planTransition({ ...stored(row.status), providerTxnIds: row.txnIds }, outcome)
  if (plan.kind === 'absorb') {
    return row
  }
  const wrote = plan.kind === 'move' && outcome.kind !== 'expired'
  return {
    status: plan.transition.to,
    txnIds: wrote ? [...row.txnIds, outcome.record.providerTxnId] : row.txnIds,
  }
}

function run(start: Row, sequence: readonly Step[]) {
  const trail = [start]
  for (const step of sequence) {
    trail.push(planAndRecord(trail.at(-1)!, step))
  }
  return trail
}
const statusesOf = (start: Start, sequence: readonly Step[]) =>
  run(STARTS[start], sequence).map(({ status }) => status)

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

const movesInto = (to: TransactionStatus) =>
  START_NAMES.filter((start) => STARTS[start].status !== to).flatMap((start) =>
    STEP_KINDS.filter((step) => planAndRecord(STARTS[start], step).status === to).map((step) => [
      start,
      step,
    ]),
  )

const PAYING_STEPS = new Set<Step>(['mismatched', 'otherTxnId', 'succeeded'])
const paid = (sequence: readonly Step[]) => sequence.some((step) => PAYING_STEPS.has(step))

const neverDecreases = (trail: readonly TransactionStatus[]) =>
  trail.every((status, index) => index === 0 || RANK[status] >= RANK[trail[index - 1]!])

describe('planning a transition', () => {
  it.each([
    ['no payments row', PLAN_CELLS],
    ['a payments row under the TxnID', RECORDED_PLAN_CELLS],
  ] as const)(
    'covers every stored status against every outcome and every money, with %s',
    (_history, table) => {
      expect.hasAssertions()

      const cells = table.map(([status, kind, money]) => `${status}/${kind}/${money}`)
      const every = TRANSACTION_STATUSES.flatMap((status) =>
        OUTCOME_KINDS.flatMap((kind) => MONIES.map((money) => `${status}/${kind}/${money}`)),
      )

      expect(cells).toHaveLength(every.length)
      expect(new Set(cells)).toStrictEqual(new Set(every))
    },
  )

  it.each(PLAN_CELLS)('plans %s + %s with %s', (status, kind, money, plan) => {
    expect.hasAssertions()

    expect(fieldsOf(planTransition(stored(status), outcomeOf(kind, money)))).toStrictEqual(plan)
  })

  it.each(RECORDED_PLAN_CELLS)(
    'plans %s + %s with %s when a payments row carries the TxnID',
    (status, kind, money, plan) => {
      expect.hasAssertions()

      expect(
        fieldsOf(planTransition(stored(status, RECORDED), outcomeOf(kind, money))),
      ).toStrictEqual(plan)
    },
  )

  it('absorbs a mismatched success replayed onto a success row as a replay, not a hold', () => {
    expect.hasAssertions()

    const mismatched = outcomeOf('succeeded', 'another amount and currency')

    expect(fieldsOf(planTransition(stored('pending'), mismatched))).toStrictEqual(
      hold('currency_mismatch', 'another amount and currency'),
    )
    expect(planTransition(stored('success'), mismatched)).toStrictEqual(absorb('success', 'replay'))
  })

  it('holds a success for other money under a TxnID a failed row recorded as a conflict, not a mismatch', () => {
    expect.hasAssertions()

    const mismatched = outcomeOf('succeeded', 'another amount and currency')

    expect(fieldsOf(planTransition(stored('failed', RECORDED), mismatched))).toStrictEqual(
      hold('conflict', 'another amount and currency', 'failed'),
    )
  })

  it('still calls a failure for the TxnID a success row recorded a contradiction', () => {
    expect.hasAssertions()

    expect(
      planTransition(stored('success', [record.providerTxnId]), outcomeOf('failed')),
    ).toStrictEqual(absorb('success', 'contradiction'))
  })

  it.each([
    ['a gateway failure under another TxnID', ['CIVdeclined']],
    ['a failure with no TxnID', [null, '']],
    ['no payments row, as the cron expires it', []],
  ] as const)('corrects a failed row that recorded %s', (_case, providerTxnIds) => {
    expect.hasAssertions()

    expect(
      fieldsOf(planTransition(stored('failed', providerTxnIds), outcomeOf('succeeded'))),
    ).toStrictEqual(move('success', 'failed'))
  })

  it('never matches an empty TxnID to a payments row with an empty TxnID', () => {
    expect.hasAssertions()

    const noTxnId = {
      card: null,
      kind: 'succeeded',
      record: { ...record, providerTxnId: '' },
    } as const

    expect(fieldsOf(planTransition(stored('failed', ['']), noTxnId))).toStrictEqual(
      move('success', 'failed'),
    )
  })
})

describe('any sequence of outcomes', () => {
  const all = sequences(4)

  it('enumerates every sequence of length 1 to 4', () => {
    expect.hasAssertions()

    expect(all).toHaveLength(5 + 25 + 125 + 625)
  })

  it.each(START_NAMES)('from %s never lowers the status rank', (start) => {
    expect.hasAssertions()

    const violations = all.filter((sequence) => !neverDecreases(statusesOf(start, sequence)))

    expect(violations).toStrictEqual([])
  })

  it.each(START_NAMES)('from %s never records a TxnID twice', (start) => {
    expect.hasAssertions()

    const counted = all.filter((sequence) => {
      const { txnIds } = run(STARTS[start], sequence).at(-1)!
      return new Set(txnIds).size !== txnIds.length
    })

    expect(counted).toStrictEqual([])
  })

  it('never leaves held, and reaches it only through a mismatched success or a recorded TxnID', () => {
    expect.hasAssertions()

    const leftHeld = START_NAMES.filter((start) => STARTS[start].status === 'held').flatMap(
      (start) => all.filter((sequence) => statusesOf(start, sequence).some((s) => s !== 'held')),
    )

    expect(leftHeld).toStrictEqual([])
    expect(movesInto('held')).toStrictEqual([
      ['failed by a gateway failure', 'mismatched'],
      ['failed by a gateway failure', 'succeeded'],
      ['failed by the cron', 'mismatched'],
      ['pending', 'mismatched'],
    ])
  })

  it('never leaves success, and reaches it only through a matching success under a new TxnID', () => {
    expect.hasAssertions()

    const leftSuccess = all.filter((sequence) =>
      statusesOf('success', sequence).some((s) => s !== 'success'),
    )

    expect(leftSuccess).toStrictEqual([])
    expect(movesInto('success')).toStrictEqual([
      ['failed by a gateway failure', 'otherTxnId'],
      ['failed by the cron', 'otherTxnId'],
      ['failed by the cron', 'succeeded'],
      ['pending', 'otherTxnId'],
      ['pending', 'succeeded'],
    ])
  })

  it.each(START_NAMES)('from %s never ends failed once a success arrived', (start) => {
    expect.hasAssertions()

    const failedAfterPaying = all
      .filter((sequence) => paid(sequence))
      .filter((sequence) => statusesOf(start, sequence).at(-1) === 'failed')

    expect(failedAfterPaying).toStrictEqual([])
  })

  it.each(START_NAMES)('from %s ends where its replay ends', (start) => {
    expect.hasAssertions()

    const drifted = all.filter((sequence) => {
      const once = run(STARTS[start], sequence).at(-1)!
      return run(once, sequence).at(-1)!.status !== once.status
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

describe('the eGHL page time limit', () => {
  it('closes the page before the cron first queries the row or expires it as not found', () => {
    expect.hasAssertions()

    expect(PAGE_TIMEOUT_MINUTES).toBeLessThan(RECONCILE_MIN_AGE_MINUTES)
    expect(PAGE_TIMEOUT_MINUTES).toBeLessThan(EXPIRE_AFTER_MINUTES)
  })

  it('fits in seconds in the four digits eGHL reads from PageTimeout', () => {
    expect.hasAssertions()

    expect(PAGE_TIMEOUT_MINUTES * 60).toBeLessThanOrEqual(9999)
  })
})
