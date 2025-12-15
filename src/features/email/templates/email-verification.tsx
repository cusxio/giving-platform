import { Layout } from './layout'
import type { LayoutProps } from './layout'

interface EmailVerificationProps extends Pick<LayoutProps, 'otp'> {}

export default function EmailVerification(props: EmailVerificationProps) {
  const { otp } = props

  return (
    <Layout
      mode="signup"
      otp={otp}
      previewText="Confirm your email to get started."
      text="You’re almost set! Enter this verification code on the sign up page to continue signing up. Don’t wait, this code is only valid for 5 minutes."
    />
  )
}
