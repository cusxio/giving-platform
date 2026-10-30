import { createHmac } from 'node:crypto'

import { SESSION_SECRET } from '#/envvars'

export function hashToken(token: string) {
  return createHmac('sha256', SESSION_SECRET).update(token).digest('hex')
}
