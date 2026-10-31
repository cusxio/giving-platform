import { describe, expect, it } from 'vitest'

import { clientIp } from './client-ip.server'

const from = (headers: Record<string, string>) => clientIp(new Headers(headers))

describe('the client address', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    [' 203.0.113.7 ', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::FFFF:203.0.113.7', '203.0.113.7'],
    ['::ffff:cb00:7107', '203.0.113.7'],
    ['0:0:0:0:0:ffff:203.0.113.7', '203.0.113.7'],
    ['0000:0000:0000:0000:0000:ffff:cb00:7107', '203.0.113.7'],
    ['::203.0.113.7', '203.0.113.7'],
    ['::1', '::1'],
    ['0:0:0:0:0:0:0:1', '::1'],
    ['2001:db8:1:2:aaaa:bbbb:cccc:dddd', '2001:db8:1:2::/64'],
    ['2001:0DB8:0001:0002:0:0:0:5', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['64:ff9b::203.0.113.7', '64:ff9b:0:0::/64'],
  ])('keys x-real-ip %o as %o', (header, key) => {
    expect.hasAssertions()

    expect(from({ 'x-real-ip': header })).toBe(key)
  })

  it.each([
    ['no header', {}],
    ['an x-forwarded-for chain only', { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }],
    ['a list in x-real-ip', { 'x-real-ip': '203.0.113.7, 10.0.0.1' }],
    ['a name', { 'x-real-ip': 'localhost' }],
    ['a zoned IPv6 address', { 'x-real-ip': 'fe80::1%eth0' }],
    ['the unspecified address', { 'x-real-ip': '::' }],
  ])('is null for %s', (_case, headers) => {
    expect.hasAssertions()

    expect(from(headers)).toBeNull()
  })
})
