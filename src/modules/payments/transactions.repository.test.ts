import { describe, expect, it } from 'vitest'

import { sourcesOf } from '#/core/transaction-status'
import { createDriverDb } from '#/server/testing/driver-db'
import { errValue, okValue } from '#/server/testing/result'

import type { PaymentRecord, Transition } from './payment-outcome'
import { planTransition } from './payment-outcome'
import { lockTransaction, moveTransaction } from './transactions.repository.server'

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

const planned = (to: 'failed' | 'success'): Transition => {
  const plan = planTransition(
    { amountInCents: 1, createdAs: 'guest', status: 'pending', userId: 1 },
    to === 'success' ? { card: null, kind: 'succeeded', record } : { kind: 'failed', record },
  )
  if (plan.kind !== 'move') {
    throw new Error('expected a move')
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

  it('fails the lock, naming the value, when the status is not one the table knows', async () => {
    expect.hasAssertions()

    const failure = errValue(await lockedAs('refunded'))

    expect(failure).toMatchObject({
      _tag: 'InfraError',
      op: 'payments.lockTransaction',
      reason: 'failed',
    })
    expect(failure.cause).toMatchObject({
      message: 'transaction status "refunded" is not one of pending, success, failed',
      name: 'UnknownStatusError',
    })
  })

  it.each(['success', 'failed'] as const)(
    'moves into %s only from the statuses the table lists',
    async (to) => {
      expect.hasAssertions()

      const [statement] = await sent((db) => db.run(moveTransaction(planned(to))))

      expect(statement?.sql).toBe(
        'update "transactions" set "status" = $1, "updated_at" = $2 ' +
          'where ("transactions"."id" = $3 and "transactions"."status" in ($4)) returning "status"',
      )
      expect(statement?.params).toStrictEqual([to, expect.any(String), TRANSACTION_ID, 'pending'])
    },
  )
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
})
// oxlint-enable typescript/no-misused-spread
