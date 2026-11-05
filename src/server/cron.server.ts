import { constantTimeEqual } from '#/server/crypto.server'

export function isCronRequest(secret: string | undefined, authorization: null | string): boolean {
  return (
    secret !== undefined &&
    secret !== '' &&
    constantTimeEqual(authorization ?? '', `Bearer ${secret}`)
  )
}
