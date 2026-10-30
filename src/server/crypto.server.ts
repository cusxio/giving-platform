import { createHmac, timingSafeEqual } from 'node:crypto'

import { SESSION_SECRET } from '#/server/env.server'

export function hashToken(token: string) {
  return createHmac('sha256', SESSION_SECRET).update(token).digest('hex')
}

// timingSafeEqual throws on inputs of different lengths, and some inputs (such as a
// gateway signature) are caller-controlled, so a length mismatch is just "not equal".
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.byteLength === right.byteLength && timingSafeEqual(left, right)
}
