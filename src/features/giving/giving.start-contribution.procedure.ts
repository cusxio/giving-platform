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
import {
  contributionServiceMiddleware,
  eghlServiceMiddleware,
} from '#/server/middleware'

const schema = Compile(
  Type.Object({
    email: Type.String({ format: 'email' }),
    firstName: Type.String({ minLength: 1 }),
    lastName: Type.String({ minLength: 1 }),
    contributions: Type.Record(
      Type.Union(fundsName.map((f) => Type.Literal(f))),
      Type.Number(),
    ),
    token: Type.Optional(Type.String()),
  }),
)

export type StartContributionInput = Static<typeof schema>

export type StartContributionResponse =
  | BusinessErrorResponse<StartContributionBusinessErrorCode>
  | ServerErrorResponse
  | SuccessResponse<{ redirectURL: string }>
  | ValidationErrorResponse

type StartContributionBusinessErrorCode =
  | 'EMAIL_EXISTS'
  | 'INVALID_REQUEST'
  | 'USER_MISMATCH'

export const startContribution = createServerFn({ method: 'POST' })
  .middleware([contributionServiceMiddleware, eghlServiceMiddleware])
  .inputValidator((v: StartContributionInput) => v)
  .handler(async ({ data, context }): Promise<StartContributionResponse> => {
    const { contributionService, user, eghlService, logger } = context

    const parseResult = trySync(
      () =>
        schema.Parse({
          ...data,
          email: data.email.toLowerCase().trim(),
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
        }),
      createParseError,
    )

    if (!parseResult.ok) {
      logger.warn(
        {
          event: 'giving.start_contribution.validation_failed',
          err: parseResult.error.error,
          error_type: parseResult.error.type,
        },
        'Input validation failed',
      )
      return {
        type: 'VALIDATION_ERROR',
        errors: parseResult.error.error.cause.errors.map((v) => {
          return { path: v.instancePath, message: v.message }
        }),
      }
    }

    const { email, firstName, lastName, contributions, token } =
      parseResult.value
    const itemsToInsert = (Object.entries(contributions) as [Fund, number][])
      .map(([fund, amount]) => ({
        fund,
        amountInCents: ringgitToCents(amount),
      }))
      .filter((item) => item.amountInCents > 0)

    if (itemsToInsert.length === 0) {
      logger.warn(
        { event: 'giving.start_contribution.invalid_request', email },
        'Request contained 0 items',
      )
      return { type: 'BUSINESS_ERROR', error: { code: 'INVALID_REQUEST' } }
    }

    const totalAmountInCents = itemsToInsert.reduce(
      (sum, item) => sum + item.amountInCents,
      0,
    )

    logger.info(
      {
        event: 'giving.start_contribution.attempt',
        email,
        total_cents: totalAmountInCents,
        funds: itemsToInsert.map((i) => i.fund),
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
            {
              event: 'giving.start_contribution.blocked',
              email,
              reason: 'user_mismatch',
            },
            'Email mismatch',
          )
          return { type: 'BUSINESS_ERROR', error: { code: 'USER_MISMATCH' } }
        }
        case 'GuestEmailExistsError': {
          logger.warn(
            {
              event: 'giving.start_contribution.blocked',
              email,
              reason: 'email_exists',
            },
            'Guest used existing account email',
          )
          return { type: 'BUSINESS_ERROR', error: { code: 'EMAIL_EXISTS' } }
        }
        case 'TransactionRollbackError': {
          logger.error(
            {
              event: 'giving.start_contribution.failed',
              err: txResult.error.error,
              error_type: txResult.error.type,
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
      transactionId: txResult.value.transactionId,
      customerEmail: email,
      customerName: txResult.value.customerName,
      description: `${config.entity}'s Giving`,
      token,
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
