import { describe, expect, it } from 'vitest'

import type { Reachable } from '#/core/transaction-status'
import { sourcesOf } from '#/core/transaction-status'
import { createDriverDb } from '#/server/testing/driver-db'
import { errValue, okValue } from '#/server/testing/result'

import type { PaymentRecord, Settling, Transition } from './payment-outcome'
import { planTransition } from './payment-outcome'
import {
  findProviderTxnIds,
  findReceipt,
  lockTransaction,
  moveTransaction,
} from './transactions.repository.server'

const TRANSACTION_ID = 'T2000000000000000001'

const record: PaymentRecord = {
  amountInCents: 100,
  currency: 'MYR',
  message: '',
  method: 'CC',
  paidAt: null,
  providerTxnId: '',
  transactionId: TRANSACTION_ID,
}

async function sent(run: (db: ReturnType<typeof createDriverDb>) => Promise<unknown>) {
  const statements: { params: unknown[]; sql: string }[] = []
  const db = createDriverDb((sql, params) => {
    statements.push({ params, sql })
    return Promise.resolve({ rows: [] })
  })
  await run(db)
  return statements
}

const lockedAs = (status: string) =>
  createDriverDb(() => Promise.resolve({ rowCount: 1, rows: [[100, 'guest', status, 7]] })).run(
    lockTransaction(TRANSACTION_ID),
  )

const OUTCOME_INTO = {
  cancelled: {
    kind: 'cancelled',
    record: { ...record, message: 'Buyer cancelled', providerTxnId: '' },
  },
  failed: { kind: 'failed', record },
  held: { card: null, kind: 'succeeded', record: { ...record, amountInCents: 9900 } },
  refunded: {
    kind: 'refunded',
    record: { ...record, message: 'Transaction refunded' },
    refundedAmountInCents: null,
  },
  success: { card: null, kind: 'succeeded', record },
} as const satisfies Record<Reachable, Settling>

const planned = (to: Reachable): Transition => {
  const plan = planTransition(
    {
      amountInCents: record.amountInCents,
      createdAs: 'guest',
      providerTxnIds: [],
      status: 'pending',
      userId: 1,
    },
    OUTCOME_INTO[to],
  )
  if (plan.kind === 'absorb') {
    throw new Error('expected a transition')
  }
  return plan.transition
}

describe('the settlement statements', () => {
  it('locks the row for update', async () => {
    expect.hasAssertions()

    const statements = await sent((db) => db.run(lockTransaction(TRANSACTION_ID)))

    expect(statements).toStrictEqual([
      {
        params: [TRANSACTION_ID],
        sql:
          'select "amount", "created_as", "status", "user_id" from "transactions" ' +
          'where "transactions"."id" = $1 for update',
      },
    ])
  })

  it('reads the locked row with its status', async () => {
    expect.hasAssertions()

    expect(okValue(await lockedAs('pending'))).toStrictEqual({
      amountInCents: 100,
      createdAs: 'guest',
      status: 'pending',
      userId: 7,
    })
  })

  it('reads the gateway TxnID of every payments row of the transaction', async () => {
    expect.hasAssertions()

    const statements = await sent((db) => db.run(findProviderTxnIds(TRANSACTION_ID)))

    expect(statements).toStrictEqual([
      {
        params: [TRANSACTION_ID],
        sql:
          'select "provider_transaction_id" from "payments" ' +
          'where "payments"."transaction_id" = $1',
      },
    ])
  })

  it('fails the lock, naming the value, when the status is not one the table knows', async () => {
    expect.hasAssertions()

    const failure = errValue(await lockedAs('voided'))

    expect(failure).toMatchObject({
      _tag: 'InfraError',
      op: 'payments.lockTransaction',
      reason: 'failed',
    })
    expect(failure.cause).toMatchObject({
      message:
        'transaction status "voided" is not one of pending, success, failed, held, cancelled, refunded',
      name: 'UnknownStatusError',
    })
  })

  it.each([
    ['success', 'in ($4, $5, $6)', ['pending', 'failed', 'cancelled']],
    ['failed', 'in ($4)', ['pending']],
    ['held', 'in ($4, $5, $6)', ['pending', 'failed', 'cancelled']],
    ['cancelled', 'in ($4)', ['pending']],
    ['refunded', 'in ($4)', ['pending']],
  ] as const)(
    'moves into %s only from the statuses the table lists',
    async (to, sources, params) => {
      expect.hasAssertions()

      const [statement] = await sent((db) => db.run(moveTransaction(planned(to))))

      expect(statement?.sql).toBe(
        'update "transactions" set "status" = $1, "updated_at" = $2 ' +
          `where ("transactions"."id" = $3 and "transactions"."status" ${sources}) returning "status"`,
      )
      expect(statement?.params).toStrictEqual([to, expect.any(String), TRANSACTION_ID, ...params])
    },
  )
})

describe('the receipt read', () => {
  it('joins only the latest payments row, so a corrected row shows its success', async () => {
    expect.hasAssertions()

    const statements = await sent((db) => db.run(findReceipt(TRANSACTION_ID)))

    expect(statements).toStrictEqual([
      {
        params: [TRANSACTION_ID, 1],
        sql:
          'select "payments"."message", "transactions"."id", "transactions"."status", ' +
          '"users"."email", "users"."first_name", "users"."status" from "transactions" ' +
          'inner join "users" on "users"."id" = "transactions"."user_id" ' +
          'left join "payments" on "payments"."transaction_id" = "transactions"."id" ' +
          'where "transactions"."id" = $1 order by "payments"."id" desc limit $2',
      },
    ])
  })
})

// oxlint-disable typescript/no-misused-spread -- each spread is a forgery tsc must refuse
describe('the transition moveTransaction takes', () => {
  it('can be made only by planTransition', () => {
    expect.hasAssertions()

    const real = planned('success')
    const forgeries = [
      // @ts-expect-error an object literal is not a planned transition
      () => moveTransaction({ from: 'pending', to: 'success', transactionId: TRANSACTION_ID }),
      () => {
        // @ts-expect-error a typed literal is not a planned transition
        const typed: Transition = { from: 'success', to: 'failed', transactionId: TRANSACTION_ID }
        return moveTransaction(typed)
      },
      () => {
        // @ts-expect-error a spread copies the fields but not the planner's mark
        const respread: Transition = { ...real, from: 'success' }
        return moveTransaction(respread)
      },
      // @ts-expect-error nothing moves a row back to pending
      () => moveTransaction({ ...real, to: 'pending' }),
      // @ts-expect-error a spread cannot retarget another transaction
      () => moveTransaction({ ...real, transactionId: 'someone-else' }),
      // @ts-expect-error pending has no sources
      () => sourcesOf('pending'),
    ]

    expect(forgeries).toHaveLength(6)
  })

  it('cannot be retargeted after planning', () => {
    expect.hasAssertions()

    const real = planned('success')

    expect(() => Object.assign(real, { transactionId: 'someone-else' })).toThrow(TypeError)
    expect(real.transactionId).toBe(TRANSACTION_ID)
  })
})
// oxlint-enable typescript/no-misused-spread
