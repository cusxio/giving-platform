import { usePopoverStore } from '@ariakit/react'
import { CalendarDotsIcon } from '@phosphor-icons/react/dist/ssr'

import { DateRangePickerButton } from './date-range-picker-button'
import type { DateRangePickerPopoverProps } from './date-range-picker-popover'
import { DateRangePickerPopover } from './date-range-picker-popover'

export interface DateRangePickerProps extends Pick<
  DateRangePickerPopoverProps,
  'onChange' | 'value'
> {}

export function DateRangePicker(props: DateRangePickerProps) {
  const store = usePopoverStore({ placement: 'bottom-start' })

  const { value, onChange } = props

  return (
    <>
      <div className="flex items-center gap-x-4">
        <CalendarDotsIcon className="text-fg-muted" />
        <DateRangePickerButton store={store} value={value} />
      </div>

      <DateRangePickerPopover onChange={onChange} store={store} value={value} />
    </>
  )
}
