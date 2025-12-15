import { FormRadio, FormRadioGroup, FormStore } from '@ariakit/react'
import { createElement } from 'react'

import { SavedPaymentMethod } from '#/db/schema'
import { cx } from '#/styles/cx'

import { CARD_COMPONENTS } from './payment-methods-cards'

type CardType = keyof typeof CARD_COMPONENTS

interface PaymentMethodsProps {
  savedPaymentMethods: SavedPaymentMethod[]
  store: FormStore<{ token: string | undefined }>
}

const pseudoRadio = cx(
  'h-3.5 w-3.5 rounded-full border border-border bg-[oklch(0.2022_0_0)]',
  'peer-checked:border-3 peer-checked:border-fg-1/90 peer-checked:bg-base-0',
)

export function PaymentMethods(props: PaymentMethodsProps) {
  const { savedPaymentMethods, store } = props

  return (
    <FormRadioGroup className="flex flex-col">
      {savedPaymentMethods.map((x) => {
        const year = x.cardExp.slice(0, 4)
        const month = x.cardExp.slice(4, 6)

        return (
          <label
            className="flex items-center gap-x-4 py-2 select-none"
            key={x.cardNoMask}
          >
            <FormRadio
              className="peer sr-only"
              name={store.names.token}
              value={x.token}
            />
            <span className={pseudoRadio} />
            <span className="inline-flex overflow-hidden rounded-sm">
              {createElement(
                isCardType(x.cardType)
                  ? CARD_COMPONENTS[x.cardType]
                  : CARD_COMPONENTS.GENERIC,
              )}
            </span>
            <span className="inline-flex flex-col">
              <span className="text-sm font-light tracking-wider text-fg-1/80">
                {`•••• •••• •••• `}
                <span className="font-medium">{x.cardNoMask.slice(-4)}</span>
              </span>
              <span className="text-xs text-fg-muted">
                Expires {month}/{year}
              </span>
            </span>
          </label>
        )
      })}

      <label className="flex items-center gap-x-4 py-4 select-none">
        <FormRadio
          className="peer sr-only"
          name={store.names.token}
          value={__NORMAL_CHECKOUT__}
        />
        <span className={pseudoRadio} />
        <span className="text-sm text-fg-1/80">
          Online Banking / E-wallet / New Card
        </span>
      </label>
    </FormRadioGroup>
  )
}

function isCardType(type: string): type is CardType {
  return type in CARD_COMPONENTS
}

export const __NORMAL_CHECKOUT__ = '__NORMAL_CHECKOUT__' as const
