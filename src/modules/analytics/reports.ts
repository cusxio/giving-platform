import { centsToRinggit } from '#/core/money'

interface FundTotalRow<CreatedAs> {
  readonly createdAs: CreatedAs
  readonly fundName: string
  readonly totalAmount: number
}

export function toReportRows<CreatedAs>(rows: readonly FundTotalRow<CreatedAs>[]) {
  return rows.map((row) => ({
    createdAs: row.createdAs,
    fundName: row.fundName,
    totalAmount: centsToRinggit(row.totalAmount),
  }))
}
