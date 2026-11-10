import type { FormInputProps } from '@ariakit/react'
import { FormInput } from '@ariakit/react'
import { useMemo } from 'react'
import type { CurrencyInputProps } from 'react-currency-input-field'
import { CurrencyInput, cleanValue } from 'react-currency-input-field'

import { createCurrencyFormatter } from '#/core/formatters'
import { cx } from '#/styles/cx'

export interface InputCurrencyProps extends Pick<FormInputProps, 'autoComplete' | 'name'> {
  /** The largest amount the field takes. An entry past it leaves the field as it was. */
  max: number
  onOverMax: () => void
  onValueChange: NonNullable<CurrencyInputProps['onValueChange']>
}

const amountFormat = {
  allowNegativeValue: false,
  decimalSeparator: '.',
  decimalsLimit: 2,
  disableAbbreviations: true,
  groupSeparator: ',',
} as const

export const fitsMax = (text: string | undefined, max: number) =>
  !(Number.parseFloat(cleanValue({ ...amountFormat, value: text ?? '' })) > max)

export const sameAmount = (a: string, b: string) =>
  a === b || Number.parseFloat(a) === Number.parseFloat(b)

export function InputCurrency(props: InputCurrencyProps) {
  const { autoComplete, max, name, onOverMax, onValueChange } = props
  const currency = useMemo(
    () =>
      createCurrencyFormatter({ showSymbol: true })
        .formatToParts(1)
        .find((p) => p.type === 'currency')?.value ?? 'RM',
    [],
  )

  return (
    <div className="relative">
      <div
        className={cx(
          'pointer-events-none',
          'absolute left-0 h-full w-11',
          'inline-flex items-center justify-center',
          'border-r border-border',
        )}
      >
        <span className="text-sm text-fg-muted">{currency}</span>
      </div>

      <FormInput
        autoComplete={autoComplete}
        className={cx(
          'text-right',
          'h-9 w-full border border-border bg-surface focus:outline-none',
          'font-mono text-sm placeholder:text-fg-subtle',
          'pr-2 pl-13',
        )}
        name={name}
        /**
         * We deliberately ignore the `onChange` prop provided by Ariakit's
         * `render` prop.
         *
         * WHY: The standard `onChange` event would provide the formatted string
         * from the input (e.g., "RM 1,234.56"). Storing this presentation
         * value in our form state is incorrect.
         *
         * INSTEAD: We rely on the `onValueChange` prop, which is passed down
         * from the parent form. `react-currency-input-field` calls this
         * special handler with the clean, unformatted numerical string
         * (e.g., "1234.56"), which is the correct data model value we want
         * to store.
         */
        render={({ onChange, defaultValue, ...rest }) => (
          <CurrencyInput
            {...amountFormat}
            inputMode="numeric"
            max={max}
            onValueChange={onValueChange}
            placeholder="0.00"
            // The library keeps its own copy of the text and edits the next keystroke against it, so
            // an entry past `max` is swapped for the kept amount before the library stores it.
            transformRawValue={(text) => {
              if (fitsMax(text, max)) {
                return text
              }
              onOverMax()
              return 'value' in rest && typeof rest.value === 'string' ? rest.value : ''
            }}
            type="text"
            {...rest}
          />
        )}
      />
    </div>
  )
}
