import { useEffect, useRef } from 'react'

import { Button } from '#/components/ui/button'
import { FUND_COLOR_MAP } from '#/core/brand/funds'
import type { Fund } from '#/core/brand/funds'
import { cx } from '#/styles/cx'

const quickFillSuggestions: Record<Fund, number[]> = {
  // builder: [5, 10, 20, 50, 100, 500],
  offering: [5, 10, 20, 30, 50, 100],
  tithe: [50, 100, 200, 500, 1000, 2000],
  mission: [5, 10, 20, 50, 100, 500],
  future: [10, 50, 100, 200, 500, 1000],
}

export interface GivingFormFundQuickFillProps {
  currentValue: string
  fund: Fund
  onSelect: (value: string) => void
}

export function GivingFormFundQuickFill(props: GivingFormFundQuickFillProps) {
  const { fund, currentValue, onSelect } = props

  const activeSuggestionRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    activeSuggestionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [currentValue])

  return (
    <div className="@container/form-qf relative">
      <div
        className={cx(
          'snap-x',
          'no-scrollbar flex flex-nowrap overflow-x-auto',
        )}
      >
        {quickFillSuggestions[fund].map((v) => {
          const match = currentValue === v.toString()
          return (
            <Button
              className={cx(
                'snap-center',
                'h-7 w-full min-w-16 px-2',
                'text-sm tabular-nums',
                'transition-colors',
                match ? FUND_COLOR_MAP[fund] : 'text-fg-subtle',
              )}
              key={v}
              onClick={() => {
                onSelect(v.toString())
              }}
              ref={match ? activeSuggestionRef : null}
            >
              {v}
            </Button>
          )
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 -right-2 w-6 bg-linear-to-l from-base-0 to-transparent @[438px]/form-qf:hidden" />
    </div>
  )
}
