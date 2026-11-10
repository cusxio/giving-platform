import { FormError, useFormValue } from '@ariakit/react'
import { createElement, useCallback } from 'react'

import { Alert } from '#/components/ui/alert'
import type { InputCurrencyProps } from '#/components/ui/input-currency'
import { InputCurrency, sameAmount } from '#/components/ui/input-currency'
import type { funds } from '#/core/brand'
import { FUND_COLOR_MAP, FUND_ICON_MAP } from '#/core/brand/funds'
import { createCurrencyFormatter } from '#/core/formatters'
import { MAX_FUND_AMOUNT } from '#/modules/payments'
import { cx } from '#/styles/cx'

import { GivingFormFundQuickFill } from './giving-form-fund-quick-fill'
import type { GivingFormStore } from './use-giving-form'

export const OVER_MAX_MESSAGE = `The most you can give to one fund is ${createCurrencyFormatter({ showSymbol: true }).format(MAX_FUND_AMOUNT)}.`

const alert = <Alert className="text-balance empty:hidden" />

interface GivingFormFundProps {
  fund: (typeof funds)[number]
  store: GivingFormStore
}

export function GivingFormFund(props: GivingFormFundProps) {
  const { fund, store } = props

  const handleCurrencyValueChange: InputCurrencyProps['onValueChange'] = useCallback(
    (value = '') => {
      // The field reports its amount again on blur, which must not clear the over-max message.
      if (!sameAmount(value, store.getValue(fund))) {
        store.setError(fund, undefined)
      }
      store.setValue(fund, value)
    },
    [fund, store],
  )

  const handleQuickFill = useCallback(
    (value: string) => {
      store.setValue(fund, value)
      store.setError(fund, undefined)
    },
    [fund, store],
  )

  const handleOverMax = useCallback(() => {
    store.setFieldTouched(fund, true)
    store.setError(fund, OVER_MAX_MESSAGE)
  }, [fund, store])

  const currentValue = useFormValue<string>(store, store.names[fund])

  return (
    <div
      className={cx(
        'flex flex-col bg-base-0',
        'gap-y-2 p-2 @[472px]/form:gap-y-4 @[472px]/form:p-4',
        'border border-border',
      )}
    >
      <div className="flex items-center gap-x-2">
        <span className={cx('rounded-full p-1', FUND_COLOR_MAP[fund])}>
          {createElement(FUND_ICON_MAP[fund])}
        </span>
        <span className="text-fg-1/80 capitalize">{fund}</span>
      </div>

      <GivingFormFundQuickFill currentValue={currentValue} fund={fund} onSelect={handleQuickFill} />

      <InputCurrency
        autoComplete="off"
        max={MAX_FUND_AMOUNT}
        name={store.names[fund]}
        onOverMax={handleOverMax}
        onValueChange={handleCurrencyValueChange}
      />
      <FormError name={store.names[fund]} render={alert} />
    </div>
  )
}
