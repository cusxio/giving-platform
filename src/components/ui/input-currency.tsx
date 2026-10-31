import type { FormInputProps } from '@ariakit/react'
import { FormInput } from '@ariakit/react'
import { useCallback, useMemo } from 'react'
import type { CurrencyInputProps } from 'react-currency-input-field'
import { CurrencyInput } from 'react-currency-input-field'

import { createCurrencyFormatter } from '#/core/formatters'
import { cx } from '#/styles/cx'

type ValueChange = NonNullable<CurrencyInputProps['onValueChange']>

export interface InputCurrencyProps extends Pick<FormInputProps, 'autoComplete' | 'name'> {
  /** The largest amount the field takes. A keystroke that would pass it is ignored. */
  max: number
  onValueChange: ValueChange
}

/** Whether the field's clean value, such as `1234.5`, is at most `max`. Empty fits. */
export const fitsMax = (value: string | undefined, max: number) =>
  !(Number.parseFloat(value ?? '') > max)

/** Characters of the largest amount with its cents, such as `5000000.00`. */
export const maxLengthFor = (max: number) => `${Math.trunc(max)}.00`.length

export function InputCurrency(props: InputCurrencyProps) {
  const { autoComplete, max, name, onValueChange } = props
  const handleValueChange: ValueChange = useCallback(
    (value, ...rest) => {
      if (fitsMax(value, max)) {
        onValueChange(value, ...rest)
      }
    },
    [max, onValueChange],
  )
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
            allowNegativeValue={false}
            inputMode="numeric"
            max={max}
            maxLength={maxLengthFor(max)}
            onValueChange={handleValueChange}
            placeholder="0.00"
            type="text"
            {...rest}
          />
        )}
      />
    </div>
  )
}
