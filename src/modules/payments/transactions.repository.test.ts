import { describe, expect, it } from 'vitest'

import { createDriverDb } from '#/server/testing/driver-db'

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

/** Runs one statement against a recording driver and returns the SQL it sent. */
async function sent(run: (db: ReturnType<typeof createDriverDb>) => Promise<unknown>) {
  const statements: { params: unknown[]; sql: string }[] = []
  const db = createDriverDb((sql, params) => {
    statements.push({ params, sql })
    return Promise.resolve({ rows: [] })
  })
  await run(db)
  return statements
}

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
