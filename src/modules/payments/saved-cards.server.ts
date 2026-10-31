import type { User } from '#/modules/account/server'
import type { Deps } from '#/server/deps.server'
import { legacyDb } from '#/server/legacy-db.server'
import type { RequestContext } from '#/server/request-context.server'

import { unexpiredSavedCards } from './saved-cards.repository.server'

export function listSavedCards(deps: Pick<Deps, 'db'>, userId: User['id']) {
  return legacyDb(deps.db).run(unexpiredSavedCards(userId))
}

/** A signed-out caller has no saved cards. */
export async function getSavedPaymentMethodsProcedure(
  context: Pick<RequestContext, 'deps' | 'user'>,
) {
  const userId = context.user?.id
  if (userId === undefined) {
    return []
  }
  return listSavedCards(context.deps, userId)
}
