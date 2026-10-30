import { and, eq } from 'drizzle-orm'

import type { DB, DBTransaction } from '#/server/neon.server'
import type { Transaction, User } from '#/server/schema.server'
import { funds, payments, transactionItems, transactions, users } from '#/server/schema.server'

export class TransactionRepository {
  readonly #db: DB

  constructor(db: DB) {
    this.#db = db
  }

  findTransactionReceiptByIdQuery(
    transactionId: Transaction['id'],
    db: DB | DBTransaction = this.#db,
  ) {
    return db
      .select({
        payment: { message: payments.message },
        transaction: { id: transactions.id, status: transactions.status },
        user: { email: users.email, firstName: users.firstName, status: users.status },
      })
      .from(transactions)
      .innerJoin(users, eq(users.id, transactions.userId))
      .leftJoin(payments, eq(payments.transactionId, transactions.id))
      .where(eq(transactions.id, transactionId))
  }

  findGuestTransactionExistsByUserIdQuery(userId: User['id'], db: DB | DBTransaction = this.#db) {
    return db
      .select({ exists: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.createdAs, 'guest')))
      .limit(1)
  }

  findTransactionByIdQuery(transactionId: Transaction['id'], db: DB | DBTransaction = this.#db) {
    return db.select().from(transactions).where(eq(transactions.id, transactionId))
  }

  findTransactionItemsByTransactionIdQuery(
    transactionId: Transaction['id'],
    db: DB | DBTransaction = this.#db,
  ) {
    return db
      .select({ amountInCents: transactionItems.amount, fundName: funds.name })
      .from(transactionItems)
      .innerJoin(funds, eq(funds.id, transactionItems.fundId))
      .where(eq(transactionItems.transactionId, transactionId))
  }
}
