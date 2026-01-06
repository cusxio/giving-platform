import { inArray } from 'drizzle-orm'

import type { Fund } from '#/core/brand/funds'
import { createDBError } from '#/core/errors'
import { err, tryAsync } from '#/core/result'
import type { DB } from '#/db/client'
import { createId } from '#/db/create-id'
import { DBEmptyReturnError } from '#/db/errors'
import type { Session } from '#/db/schema'
import { funds, transactionItems, transactions } from '#/db/schema'

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
    // Preparation
    const prepResult = await tryAsync(async () => {
      const items = _items.map((i) => ({
        ...i,
        fund: i.fund.charAt(0).toUpperCase() + i.fund.slice(1),
      }))

      const foundFunds = await this.#db
        .select()
        .from(funds)
        .where(
          inArray(
            funds.name,
            items.map((i) => i.fund),
          ),
        )

      const fundIdMap = new Map(foundFunds.map((f) => [f.name, f.id]))
      const totalAmountInCents = items.reduce(
        (sum, item) => sum + item.amountInCents,
        0,
      )

      return { items, fundIdMap, totalAmountInCents }
    }, createDBError)

    if (!prepResult.ok) return prepResult

    const { items, fundIdMap, totalAmountInCents } = prepResult.value

    // User resolution
    const { email, firstName, lastName } = userDetails
    let userId: number

    const userRes = await this.#userRepository.findUserByEmail(email)
    if (!userRes.ok) return userRes

    const existingUser = userRes.value

    if (session) {
      userId = session.userId

      if (existingUser && existingUser.id !== session.userId) {
        return err({ type: 'EmailBelongsToAnotherUserError' as const })
      }
    } else {
      if (existingUser && existingUser.status !== 'guest') {
        return err({ type: 'GuestEmailExistsError' as const })
      }

      const createRes = await this.#userRepository.createUser({
        email,
        firstName,
        lastName,
      })

      if (!createRes.ok) return createRes // Pass through error
      if (!createRes.value) {
        return err({
          type: 'DBEmptyReturnError' as const,
          error: new DBEmptyReturnError(),
        })
      }

      userId = createRes.value.id
    }

    // Batch write
    return tryAsync(async () => {
      const transactionId = createId(20)

      const insertTransaction = this.#db
        .insert(transactions)
        .values({
          id: transactionId,
          amount: totalAmountInCents,
          status: 'pending',
          userId,
          createdAs: session ? 'user' : 'guest',
        })

      const insertTransactionItems = this.#db.insert(transactionItems).values(
        items.map((item) => {
          const fundId = fundIdMap.get(item.fund)
          if (fundId === undefined)
            throw new Error(`Invalid fund name: ${item.fund}`)

          return { transactionId, fundId, amount: item.amountInCents }
        }),
      )

      await this.#db.batch([insertTransaction, insertTransactionItems])

      return { transactionId, customerName: `${firstName} ${lastName}` }
    }, createDBError)
  }
}
