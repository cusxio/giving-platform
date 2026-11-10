import { describe, expect, expectTypeOf, it } from 'vitest'

import type { TransactionStatus } from '#/core/transaction-status'

import type { Transaction } from './schema.server'

describe('the transactions table', () => {
  it('takes its status column from the status machine', () => {
    expect.assertions(0)

    expectTypeOf<Transaction['status']>().toEqualTypeOf<TransactionStatus>()
  })
})
