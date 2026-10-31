import { isIPv4, isIPv6 } from 'node:net'

/** The eight groups of an IPv6 address, lower case and without leading zeros. */
function groups(address: string): string[] {
  // The URL parser prints an address canonically, an embedded IPv4 tail as two hex groups.
  const canonical = new URL(`http://[${address}]`).hostname.slice(1, -1)
  const [head = '', tail] = canonical.split('::')
  const left = head === '' ? [] : head.split(':')
  if (tail === undefined) {
    return left
  }
  const right = tail === '' ? [] : tail.split(':')
  return [...left, ...Array.from({ length: 8 - left.length - right.length }, () => '0'), ...right]
}

/** Two hex groups as a dotted IPv4 address. */
function dotted(high: string, low: string): string {
  const value = Number.parseInt(high, 16) * 0x1_00_00 + Number.parseInt(low, 16)
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.')
}

/**
 * The client address a rate limit counts against, or null when the request names none.
 *
 * Vercel sets `x-real-ip` to the address that connected to its edge and overwrites whatever the
 * client sent, so a caller cannot choose it. `x-forwarded-for` is not read: behind any other
 * proxy its first entry is whatever the client wrote. In local dev, Nitro's Vercel emulation
 * fills the header in, with 127.0.0.1 for a local browser. An IPv4 address written as IPv6, in
 * any spelling, counts as that IPv4 address. Any other IPv6 address counts as its /64, the block
 * one subscriber usually holds, so a single host cannot rotate through addresses.
 */
export function clientIp(headers: Headers): null | string {
  const address = headers.get('x-real-ip')?.trim() ?? ''
  if (isIPv4(address)) {
    return address
  }
  if (!isIPv6(address) || address.includes('%')) {
    return null
  }
  const [a, b, c, d, e, f = '', g = '', h = ''] = groups(address)
  if ([a, b, c, d, e].some((group) => group !== '0')) {
    return `${[a, b, c, d].join(':')}::/64`
  }
  // ::ffff:a.b.c.d is IPv4-mapped; ::a.b.c.d is the deprecated IPv4-compatible form.
  if (f === 'ffff' || (f === '0' && g !== '0')) {
    return dotted(g, h)
  }
  // The unspecified address names no client. ::1 is a single host, the loopback.
  if (h === '0') {
    return null
  }
  return `::${h}`
}
