import type { PopoverStore } from '@ariakit/react'
import { Popover, PopoverArrow } from '@ariakit/react'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react/dist/ssr'
import { useCallback } from 'react'
import type {
  ChevronProps,
  NextMonthButtonProps,
  PropsRange,
} from 'react-day-picker'
import { DayPicker } from 'react-day-picker'

import { cx } from '#/styles/cx'

import { Button } from '../button'

import type { DateRangePickerPresetsProps } from './date-range-picker-presets'
import { DateRangePickerPresets } from './date-range-picker-presets'

export interface DateRangePickerPopoverProps {
  onChange: (value: PropsRange['selected']) => void
  store: PopoverStore
  value: PropsRange['selected']
}

export function DateRangePickerPopover(props: DateRangePickerPopoverProps) {
  const { store, onChange, value } = props

  const handleSelect = useCallback<NonNullable<PropsRange['onSelect']>>(
    (range) => {
      onChange(range)
    },
    [onChange],
  )

  const handlePresetChange = useCallback<
    DateRangePickerPresetsProps['onChange']
  >(
    (nextRange) => {
      onChange(nextRange)
    },
    [onChange],
  )

  return (
    <Popover
      className={cx(
        'p-2',
        'border border-border bg-base-0',
        'scale-95 opacity-0',
        'origin-(--popover-transform-origin)',
        'transition duration-150 ease-out',
        'data-enter:scale-100 data-enter:opacity-100',
        'data-leave:duration-100 data-leave:ease-in',
      )}
      modal
      store={store}
      unmountOnHide
    >
      <PopoverArrow />
      <DayPicker
        classNames={{
          root: cx('relative'),
          nav: cx('absolute inset-x-0 top-1', 'flex justify-between'),
          month_caption: cx(
            'flex h-10 items-center justify-center',
            'text-sm font-medium',
          ),
          //
          range_start: cx('range_start'),
          range_end: cx('range_end'),
          range_middle: cx('range_middle'),
          day: cx('group'),
          day_button: cx(
            'h-8 w-8 tabular-nums',
            'text-sm transition-colors',
            'group-data-[outside=true]:text-fg-subtle',
            'text-fg-1',

            // hover
            String.raw`group-[:not(.range\_start):not(.range\_end):not(.range\_middle)]:hover:bg-elevated`,
            String.raw`group-[:not(.range\_start):not(.range\_end):not(.range\_middle)]:hover:text-fg-1`,

            String.raw`group-[.range\_start]:bg-fg-1`,
            String.raw`group-[.range\_start]:text-base-1`,

            String.raw`group-[.range\_middle]:bg-elevated/80`,
            String.raw`group-[.range\_middle]:text-fg-muted/70`,

            String.raw`group-[.range\_end]:bg-fg-1`,
            String.raw`group-[.range\_end]:text-base-1`,
          ),
          // Su, Mo, Tu, We, etc..
          weekday: cx('w-8 text-xs font-normal text-fg-muted'),
          weekdays: cx('my-2 flex'),
          weeks: cx('grid gap-y-2'),
        }}
        components={{
          PreviousMonthButton: DateRangePickerMonthButton,
          NextMonthButton: DateRangePickerMonthButton,
          Chevron: DateRangePickerChevron,
        }}
        footer={<DateRangePickerPresets onChange={handlePresetChange} />}
        mode="range"
        onSelect={handleSelect}
        selected={value}
        showOutsideDays
      />
    </Popover>
  )
}

function DateRangePickerChevron(props: ChevronProps) {
  return props.orientation === 'left' ? (
    <CaretLeftIcon size={14} {...props} />
  ) : (
    <CaretRightIcon size={14} {...props} />
  )
}

function DateRangePickerMonthButton(props: NextMonthButtonProps) {
  const { className, ...rest } = props
  return (
    <Button
      className={cx(
        className,
        'h-7 w-7 border border-border bg-base-0 transition',
        'hover:bg-surface',
      )}
      {...rest}
    />
  )
}
