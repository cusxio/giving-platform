import { clientTz } from './date'

export const REDACTED_VALUE = '—'

export function createCurrencyFormatter(
  options?: Omit<Intl.NumberFormatOptions, 'currency' | 'style'> & {
    decimal?: 'always' | 'if-needed'
    showSymbol?: boolean
  },
) {
  const { decimal, showSymbol, ...rest } = {
    decimal: 'if-needed',
    showSymbol: false,
    ...options,
  }

  const formatter = new Intl.NumberFormat('en-MY', {
    ...(showSymbol && { currency: 'MYR', style: 'currency' }),
    maximumFractionDigits: 2,
    minimumFractionDigits: decimal === 'if-needed' ? 0 : 2,
    ...rest,
  })

  return {
    formatToParts: formatter.formatToParts.bind(formatter),
    format(value: number, privacyMode = false) {
      if (privacyMode) {
        const parts = formatter
          .formatToParts(value)
          .find((p) => p.type === 'currency')

        const placeholder = REDACTED_VALUE

        if (parts) {
          return `${parts.value} ${placeholder}`
        }

        return placeholder
      }

      return formatter.format(value)
    },
  }
}

export function createDateFormatter(
  options: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-MY', { timeZone: clientTz, ...options })
}
