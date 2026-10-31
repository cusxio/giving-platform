import { isIPv4, isIPv6 } from 'node:net'

/** The eight groups of an IPv6 address, lower case and without leading zeros. */
function groups(address: string): string[] {
  // The URL parser prints an address canonically, an embedded IPv4 tail included.
  const canonical = new URL(`http://[${address}]`).hostname.slice(1, -1)
  const [head = '', tail] = canonical.split('::')
  const left = head === '' ? [] : head.split(':')
  if (tail === undefined) {
    return left
  }
  const right = tail === '' ? [] : tail.split(':')
  return [...left, ...Array.from({ length: 8 - left.length - right.length }, () => '0'), ...right]
}

/**
 * The client address a rate limit counts against, or null when the request names none.
 *
 * Vercel sets `x-real-ip` to the address that connected to its edge and overwrites whatever the
 * client sent, so a caller cannot choose it. `x-forwarded-for` is not read: behind any other
 * proxy its first entry is whatever the client wrote. In local dev, Nitro's Vercel emulation
 * fills the header in, with 127.0.0.1 for a local browser. An IPv6 address counts as its /64,
 * the block one subscriber usually holds, so a single host cannot rotate through addresses.
 */
export function clientIp(headers: Headers): null | string {
  const address = headers.get('x-real-ip')?.trim() ?? ''
  const mapped = /^::ffff:(?<v4>\d+\.\d+\.\d+\.\d+)$/iu.exec(address)?.groups?.v4 ?? address
  if (isIPv4(mapped)) {
    return mapped
  }
  if (!isIPv6(address) || address.includes('%')) {
    return null
  }
  return `${groups(address).slice(0, 4).join(':')}::/64`
}
