import type { Analytics } from '#/modules/analytics'

const COLUMNS = [
  ['Fund', (fund) => fund.fundName],
  ['Received (RM)', (fund) => fund.amount.toFixed(2)],
  ['Same days last year (RM)', (fund) => fund.prior.toFixed(2)],
  ['Gifts', (fund) => String(fund.gifts)],
  ['Signed in (RM)', (fund) => fund.signedIn.toFixed(2)],
  ['Guest (RM)', (fund) => fund.guest.toFixed(2)],
] as const satisfies readonly (readonly [string, (fund: Analytics['funds'][number]) => string])[]

/** Quotes a field that holds a comma, quote or line break, per RFC 4180. */
const field = (value: string) =>
  /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value

/** The funds table as CSV: aggregates only, like the page. */
export function fundsCsv(funds: Analytics['funds']): string {
  const lines = [
    COLUMNS.map(([header]) => header),
    ...funds.map((fund) => COLUMNS.map(([, cell]) => cell(fund))),
  ]
  return `${lines.map((line) => line.map((value) => field(value)).join(',')).join('\r\n')}\r\n`
}

export const fundsCsvName = (period: Analytics['period']) =>
  `funds-${period.start}-to-${period.end}.csv`
