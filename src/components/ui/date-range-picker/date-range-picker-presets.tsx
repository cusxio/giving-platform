import { Separator } from '@ariakit/react'
import { CheckIcon } from '@phosphor-icons/react/dist/ssr'
import { useCallback, useMemo } from 'react'
import type { DateRange } from 'react-day-picker'
import { useDayPicker } from 'react-day-picker'

import {
  addDays,
  addYears,
  clientTz,
  endOfMonth,
  endOfYear,
  now,
  startOfMonth,
  startOfYear,
} from '#/core/date'
import { cx } from '#/styles/cx'

import { Button } from '../button'

export interface DateRangePickerPresetsProps {
  onChange: (value: DateRange) => void
}

interface DateRangePickerPresetProps {
  dateRange: DateRange
  isSelected: boolean
  label: string
  onChange: DateRangePickerPresetsProps['onChange']
}

export function DateRangePickerPresets(props: DateRangePickerPresetsProps) {
  const { onChange } = props
  const { selected, goToMonth } = useDayPicker<{ mode: 'range' }>()

  const presets = useMemo(() => {
    return createPresets()
  }, [])

  const handleSelect: DateRangePickerPresetsProps['onChange'] = useCallback(
    (nextRange) => {
      onChange(nextRange)
      if (nextRange.from) {
        goToMonth(nextRange.from)
      }
    },
    [goToMonth, onChange],
  )

  const isRangeSelected = useCallback(
    (range: DateRange) => {
      if (!selected?.from || !selected.to || !range.from || !range.to) {
        return false
      }

      const toISODateString = (date: Date) => date.toLocaleDateString('en-CA')

      return (
        toISODateString(selected.from) === toISODateString(range.from) &&
        toISODateString(selected.to) === toISODateString(range.to)
      )
    },
    [selected],
  )

  return (
    <div>
      <Separator
        className="mt-2 mb-3 h-px border-border"
        orientation="horizontal"
      />
      <div className="px-1 text-xs font-semibold text-fg-muted uppercase select-none">
        Date Range
      </div>
      <div className="mt-1 flex flex-col">
        {presets.map(({ label, dateRange: range }) => {
          const isSelected = isRangeSelected(range)
          return (
            <DateRangePickerPreset
              dateRange={range}
              isSelected={isSelected}
              key={label}
              label={label}
              onChange={handleSelect}
            />
          )
        })}
      </div>
    </div>
  )
}

function createPresets() {
  const today = now(clientTz)
  const presets: { dateRange: DateRange; label: string }[] = [
    {
      label: 'Last 7 days',
      dateRange: { from: addDays(today, -6), to: today },
    },
    {
      label: 'This month',
      dateRange: { from: startOfMonth(today), to: endOfMonth(today) },
    },
    {
      label: 'This year',
      dateRange: { from: startOfYear(today), to: endOfYear(today) },
    },
    {
      label: 'Last year',
      dateRange: {
        from: startOfYear(addYears(today, -1)),
        to: endOfYear(addYears(today, -1)),
      },
    },
  ]

  return presets
}

function DateRangePickerPreset(props: DateRangePickerPresetProps) {
  const { label, dateRange, onChange, isSelected } = props
  const handleClick = useCallback(() => {
    onChange(dateRange)
  }, [dateRange, onChange])

  return (
    <Button
      className={cx(
        'items-center justify-start gap-x-1 px-1 py-1.5',
        'transition-colors',
        'cursor-pointer text-xs text-fg-subtle',
        'enabled:hover:bg-elevated/70 enabled:hover:text-fg-default',
      )}
      disabled={isSelected}
      onClick={handleClick}
      type="button"
    >
      {label}
      {isSelected && (
        <span className="text-fg-1">
          <CheckIcon size={12} weight="bold" />
        </span>
      )}
    </Button>
  )
}
