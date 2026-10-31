import { createHmac, timingSafeEqual } from 'node:crypto'

/** HMAC-SHA256 of a token, hex encoded. Session and OTP tokens are stored only as this hash. */
export function createTokenHasher(secret: string): (token: string) => string {
  return (token) => createHmac('sha256', secret).update(token).digest('hex')
}

// timingSafeEqual throws on inputs of different lengths, and some inputs (such as a
// gateway signature) are caller-controlled, so a length mismatch is just "not equal".
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.byteLength === right.byteLength && timingSafeEqual(left, right)
}
