import type { FormSubmitProps } from '@ariakit/react'
import { FormSubmit } from '@ariakit/react'
import { useLayoutEffect, useRef } from 'react'

import { cx } from '#/styles/cx'

import { Button } from './button'
import { Spinner } from './spinner'

interface FormSubmitButtonProps extends FormSubmitProps {
  submitting: boolean
}

export function FormSubmitButton(props: FormSubmitButtonProps) {
  const { className, submitting } = props

  const { ref } = useStableButtonSize<HTMLButtonElement>(submitting)

  return (
    <FormSubmit
      disabled={submitting}
      ref={ref}
      render={<Button className={cx(className)} />}
    >
      {!submitting && props.children}

      {submitting && <Spinner className="h-4.5 w-4.5" />}
    </FormSubmit>
  )
}

function useStableButtonSize<T extends HTMLElement>(submitting: boolean) {
  const buttonRef = useRef<T>(null)
  const widthRef = useRef<null | number>(null)

  useLayoutEffect(() => {
    const el = buttonRef.current
    if (!el) return

    if (submitting) {
      // Ensure width is captured synchronously if it never was
      widthRef.current ??= el.offsetWidth

      el.style.width = `${widthRef.current}px`
      return
    }

    // Not submitting → clear width and begin observing
    el.style.width = ''

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        widthRef.current =
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          entry.borderBoxSize?.[0]?.inlineSize ?? el.offsetWidth
      }
    })

    observer.observe(el)

    return () => {
      observer.disconnect()
    }
  }, [submitting])

  return { ref: buttonRef }
}
