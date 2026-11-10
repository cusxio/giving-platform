import { createServerFn } from '@tanstack/react-start'

import { wireInput } from '#/core/wire'

import type { ReceiptInput } from './receipt.server'
import { getReceiptAction } from './receipt.server'
import { getSavedPaymentMethodsAction } from './saved-cards.server'
import type { StartContributionInput } from './start-contribution.server'
import { startContributionAction } from './start-contribution.server'

export const startContribution = createServerFn({ method: 'POST' })
  .validator(wireInput<StartContributionInput>())
  .handler((ctx) => startContributionAction(ctx))

export const getSavedPaymentMethods = createServerFn()
  .validator(wireInput<undefined>())
  .handler((ctx) => getSavedPaymentMethodsAction(ctx))

export const getReceipt = createServerFn()
  .validator(wireInput<ReceiptInput>())
  .handler((ctx) => getReceiptAction(ctx))
