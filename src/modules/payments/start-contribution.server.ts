import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { config, funds as fundsName } from '#/core/brand'
import type { Fund } from '#/core/brand/funds'
import {
  createDBError,
  createParseError,
  createTransactionError,
  TransactionRollbackError,
} from '#/core/errors'
import type { Result } from '#/core/result'
import { tryAsync, trySync } from '#/core/result'
import type {
  BusinessErrorResponse,
  ServerErrorResponse,
  SuccessResponse,
  ValidationErrorResponse,
} from '#/core/wire'
import type { User } from '#/modules/account/server'
import { findUserByEmail, upsertGuestUser } from '#/modules/account/server'
import type { Executor } from '#/server/db.server'
import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import type { ContributionItem } from './contribution'
import { contributionItems, decideDonor, fundName, itemsFor, totalInCents } from './contribution'
import type { CreatePendingContributionError } from './payments.errors'
import { EmailBelongsToAnotherUserError, GuestEmailExistsError } from './payments.errors'
import { findSavedCard } from './saved-cards.repository.server'
import type { TransactionId } from './transactions.repository.server'
import {
  findFundsByName,
  insertPendingTransaction,
  insertTransactionItems,
} from './transactions.repository.server'

const schema = Compile(
  Type.Object({
    contributions: Type.Record(Type.Union(fundsName.map((f) => Type.Literal(f))), Type.Number()),
    email: Type.String({ format: 'email' }),
    firstName: Type.String({ minLength: 1 }),
    lastName: Type.String({ minLength: 1 }),
    token: Type.Optional(Type.String()),
  }),
)

export type StartContributionInput = ReturnType<typeof schema.Parse>

type StartContributionResponse =
  | BusinessErrorResponse<StartContributionBusinessErrorCode>
  | ServerErrorResponse
  | SuccessResponse<{ redirectURL: string }>
  | ValidationErrorResponse

type StartContributionBusinessErrorCode =
  | 'EMAIL_EXISTS'
  | 'INVALID_REQUEST'
  | 'PAYMENT_METHOD_UNAVAILABLE'
  | 'USER_MISMATCH'

type SessionUser = Pick<User, 'id'>

interface DonorDetails {
  readonly email: string
  readonly firstName: string
  readonly lastName: string
}

interface PendingContribution {
  readonly customerName: string
  readonly transactionId: TransactionId
}

async function upsertGuest(tx: Executor, donor: DonorDetails): Promise<User['id']> {
  const { email, firstName, lastName } = donor
  const createResult = await tryAsync(
    () => tx.run(upsertGuestUser({ email, firstName, lastName })),
    createDBError,
  )

  if (!createResult.ok) {
    throw new TransactionRollbackError('Error creating user', { cause: createResult.error })
  }

  if (!createResult.value) {
    throw new TransactionRollbackError('User creation returned no result')
  }

  return createResult.value.id
}

/**
 * Records a pending transaction and its items in one pool transaction, creating or updating the
 * guest account when no one is signed in. Anything thrown inside rolls the whole of it back.
 */
export async function createPendingContribution(
  deps: Pick<Deps, 'db'>,
  items: readonly ContributionItem[],
  donor: DonorDetails,
  sessionUser: null | SessionUser,
): Promise<Result<PendingContribution, CreatePendingContributionError>> {
  const { email, firstName, lastName } = donor

  return tryAsync(
    () =>
      deps.db.transaction(async (tx) => {
        const ownerResult = await tryAsync(() => tx.run(findUserByEmail(email)), createDBError)

        if (!ownerResult.ok) {
          throw new TransactionRollbackError('Error finding user by email', {
            cause: ownerResult.error,
          })
        }

        const decision = decideDonor(ownerResult.value, sessionUser)

        if (decision.kind === 'email-belongs-to-another-user') {
          throw new EmailBelongsToAnotherUserError()
        }

        if (decision.kind === 'guest-email-exists') {
          throw new GuestEmailExistsError()
        }

        const userId =
          decision.kind === 'session-user' ? decision.userId : await upsertGuest(tx, donor)

        const funds = await tx.run(findFundsByName(items.map((item) => fundName(item.fund))))

        const transaction = await tx.run(
          insertPendingTransaction({
            amount: totalInCents(items),
            createdAs: sessionUser ? 'user' : 'guest',
            userId,
          }),
        )

        if (!transaction) {
          throw new TransactionRollbackError('Transaction creation returned no result')
        }

        await tx.run(insertTransactionItems(itemsFor(transaction.id, items, funds)))

        return { customerName: `${firstName} ${lastName}`, transactionId: transaction.id }
      }),
    (error): CreatePendingContributionError => {
      if (error instanceof GuestEmailExistsError) {
        return { error, type: 'GuestEmailExistsError' }
      }

      if (error instanceof EmailBelongsToAnotherUserError) {
        return { error, type: 'EmailBelongsToAnotherUserError' }
      }

      return createTransactionError(error)
    },
  )
}

export async function beginContribution(
  deps: Pick<Deps, 'db' | 'eghl' | 'logger'>,
  sessionUser: null | SessionUser,
  data: StartContributionInput,
): Promise<StartContributionResponse> {
  const { logger } = deps

  const parseResult = trySync(
    () =>
      schema.Parse(
        // Convert coerces contribution amounts from form strings to numbers
        // Before validation (TypeBox 1.1+ no longer does this automatically)
        schema.Convert({
          ...data,
          email: data.email.toLowerCase().trim(),
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
        }),
      ),
    createParseError,
  )

  if (!parseResult.ok) {
    logger.warn(
      {
        err: parseResult.error.error,
        error_type: parseResult.error.type,
        event: 'giving.start_contribution.validation_failed',
      },
      'Input validation failed',
    )
    return {
      errors: parseResult.error.error.cause.errors.map((v) => ({
        path: v.instancePath,
        message: v.message,
      })),
      type: 'VALIDATION_ERROR',
    }
  }

  const { email, firstName, lastName, contributions, token } = parseResult.value
  const itemsToInsert = contributionItems(contributions as Record<Fund, number>)

  if (itemsToInsert.length === 0) {
    logger.warn(
      { email, event: 'giving.start_contribution.invalid_request' },
      'Request contained 0 items',
    )
    return { error: { code: 'INVALID_REQUEST' }, type: 'BUSINESS_ERROR' }
  }

  if (token !== undefined) {
    if (sessionUser === null) {
      logger.warn(
        { email, event: 'giving.start_contribution.blocked', reason: 'saved_card_without_user' },
        'Saved card used without a session',
      )
      return { error: { code: 'PAYMENT_METHOD_UNAVAILABLE' }, type: 'BUSINESS_ERROR' }
    }

    const savedCardResult = await tryAsync(
      () => deps.db.run(findSavedCard(sessionUser.id, token)),
      createDBError,
    )

    if (!savedCardResult.ok) {
      logger.error(
        {
          err: savedCardResult.error.error,
          error_type: savedCardResult.error.type,
          event: 'giving.start_contribution.failed',
        },
        'Database error while finding saved card',
      )
      return { type: 'SERVER_ERROR' }
    }

    if (savedCardResult.value === null) {
      logger.warn(
        {
          event: 'giving.start_contribution.blocked',
          reason: 'saved_card_not_found',
          user_id: sessionUser.id,
        },
        'Saved card not found for user',
      )
      return { error: { code: 'PAYMENT_METHOD_UNAVAILABLE' }, type: 'BUSINESS_ERROR' }
    }
  }

  const totalAmountInCents = totalInCents(itemsToInsert)

  logger.info(
    {
      email,
      event: 'giving.start_contribution.attempt',
      funds: itemsToInsert.map((i) => i.fund),
      total_cents: totalAmountInCents,
    },
    'Creating pending transaction',
  )

  const txResult = await createPendingContribution(
    deps,
    itemsToInsert,
    { email, firstName, lastName },
    sessionUser,
  )

  if (!txResult.ok) {
    switch (txResult.error.type) {
      case 'EmailBelongsToAnotherUserError': {
        logger.warn(
          { email, event: 'giving.start_contribution.blocked', reason: 'user_mismatch' },
          'Email mismatch',
        )
        return { error: { code: 'USER_MISMATCH' }, type: 'BUSINESS_ERROR' }
      }
      case 'GuestEmailExistsError': {
        logger.warn(
          { email, event: 'giving.start_contribution.blocked', reason: 'email_exists' },
          'Guest used existing account email',
        )
        return { error: { code: 'EMAIL_EXISTS' }, type: 'BUSINESS_ERROR' }
      }
      case 'TransactionRollbackError': {
        logger.error(
          {
            err: txResult.error.error,
            error_type: txResult.error.type,
            event: 'giving.start_contribution.failed',
          },
          'Transaction error during contribution',
        )
        return { type: 'SERVER_ERROR' }
      }
      default: {
        return assertExhaustive(txResult.error)
      }
    }
  }

  const redirectURL = deps.eghl.paymentRequestUrl({
    amountInCents: totalAmountInCents,
    customerEmail: email,
    customerName: txResult.value.customerName,
    description: `${config.entity}'s Giving`,
    token,
    transactionId: txResult.value.transactionId,
  })

  logger.info(
    { event: 'giving.start_contribution.redirected', transaction_id: txResult.value.transactionId },
    'Success, redirecting to eGHL',
  )

  return { type: 'SUCCESS', value: { redirectURL } }
}

export function startContributionProcedure(
  context: Pick<RequestContext, 'deps' | 'user'>,
  data: StartContributionInput,
): Promise<StartContributionResponse> {
  return beginContribution(context.deps, context.user, data)
}
