import { inArray } from 'drizzle-orm'

import type { Fund } from '#/core/brand/funds'
import { createTransactionError } from '#/core/errors'
import type { Result } from '#/core/result'
import { tryAsync } from '#/core/result'
import type { DBPool } from '#/db/client'
import { TransactionRollbackError } from '#/db/errors'
import type { User } from '#/db/schema'
import { funds, transactionItems, transactions } from '#/db/schema'

import type { UserRepository } from '../user/user.repository'

import type { CreatePendingContributionError } from './contribution.errors'

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
    super('Email belongs to another user')
    this.name = 'EmailBelongsToAnotherUserError'
  }
}

class GuestEmailExistsError extends Error {
  constructor() {
    super('Email already exists for a registered user')
    this.name = 'GuestEmailExistsError'
  }
}

export class ContributionService {
  #dbPool: DBPool
  #userRepository: UserRepository

  constructor(dbPool: DBPool, userRepository: UserRepository) {
    this.#dbPool = dbPool
    this.#userRepository = userRepository
  }

  async createPendingContribution(
    _items: ContributionItem[],
    userDetails: UserDetails,
    user: null | Pick<User, 'id'>,
  ): Promise<
    Result<
      { customerName: string; transactionId: string },
      CreatePendingContributionError
    >
  > {
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
        this.#dbPool.transaction(async (tx) => {
          // Check if email already belongs to someone
          const userRes = await this.#userRepository.findUserByEmail(email, tx)

          if (!userRes.ok) {
            throw new TransactionRollbackError('Error finding user by email', {
              cause: userRes.error,
            })
          }

          const existingUser = userRes.value
          let userId: number

          if (user) {
            // Logged-in user: always use their session userId
            userId = user.id

            // Error if email belongs to a different user
            if (existingUser && existingUser.id !== userId) {
              throw new EmailBelongsToAnotherUserError()
            }
          } else {
            // Guest: only error if email belongs to a registered (non-guest) user
            if (existingUser && existingUser.status !== 'guest') {
              throw new GuestEmailExistsError()
            }

            // Create guest user (or update existing guest)
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

            userId = createRes.value.id
          }

          // Get fund IDs
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

          // Insert transaction
          const [transaction] = await tx
            .insert(transactions)
            .values({
              amount: totalAmountInCents,
              status: 'pending',
              userId,
              createdAs: user ? 'user' : 'guest',
            })
            .returning()

          if (!transaction) {
            throw new TransactionRollbackError(
              'Transaction creation returned no result',
            )
          }

          // Insert transaction items
          await tx.insert(transactionItems).values(
            items.map((item) => {
              const fundId = fundIdMap.get(item.fund)
              if (fundId === undefined) {
                throw new Error(`Invalid fund name: ${item.fund}`)
              }
              return {
                transactionId: transaction.id,
                fundId,
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
          return { type: 'GuestEmailExistsError', error }

        if (error instanceof EmailBelongsToAnotherUserError)
          return { type: 'EmailBelongsToAnotherUserError', error }

        return createTransactionError(error)
      },
    )
  }
}
