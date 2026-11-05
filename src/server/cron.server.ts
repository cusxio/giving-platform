import { constantTimeEqual } from '#/server/crypto.server'

/** True when `authorization` is `Bearer <secret>`. An unset or empty secret refuses every call. */
export function isCronRequest(secret: string | undefined, authorization: null | string): boolean {
  return (
    secret !== undefined &&
    secret !== '' &&
    constantTimeEqual(authorization ?? '', `Bearer ${secret}`)
  )
}
