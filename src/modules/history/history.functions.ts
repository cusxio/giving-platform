import { createServerFn } from '@tanstack/react-start'

import { wireInput } from '#/core/wire'

import type { OverviewInput, TransactionInput, TransactionsInput } from './history.server'
import {
  getAvailableYearsAction,
  getOverviewAction,
  getTransactionAction,
  getTransactionsAction,
} from './history.server'

export const getOverview = createServerFn()
  .validator(wireInput<OverviewInput>())
  .handler((ctx) => getOverviewAction(ctx))

export const getAvailableYears = createServerFn()
  .validator(wireInput<undefined>())
  .handler((ctx) => getAvailableYearsAction(ctx))

export const getTransactions = createServerFn()
  .validator(wireInput<TransactionsInput>())
  .handler((ctx) => getTransactionsAction(ctx))

export const getTransaction = createServerFn()
  .validator(wireInput<TransactionInput>())
  .handler((ctx) => getTransactionAction(ctx))
