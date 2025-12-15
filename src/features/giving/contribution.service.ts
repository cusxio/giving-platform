import { inArray } from 'drizzle-orm'

import type { Fund } from '#/core/brand/funds'
import { createTransactionError } from '#/core/errors'
import { tryAsync } from '#/core/result'
import type { DB } from '#/db/client'
import { TransactionRollbackError } from '#/db/errors'
import { funds, transactionItems, transactions } from '#/db/schema'
import type { Session } from '#/db/schema'

import type { UserRepository } from '../user/user.repository'

interface ContributionItem {
  amountInCents: number
  fund: Fund
}

interface UserDetails {
  email: string
  firstName: string
  lastName: string
}

class EmailBelongsToAnotherUserError extends Error {
  constructor() {
    super()
    this.name = 'EmailBelongsToAnotherUserError'
  }
}

class GuestEmailExistsError extends Error {
  constructor() {
    super()
    this.name = 'GuestEmailExistsError'
  }
}
export class ContributionService {
  #db: DB
  #userRepository: UserRepository

  constructor(db: DB, userRepository: UserRepository) {
    this.#db = db
    this.#userRepository = userRepository
  }

  async createPendingContribution(
    _items: ContributionItem[],
    userDetails: UserDetails,
    session: null | Session,
  ) {
    const items = _items.map((i) => ({
      ...i,
      fund: i.fund.charAt(0).toUpperCase() + i.fund.slice(1),
    }))
    const totalAmountInCents = items.reduce(
      (sum, item) => sum + item.amountInCents,
      0,
    )
    const { email, firstName, lastName } = userDetails
    return tryAsync(
      () =>
        this.#db.transaction(async (tx) => {
          const userRes = await this.#userRepository.findUserByEmail(email, tx)

          if (!userRes.ok) {
            throw new TransactionRollbackError('Error finding user by email', {
              cause: userRes.error,
            })
          }

          let user = userRes.value

          if (user) {
            if (!session) {
              throw new GuestEmailExistsError()
            } else if (session.userId !== user.id) {
              throw new EmailBelongsToAnotherUserError()
            }
          }

          if (!user) {
            const createRes = await this.#userRepository.createUser(
              { email, firstName, lastName },
              tx,
            )

            if (!createRes.ok) {
              throw new TransactionRollbackError('Error creating user', {
                cause: createRes.error,
              })
            }

            if (!createRes.value) {
              throw new TransactionRollbackError(
                'User creation returned no result',
              )
            }

            user = createRes.value
          }

          const [transaction] = await tx
            .insert(transactions)
            .values({
              amount: totalAmountInCents,
              status: 'pending',
              userId: user.id,
              createdAs: session ? 'user' : 'guest',
            })
            .returning()

          if (!transaction) {
            throw new TransactionRollbackError(
              'Transaction creation returned no result',
            )
          }

          const foundFunds = await tx
            .select()
            .from(funds)
            .where(
              inArray(
                funds.name,
                items.map((i) => i.fund),
              ),
            )

          const fundIdMap = new Map(foundFunds.map((f) => [f.name, f.id]))

          await tx.insert(transactionItems).values(
            items.map((item) => {
              const fundId = fundIdMap.get(item.fund)
              if (fundId === undefined) {
                throw new Error(`Invalid fund name: ${item.fund}`)
              }
              return {
                transactionId: transaction.id,
                fundId: fundId,
                amount: item.amountInCents,
              }
            }),
          )

          return {
            transactionId: transaction.id,
            customerName: `${firstName} ${lastName}`,
          }
        }),
      (error) => {
        if (error instanceof GuestEmailExistsError)
          return { type: 'GuestEmailExistsError' as const, error }

        if (error instanceof EmailBelongsToAnotherUserError)
          return { type: 'EmailBelongsToAnotherUserError' as const, error }

        return createTransactionError(error)
      },
    )
  }
}
