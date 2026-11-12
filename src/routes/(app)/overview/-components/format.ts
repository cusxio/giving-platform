import { createCurrencyFormatter, createDateFormatter } from '#/core/formatters'

const currency = createCurrencyFormatter({ showSymbol: true })

export const money = (amount: number, privacyMode: boolean) => currency.format(amount, privacyMode)

export const dayMonth = createDateFormatter({ day: 'numeric', month: 'short' })
export const dayMonthYear = createDateFormatter({ day: 'numeric', month: 'short', year: 'numeric' })
export const monthYear = createDateFormatter({ month: 'short', year: 'numeric' })
export const longMonthYear = createDateFormatter({ month: 'long', year: 'numeric' })

const fundList = new Intl.ListFormat('en', { type: 'conjunction' })

export const listFunds = (fundNames: readonly string[]) => fundList.format(fundNames)
