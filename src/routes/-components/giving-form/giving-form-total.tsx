import { useStoreState } from '@ariakit/react'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { useMemo } from 'react'

import { Button, buttonVariants } from '#/components/ui/button'
import { FormSubmitButton } from '#/components/ui/form-submit-button'
import { funds } from '#/core/brand'
import { createCurrencyFormatter } from '#/core/formatters'
import { cx } from '#/styles/cx'

import type { GivingFormStore, GivingFormView } from './use-giving-form'

interface GivingFormTotalProps {
  onGoBack: () => void
  store: GivingFormStore
  view: GivingFormView
}

export function GivingFormTotal(props: GivingFormTotalProps) {
  const { store, view, onGoBack } = props
  const values = useStoreState(store, 'values')
  const totalInCents = useMemo(() => {
    return funds
      .map((f) => {
        return Math.round(Number.parseFloat(values[f]) * 100)
      })
      .filter((v) => !Number.isNaN(v))
      .reduce((acc, val) => acc + val, 0)
  }, [values])

  const formatter = createCurrencyFormatter({
    showSymbol: true,
    decimal: 'always',
  })

  // We only care when the form is submitted to the backend
  const submitting = useStoreState(store, 'submitting') && view === 'details'

  const enter = totalInCents > 0
  return (
    <div
      className={cx(
        'sticky bottom-0',
        '-mx-4 px-4 py-3',
        'border-t border-border bg-base-1',
        // transition
        'transition duration-150 ease-out',
        enter
          ? 'translate-y-0 opacity-100'
          : 'translate-y-2 opacity-0 duration-100 ease-in',
      )}
    >
      <div className="flex items-center justify-between gap-x-2">
        {view === 'amounts' ? (
          <div className="flex flex-col gap-y-0.5">
            <span className="text-xs font-semibold text-fg-subtle uppercase">
              total amount
            </span>
            <span className="font-mono">
              {formatter.format(totalInCents / 100)}
            </span>
          </div>
        ) : (
          <Button
            className="gap-x-1 text-sm text-fg-subtle hover:underline"
            onClick={onGoBack}
          >
            <CaretLeftIcon />
            <span>Back</span>
          </Button>
        )}

        <FormSubmitButton
          className={cx(buttonVariants.lime, 'h-8')}
          submitting={submitting}
        >
          {view === 'amounts' ? (
            'Continue'
          ) : (
            <>Give {formatter.format(totalInCents / 100)}</>
          )}
        </FormSubmitButton>
      </div>
    </div>
  )
}
