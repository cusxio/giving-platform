import { OTPInput } from 'input-otp'
import type { OTPInputProps, SlotProps } from 'input-otp'

import { cx } from '#/styles/cx'

export type InputOtpProps = Omit<
  OTPInputProps,
  'children' | 'maxLength' | 'render'
>

export function InputOtp(props: InputOtpProps) {
  return (
    <OTPInput
      {...props}
      maxLength={6}
      render={({ slots }) => {
        return (
          <div className="grid auto-rows-fr grid-cols-6">
            {slots.map((slot, index) => {
              return <Slot key={`otp-${index.toString()}`} {...slot} />
            })}
          </div>
        )
      }}
    />
  )
}

function FakeCaret() {
  return (
    <div className="pointer-events-none absolute inset-0 flex animate-[blink_1s_steps(1,end)_infinite] items-center justify-center">
      <div className="h-1/2 w-px bg-fg-default" />
    </div>
  )
}

function Slot(props: SlotProps) {
  const { isActive, char, hasFakeCaret } = props
  return (
    <div
      className={cx(
        'center relative flex aspect-square items-center justify-center bg-surface',
        'border-y border-r border-border first:border-l',
        isActive && 'z-10 ring-1 ring-fg-default transition-all',
      )}
    >
      {char !== null && <span className="font-mono text-lg">{char}</span>}
      {hasFakeCaret && <FakeCaret />}
    </div>
  )
}
