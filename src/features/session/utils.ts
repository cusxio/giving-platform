import { serialize } from 'cookie'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { SESSION_COOKIE_NAME } from './constants'

export function clearSessionCookie() {
  return serializeSessionCookie({ expiresAt: new Date(0), cookieValue: '' })
}

export function serializeSessionCookie({
  expiresAt,
  cookieValue,
}: {
  cookieValue: string
  expiresAt: Date
}): string {
  return serialize(SESSION_COOKIE_NAME, cookieValue, {
    expires: expiresAt,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: true,
  })
}

export const cookieValueSchema = Compile(
  Type.Object({
    sessionId: Type.String({ minLength: 21, maxLength: 21 }),
    rawToken: Type.String({ minLength: 21, maxLength: 21 }),
  }),
)
