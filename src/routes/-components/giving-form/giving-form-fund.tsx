import { createElement, useCallback } from 'react'

import type { InputCurrencyProps } from '#/components/ui/input-currency'
import { InputCurrency } from '#/components/ui/input-currency'
import type { funds } from '#/core/brand'
import { FUND_COLOR_MAP, FUND_ICON_MAP } from '#/core/brand/funds'
import { cx } from '#/styles/cx'

import type { GivingFormFundQuickFillProps } from './giving-form-fund-quick-fill'
import { GivingFormFundQuickFill } from './giving-form-fund-quick-fill'
import type { GivingFormStore } from './use-giving-form'

interface GivingFormFundProps {
  fund: (typeof funds)[number]
  store: GivingFormStore
}

export function GivingFormFund(props: GivingFormFundProps) {
  const { fund, store } = props

  const handleCurrencyValueChange: InputCurrencyProps['onValueChange'] =
    useCallback(
      (value, name) => {
        if (name === undefined) {
          return
        }
        store.setValue(name, value ?? '')
      },
      [store],
    )

  const currentValue = store.useValue<string>(store.names[fund])

  const handleSelect: GivingFormFundQuickFillProps['onSelect'] = useCallback(
    (v) => {
      store.setValue(fund, v)
    },
    [fund, store],
  )

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

      <GivingFormFundQuickFill
        currentValue={currentValue}
        fund={fund}
        onSelect={handleSelect}
      />

      <InputCurrency
        autoComplete="off"
        name={store.names[fund]}
        onValueChange={handleCurrencyValueChange}
      />
    </div>
  )
}
