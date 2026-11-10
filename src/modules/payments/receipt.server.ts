import { Result } from 'better-result'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { anyone } from '#/server/authorize.server'
import type { Deps } from '#/server/deps.server'
import type { Parsed } from '#/server/input.server'
import { parseWith } from '#/server/input.server'
import { defineRead, toNotFound } from '#/server/procedure.server'

import { ReceiptNotFound } from './payments.errors'
import { toTransactionReceipt } from './receipt'
import type { TransactionId } from './transactions.repository.server'
import { findReceipt } from './transactions.repository.server'

export async function loadReceipt(deps: Pick<Deps, 'db'>, transactionId: TransactionId) {
  const read = await deps.db.run(findReceipt(transactionId))
  return read.andThen((row) =>
    row === null
      ? Result.err(new ReceiptNotFound({ transactionId }))
      : Result.ok(toTransactionReceipt(row)),
  )
}

const receiptInput = parseWith(Compile(Type.Object({ transactionId: Type.String() })))
export type ReceiptInput = Parsed<typeof receiptInput>

/** Anyone holding the transaction id may read the receipt. */
export const getReceiptAction = defineRead({
  auth: anyone,
  event: 'transaction.receipt',
  input: receiptInput,
  run: ({ deps }, { transactionId }) => loadReceipt(deps, transactionId),
  wire: {
    ReceiptNotFound: (error) =>
      toNotFound({
        event: 'transaction.receipt.not_found',
        fields: { transaction_id: error.transactionId },
        msg: 'Receipt not found',
      }),
  },
})
