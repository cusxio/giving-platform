import { createServerFn } from '@tanstack/react-start'

import type { ReceiptInput } from './receipt.server'
import { getReceiptProcedure } from './receipt.server'
import { getSavedPaymentMethodsProcedure } from './saved-cards.server'
import type { StartContributionInput } from './start-contribution.server'
import { startContributionProcedure } from './start-contribution.server'

export const startContribution = createServerFn({ method: 'POST' })
  .validator((input: StartContributionInput) => input)
  .handler(({ context, data }) => startContributionProcedure(context, data))

export const getSavedPaymentMethods = createServerFn().handler(({ context }) =>
  getSavedPaymentMethodsProcedure(context),
)

export const getReceipt = createServerFn()
  .validator((input: ReceiptInput) => input)
  .handler(({ context, data }) => getReceiptProcedure(context, data))
