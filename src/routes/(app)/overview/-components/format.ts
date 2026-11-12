import { createCurrencyFormatter, createDateFormatter } from '#/core/formatters'

const currency = createCurrencyFormatter({ showSymbol: true })

/** Ringgit with its symbol, or the symbol and a dash in privacy mode. */
export const money = (amount: number, privacyMode: boolean) => currency.format(amount, privacyMode)

export const dayMonth = createDateFormatter({ day: 'numeric', month: 'short' })
export const dayMonthYear = createDateFormatter({ day: 'numeric', month: 'short', year: 'numeric' })
export const monthYear = createDateFormatter({ month: 'short', year: 'numeric' })

const fundList = new Intl.ListFormat('en', { type: 'conjunction' })

/** "Tithe and Mission". */
export const listFunds = (fundNames: readonly string[]) => fundList.format(fundNames)
