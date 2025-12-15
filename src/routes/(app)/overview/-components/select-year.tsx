import { useSelectStore, useStoreState } from '@ariakit/react'
import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'

import { Select, SelectItem, SelectPopover } from '#/components/ui/select'
import { clientTz, now } from '#/core/date'

interface SelectYearProps {
  defaultValue: string
  values: [string, string, ...string[]]
}

export function SelectYear(props: SelectYearProps) {
  const { values, defaultValue } = props

  const store = useSelectStore({ defaultValue })
  const currentValue = useStoreState(store, 'value')

  const currentCalendarYear = useMemo(() => now(clientTz).getFullYear(), [])

  return (
    <>
      <SelectPopover store={store}>
        {values.map((v) => {
          const year = v === 'all' ? 'all' : Number.parseInt(v)
          return (
            <SelectItem
              key={v}
              render={(p) => {
                return (
                  <Link
                    search={{
                      // The current year has no query string
                      year: year === currentCalendarYear ? undefined : year,
                    }}
                    to="/overview"
                    {...p}
                  >
                    {mapValue(v)}
                    {currentValue === v && <CheckIcon weight="bold" />}
                  </Link>
                )
              }}
              store={store}
              value={v}
            />
          )
        })}
      </SelectPopover>
      <Select className="min-w-24" store={store}>
        {mapValue(currentValue)}
        <CaretDownIcon className="text-current" weight="bold" />
      </Select>
    </>
  )
}

function mapValue(v: string) {
  if (v === 'all') return 'All time'
  return v
}
