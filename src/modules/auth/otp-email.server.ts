import { createElement } from 'react'
import { render, toPlainText } from 'react-email'

import EmailVerification from './emails/email-verification'
import Login from './emails/login'

export async function renderOtpEmail(mode: 'login' | 'signup', otp: string) {
  const template = mode === 'login' ? Login : EmailVerification
  const html = await render(createElement(template, { otp }))
  return { html, text: toPlainText(html) }
}
