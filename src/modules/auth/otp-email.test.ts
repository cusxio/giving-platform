import { describe, expect, it } from 'vitest'

import { config } from '#/core/brand'

import { renderOtpEmail } from './otp-email.server'

describe('the login code email', () => {
  it.each([
    { mode: 'login', wording: 'log in' },
    { mode: 'signup', wording: 'sign up' },
  ] as const)('renders the $mode code as html and as plain text', async ({ mode, wording }) => {
    expect.hasAssertions()

    const { html, text } = await renderOtpEmail(mode, '482913')

    expect(html).toContain('482913')
    expect(html).toContain(config.entity)
    expect(text).toContain('482913')
    expect(text).toContain(`${wording} process`)
    expect(text).not.toContain('<')
  })
})
