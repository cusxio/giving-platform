import { describe, expect, it } from 'vitest'

import { generateOtp } from './utils'

describe('one-time passcodes', () => {
  it('are always six digits without a leading zero', () => {
    expect.hasAssertions()

    const otps = Array.from({ length: 5000 }, generateOtp)

    expect(otps.every((otp) => /^[1-9]\d{5}$/u.test(otp))).toBe(true)
    expect(new Set(otps).size).toBeGreaterThan(4900)
  })
})
