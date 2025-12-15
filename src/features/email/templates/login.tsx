import { Layout } from './layout'
import type { LayoutProps } from './layout'

interface LoginProps extends Pick<LayoutProps, 'otp'> {}

export default function Login(props: LoginProps) {
  const { otp } = props
  return (
    <Layout
      mode="login"
      otp={otp}
      previewText="Your one-time login code is inside."
      text="We have received a login attempt. Here’s the verification code you’ll need to log in. Don’t wait, this code is only valid for 5 minutes."
    />
  )
}
