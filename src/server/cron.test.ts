import { describe, expect, it } from 'vitest'

import { isCronRequest } from './cron.server'

describe('a cron call', () => {
  it('is accepted only with the Bearer scheme and the exact secret', () => {
    expect.hasAssertions()

    expect(isCronRequest('cron-secret', 'Bearer cron-secret')).toBe(true)
    expect(isCronRequest('cron-secret', 'Bearer cron-secret2')).toBe(false)
    expect(isCronRequest('cron-secret', 'cron-secret')).toBe(false)
    expect(isCronRequest('cron-secret', null)).toBe(false)
  })

  it.each([
    ['an empty secret', '', 'Bearer '],
    ['an unset secret', undefined, 'Bearer undefined'],
  ])('is refused under %s, whatever it carries', (_case, secret, authorization) => {
    expect.hasAssertions()

    expect(isCronRequest(secret, authorization)).toBe(false)
    expect(isCronRequest(secret, null)).toBe(false)
  })
})
