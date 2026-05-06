import { serialize } from 'cookie'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { SESSION_COOKIE_NAME } from './constants'

export function clearSessionCookie() {
  return serializeSessionCookie({ cookieValue: '', expiresAt: new Date(0) })
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
    rawToken: Type.String({ maxLength: 21, minLength: 21 }),
    sessionId: Type.String({ maxLength: 21, minLength: 21 }),
  }),
)
