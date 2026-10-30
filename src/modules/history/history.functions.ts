import { createServerFn } from '@tanstack/react-start'

import type { AvailableYearsInput, OverviewInput, TransactionsInput } from './history.server'
import {
  getAvailableYearsProcedure,
  getOverviewProcedure,
  getTransactionsProcedure,
} from './history.server'

export const getOverview = createServerFn()
  .validator((input: OverviewInput) => input)
  .handler(({ context, data }) => getOverviewProcedure(context, data))

export const getAvailableYears = createServerFn()
  .validator((input: AvailableYearsInput) => input)
  .handler(({ context, data }) => getAvailableYearsProcedure(context, data))

export const getTransactions = createServerFn()
  .validator((input: TransactionsInput) => input)
  .handler(({ context, data }) => getTransactionsProcedure(context, data))
