import { Result } from 'better-result'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { config, funds as fundsName } from '#/core/brand'
import type { Fund } from '#/core/brand/funds'
import type { User } from '#/modules/account/server'
import { findUserByEmail, upsertGuestUser } from '#/modules/account/server'
import { anyone } from '#/server/authorize.server'
import type { Executor } from '#/server/db.server'
import type { Deps } from '#/server/deps.server'
import { InfraError, required } from '#/server/infra-error'
import type { Parsed } from '#/server/input.server'
import { parseWith } from '#/server/input.server'
import { business, defineMutation } from '#/server/procedure.server'

import type { ContributionItem } from './contribution'
import {
  MAX_FUND_AMOUNT,
  contributionItems,
  decideDonor,
  fundName,
  itemsFor,
  totalInCents,
} from './contribution'
import {
  EmailBelongsToAnotherUser,
  GuestEmailExists,
  InvalidContribution,
  PaymentMethodUnavailable,
} from './payments.errors'
import { findSavedCard } from './saved-cards.repository.server'
import {
  findFundsByName,
  insertPendingTransaction,
  insertTransactionItems,
} from './transactions.repository.server'

type SessionUser = Pick<User, 'id'>

interface DonorDetails {
  readonly email: string
  readonly firstName: string
  readonly lastName: string
}

/**
 * The guest's id. No row means the email was registered after the owner lookup, such as by a
 * signup finishing in between, so the guest is refused as if the lookup had seen it.
 */
async function upsertGuest(tx: Executor, donor: DonorDetails) {
  const guest = await tx.run(upsertGuestUser(donor))
  return guest.andThen((row) =>
    row === null ? Result.err(new GuestEmailExists()) : Result.ok(row.id),
  )
}

/**
 * Records a pending transaction and its items in one pool transaction, creating the guest
 * account when no one is signed in. Any `Err` rolls the whole of it back.
 */
export function createPendingContribution(
  deps: Pick<Deps, 'db'>,
  items: readonly ContributionItem[],
  donor: DonorDetails,
  sessionUser: null | SessionUser,
) {
  return deps.db.transaction((tx) =>
    Result.gen(async function* pendingContribution() {
      const owner = yield* Result.await(tx.run(findUserByEmail(donor.email)))
      const decision = decideDonor(owner, sessionUser)
      if (decision.kind === 'email-belongs-to-another-user') {
        return Result.err(new EmailBelongsToAnotherUser())
      }
      if (decision.kind === 'guest-email-exists') {
        return Result.err(new GuestEmailExists())
      }
      const userId =
        decision.kind === 'session-user'
          ? decision.userId
          : yield* Result.await(upsertGuest(tx, donor))

      const funds = yield* Result.await(
        tx.run(findFundsByName(items.map((item) => fundName(item.fund)))),
      )
      const inserted = yield* Result.await(
        tx.run(
          insertPendingTransaction({
            amount: totalInCents(items),
            createdAs: sessionUser ? 'user' : 'guest',
            userId,
          }),
        ),
      )
      const transaction = yield* required(inserted, insertPendingTransaction.queryName)
      const rows = yield* itemsFor(transaction.id, items, funds).mapError(
        (missing) =>
          new InfraError({
            cause: undefined,
            message: `${findFundsByName.queryName} returned no row for ${missing}`,
            op: findFundsByName.queryName,
            reason: 'no-row',
          }),
      )
      yield* Result.await(tx.run(insertTransactionItems(rows)))

      return Result.ok({
        customerName: `${donor.firstName} ${donor.lastName}`,
        transactionId: transaction.id,
      })
    }),
  )
}

const startContributionInput = parseWith(
  Compile(
    Type.Object({
      contributions: Type.Record(
        Type.Union(fundsName.map((f) => Type.Literal(f))),
        Type.Number({ maximum: MAX_FUND_AMOUNT }),
      ),
      email: Type.String({ format: 'email' }),
      firstName: Type.String({ minLength: 1 }),
      lastName: Type.String({ minLength: 1 }),
      token: Type.Optional(Type.String()),
    }),
  ),
  // Form fields arrive as strings, so the fund amounts are converted to numbers.
  { convert: ['contributions'], lowercase: ['email'], trim: ['email', 'firstName', 'lastName'] },
)
export type StartContributionInput = Parsed<typeof startContributionInput>

/** Checks the gift and the saved card, records it pending, and answers the gateway's URL. */
function beginContribution(
  deps: Pick<Deps, 'db' | 'eghl' | 'logger'>,
  sessionUser: null | SessionUser,
  input: StartContributionInput,
) {
  return Result.gen(async function* contribution() {
    const { contributions, email, firstName, lastName, token } = input
    const items = contributionItems(contributions as Record<Fund, number>)
    if (items.length === 0) {
      return Result.err(new InvalidContribution())
    }

    if (token !== undefined) {
      if (sessionUser === null) {
        return Result.err(new PaymentMethodUnavailable({ userId: null }))
      }
      const card = yield* Result.await(deps.db.run(findSavedCard(sessionUser.id, token)))
      if (card === null) {
        return Result.err(new PaymentMethodUnavailable({ userId: sessionUser.id }))
      }
    }

    const totalAmountInCents = totalInCents(items)
    deps.logger.info(
      {
        email,
        event: 'giving.start_contribution.attempt',
        funds: items.map((i) => i.fund),
        total_cents: totalAmountInCents,
      },
      'Creating pending transaction',
    )

    const pending = yield* Result.await(
      createPendingContribution(deps, items, { email, firstName, lastName }, sessionUser),
    )

    const redirectURL = deps.eghl.paymentRequestUrl({
      amountInCents: totalAmountInCents,
      customerEmail: email,
      customerName: pending.customerName,
      description: `${config.entity}'s Giving`,
      token,
      transactionId: pending.transactionId,
    })
    deps.logger.info(
      { event: 'giving.start_contribution.redirected', transaction_id: pending.transactionId },
      'Success, redirecting to eGHL',
    )
    return Result.ok({ redirectURL })
  })
}

export const startContributionAction = defineMutation({
  auth: anyone,
  event: 'giving.start_contribution',
  input: startContributionInput,
  run: ({ deps, user }, input) => beginContribution(deps, user, input),
  wire: {
    EmailBelongsToAnotherUser: (_error, { email }) =>
      business('USER_MISMATCH', {
        event: 'giving.start_contribution.blocked',
        fields: { email, reason: 'user_mismatch' },
        msg: 'Email mismatch',
      }),
    GuestEmailExists: (_error, { email }) =>
      business('EMAIL_EXISTS', {
        event: 'giving.start_contribution.blocked',
        fields: { email, reason: 'email_exists' },
        msg: 'Guest used existing account email',
      }),
    InvalidContribution: (_error, { email }) =>
      business('INVALID_REQUEST', {
        event: 'giving.start_contribution.invalid_request',
        fields: { email },
        msg: 'Request contained 0 items',
      }),
    PaymentMethodUnavailable: ({ userId }, { email }) =>
      business(
        'PAYMENT_METHOD_UNAVAILABLE',
        userId === null
          ? {
              event: 'giving.start_contribution.blocked',
              fields: { email, reason: 'saved_card_without_user' },
              msg: 'Saved card used without a session',
            }
          : {
              event: 'giving.start_contribution.blocked',
              fields: { reason: 'saved_card_not_found', user_id: userId },
              msg: 'Saved card not found for user',
            },
      ),
  },
})
