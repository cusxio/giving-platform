import { stringifySetCookie } from 'cookie'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

export const SESSION_COOKIE_NAME = '__session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

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
  return stringifySetCookie({
    expires: expiresAt,
    httpOnly: true,
    name: SESSION_COOKIE_NAME,
    path: '/',
    sameSite: 'lax',
    secure: true,
    value: cookieValue,
  })
}

export const cookieValueSchema = Compile(
  Type.Object({
    rawToken: Type.String({ maxLength: 21, minLength: 21 }),
    sessionId: Type.String({ maxLength: 21, minLength: 21 }),
  }),
)
