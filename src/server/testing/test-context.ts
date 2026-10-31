import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import { testDeps } from './test-deps'

type User = NonNullable<RequestContext['user']>

export const MEMBER: User = { id: 2, journey: 'start_fresh', role: 'user' }
export const SU: User = { id: 1, journey: 'start_fresh', role: 'su' }

/** What the request middleware hands a server function, for an action test. */
export function testContext(user: null | User, deps: Partial<Deps> = {}): RequestContext {
  return { deps: testDeps(deps), session: null, user }
}
