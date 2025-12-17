import type { FormInputProps } from '@ariakit/react'
import { FormInput, FormLabel, VisuallyHidden } from '@ariakit/react'

import { cx } from '#/styles/cx'

interface InputProps extends Pick<
  FormInputProps,
  | 'className'
  | 'disabled'
  | 'inputMode'
  | 'maxLength'
  | 'name'
  | 'placeholder'
  | 'readOnly'
  | 'required'
  | 'type'
> {
  hideLabel?: boolean
  label: string
}

export function Input(props: InputProps) {
  const { className, hideLabel, label, name, ...rest } = props
  return (
    <div className="flex flex-col gap-y-1">
      {hideLabel === true ? (
        <VisuallyHidden>
          <FormLabel name={name}>{label}</FormLabel>
        </VisuallyHidden>
      ) : (
        <FormLabel className="text-sm text-fg-muted" name={name}>
          {label}
        </FormLabel>
      )}
      <FormInput
        className={cx(
          'border border-border bg-surface px-2 focus:outline-none',
          'h-9 text-sm placeholder:text-fg-subtle',
          'disabled:text-fg-subtle',
          'read-only:text-fg-subtle',
        )}
        name={name}
        {...rest}
      />
    </div>
  )
}
