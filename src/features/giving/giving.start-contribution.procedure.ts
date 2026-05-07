import { createServerFn } from '@tanstack/react-start'
import type { Static } from 'typebox'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { config, funds as fundsName } from '#/core/brand'
import type { Fund } from '#/core/brand/funds'
import { createParseError } from '#/core/errors'
import { ringgitToCents } from '#/core/money'
import type {
  BusinessErrorResponse,
  ServerErrorResponse,
  SuccessResponse,
  ValidationErrorResponse,
} from '#/core/procedure-response-types'
import { trySync } from '#/core/result'
import { contributionServiceMiddleware } from '#/server/middleware/contribution-service-middleware'
import { eghlServiceMiddleware } from '#/server/middleware/eghl-service-middleware'

const schema = Compile(
  Type.Object({
    contributions: Type.Record(Type.Union(fundsName.map((f) => Type.Literal(f))), Type.Number()),
    email: Type.String({ format: 'email' }),
    firstName: Type.String({ minLength: 1 }),
    lastName: Type.String({ minLength: 1 }),
    token: Type.Optional(Type.String()),
  }),
)

export type StartContributionInput = Static<typeof schema>

export type StartContributionResponse =
  | BusinessErrorResponse<StartContributionBusinessErrorCode>
  | ServerErrorResponse
  | SuccessResponse<{ redirectURL: string }>
  | ValidationErrorResponse

type StartContributionBusinessErrorCode = 'EMAIL_EXISTS' | 'INVALID_REQUEST' | 'USER_MISMATCH'

export const startContribution = createServerFn({ method: 'POST' })
  .middleware([contributionServiceMiddleware, eghlServiceMiddleware])
  .inputValidator((v: StartContributionInput) => v)
  .handler(async ({ data, context }): Promise<StartContributionResponse> => {
    const { contributionService, user, eghlService, logger } = context

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
    const itemsToInsert = (Object.entries(contributions) as [Fund, number][])
      .map(([fund, amount]) => ({ amountInCents: ringgitToCents(amount), fund }))
      .filter((item) => item.amountInCents > 0)

    if (itemsToInsert.length === 0) {
      logger.warn(
        { email, event: 'giving.start_contribution.invalid_request' },
        'Request contained 0 items',
      )
      return { error: { code: 'INVALID_REQUEST' }, type: 'BUSINESS_ERROR' }
    }

    const totalAmountInCents = itemsToInsert.reduce((sum, item) => sum + item.amountInCents, 0)

    logger.info(
      {
        email,
        event: 'giving.start_contribution.attempt',
        funds: itemsToInsert.map((i) => i.fund),
        total_cents: totalAmountInCents,
      },
      'Creating pending transaction',
    )

    const txResult = await contributionService.createPendingContribution(
      itemsToInsert,
      { email, firstName, lastName },
      user,
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

    const redirectURL = eghlService.createPaymentRequestURL({
      amountInCents: totalAmountInCents,
      customerEmail: email,
      customerName: txResult.value.customerName,
      description: `${config.entity}'s Giving`,
      token,
      transactionId: txResult.value.transactionId,
    })

    logger.info(
      {
        event: 'giving.start_contribution.redirected',
        transaction_id: txResult.value.transactionId,
      },
      'Success, redirecting to eGHL',
    )

    return { type: 'SUCCESS', value: { redirectURL } }
  })
