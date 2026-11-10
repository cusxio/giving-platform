import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import { testDeps } from './test-deps'

type User = NonNullable<RequestContext['user']>
type UserSettings = NonNullable<RequestContext['userSettings']>

export const MEMBER: User = {
  createdAt: new Date('2025-01-01T00:00:00Z'),
  email: 'member@give.test',
  emailVerifiedAt: new Date('2025-01-01T00:05:00Z'),
  firstName: 'Mem',
  id: 2,
  journey: 'start_fresh',
  lastName: 'Ber',
  role: 'user',
  status: 'active',
  updatedAt: new Date('2025-01-01T00:05:00Z'),
}
export const SU: User = {
  ...MEMBER,
  email: 'su@give.test',
  firstName: 'Sue',
  id: 1,
  lastName: 'Peruser',
  role: 'su',
}

const SESSION = {
  expiresAt: new Date('2099-01-01'),
  id: 'session'.padEnd(21, '0'),
  tokenHash: 'hash',
}

/** What the request middleware hands a server function, for an action test. */
export function testContext(
  user: null | User,
  deps: Partial<Deps> = {},
  userSettings?: UserSettings,
): RequestContext {
  return user === null
    ? { deps: testDeps(deps), session: null, user, userSettings: null }
    : {
        deps: testDeps(deps),
        session: SESSION,
        user,
        userSettings: userSettings ?? { privacyMode: false, userId: user.id },
      }
}
