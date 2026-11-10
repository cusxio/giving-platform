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
  insertPendingGuestTransaction,
  insertPendingTransaction,
  insertTransactionItems,
  newTransactionId,
} from './transactions.repository.server'

type SessionUser = Pick<User, 'id'>

interface DonorDetails {
  readonly email: string
  readonly firstName: string
  readonly lastName: string
}

interface PendingTransaction {
  readonly amount: number
  readonly id: string
}

type ItemRows = Parameters<typeof insertTransactionItems>[1]

async function recordForUser(
  db: Executor,
  transaction: PendingTransaction,
  userId: User['id'],
  rows: ItemRows,
) {
  const written = await db.batch([
    insertPendingTransaction({ ...transaction, userId }),
    insertTransactionItems(transaction.id, rows),
  ])
  return written.andThen(([inserted]) => required(inserted, insertPendingTransaction.queryName))
}

async function recordForGuest(
  db: Executor,
  transaction: PendingTransaction,
  donor: DonorDetails,
  rows: ItemRows,
) {
  const written = await db.batch([
    upsertGuestUser(donor),
    insertPendingGuestTransaction({ ...transaction, email: donor.email }),
    insertTransactionItems(transaction.id, rows),
  ])
  return written.andThen(([guest, inserted]) =>
    guest === null
      ? Result.err(new GuestEmailExists())
      : required(inserted, insertPendingGuestTransaction.queryName),
  )
}

/**
 * Records a pending transaction and its items, creating the guest account when no one is
 * signed in.
 */
export function createPendingContribution(
  deps: Pick<Deps, 'db'>,
  items: readonly ContributionItem[],
  donor: DonorDetails,
  sessionUser: null | SessionUser,
) {
  const { db } = deps
  return Result.gen(async function* pendingContribution() {
    const [owner, funds] = yield* Result.await(
      db.batch([
        findUserByEmail(donor.email),
        findFundsByName(items.map((item) => fundName(item.fund))),
      ]),
    )
    const decision = decideDonor(owner, sessionUser)
    if (decision.kind === 'email-belongs-to-another-user') {
      return Result.err(new EmailBelongsToAnotherUser())
    }
    if (decision.kind === 'guest-email-exists') {
      return Result.err(new GuestEmailExists())
    }
    const rows = yield* itemsFor(items, funds).mapError(
      (missing) =>
        new InfraError({
          cause: undefined,
          message: `${findFundsByName.queryName} returned no row for ${missing}`,
          op: findFundsByName.queryName,
          reason: 'no-row',
        }),
    )
    const transaction = { amount: totalInCents(items), id: newTransactionId() }
    const recorded = yield* Result.await(
      decision.kind === 'session-user'
        ? recordForUser(db, transaction, decision.userId, rows)
        : recordForGuest(db, transaction, donor, rows),
    )

    return Result.ok({
      customerName: `${donor.firstName} ${donor.lastName}`,
      transactionId: recorded.id,
    })
  })
}

const startContributionInput = parseWith(
  Compile(
    Type.Object({
      contributions: Type.Record(
        Type.Union(fundsName.map((f) => Type.Literal(f))),
        Type.Number({ maximum: MAX_FUND_AMOUNT }),
      ),
      email: Type.String({ format: 'email', maxLength: 254 }),
      firstName: Type.String({ maxLength: 32, minLength: 1 }),
      lastName: Type.String({ maxLength: 32, minLength: 1 }),
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
