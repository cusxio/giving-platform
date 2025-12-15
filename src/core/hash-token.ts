import { hmac } from '@oslojs/crypto/hmac'
import { SHA256 } from '@oslojs/crypto/sha2'
import { encodeHexLowerCase } from '@oslojs/encoding'

import { SESSION_SECRET } from '#/envvars'

export function hashToken(token: string) {
  const message = new TextEncoder().encode(token)
  const key = new TextEncoder().encode(SESSION_SECRET)
  const hash = hmac(SHA256, key, message)
  return encodeHexLowerCase(hash)
}
