import type { PopoverStore } from '@ariakit/react'
import { PopoverDisclosure } from '@ariakit/react'
import { CaretDownIcon } from '@phosphor-icons/react/dist/ssr'
import { useMemo } from 'react'
import type { PropsRange } from 'react-day-picker'

import { createDateFormatter } from '#/core/formatters'
import { cx } from '#/styles/cx'

import { Button } from '../button'

interface DateRangePickerButtonProps {
  store: PopoverStore
  value: PropsRange['selected']
}

export function DateRangePickerButton(props: DateRangePickerButtonProps) {
  const { store, value } = props

  const dateFormatter = useMemo(() => {
    return createDateFormatter({
      day: 'numeric',
      year: 'numeric',
      month: 'long',
    })
  }, [])

  return (
    <PopoverDisclosure
      render={
        <Button
          className={cx(
            'border border-border bg-surface',
            'h-9 gap-x-2 px-4',
            'text-sm text-fg-default',
          )}
        />
      }
      store={store}
    >
      <span>
        {value?.from && value.to
          ? dateFormatter.formatRange(value.from, value.to)
          : 'Pick a date range'}
      </span>
      <CaretDownIcon size={12} weight="bold" />
    </PopoverDisclosure>
  )
}
