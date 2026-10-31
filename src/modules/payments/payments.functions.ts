import { createServerFn } from '@tanstack/react-start'

import { wireInput } from '#/core/wire'

import type { ReceiptInput } from './receipt.server'
import { getReceiptAction } from './receipt.server'
import { getSavedPaymentMethodsAction } from './saved-cards.server'
import type { StartContributionInput } from './start-contribution.server'
import { startContributionProcedure } from './start-contribution.server'

export const startContribution = createServerFn({ method: 'POST' })
  .validator((input: StartContributionInput) => input)
  .handler(({ context, data }) => startContributionProcedure(context, data))

export const getSavedPaymentMethods = createServerFn()
  .validator(wireInput<undefined>())
  .handler((ctx) => getSavedPaymentMethodsAction(ctx))

export const getReceipt = createServerFn()
  .validator(wireInput<ReceiptInput>())
  .handler((ctx) => getReceiptAction(ctx))
