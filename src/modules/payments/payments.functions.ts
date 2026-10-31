import { createServerFn } from '@tanstack/react-start'

import type { ReceiptInput } from './receipt.server'
import { getReceiptProcedure } from './receipt.server'

export const getReceipt = createServerFn()
  .validator((input: ReceiptInput) => input)
  .handler(({ context, data }) => getReceiptProcedure(context, data))
