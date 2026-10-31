import { Result } from 'better-result'

import type { User } from '#/modules/account/server'
import { anyone } from '#/server/authorize.server'
import type { QueryResult } from '#/server/db.server'
import type { Deps } from '#/server/deps.server'
import type { InfraError } from '#/server/infra-error'
import { noInput } from '#/server/input.server'
import { defineRead } from '#/server/procedure.server'

import { unexpiredSavedCards } from './saved-cards.repository.server'

/** A signed-out caller has no saved cards. */
export async function listSavedCards(
  deps: Pick<Deps, 'db'>,
  userId: null | User['id'],
): Promise<Result<QueryResult<typeof unexpiredSavedCards>, InfraError>> {
  return userId === null ? Result.ok([]) : deps.db.run(unexpiredSavedCards(userId))
}

export const getSavedPaymentMethodsAction = defineRead({
  auth: anyone,
  event: 'giving.saved_payment_methods',
  input: noInput,
  run: ({ deps, user }) => listSavedCards(deps, user?.id ?? null),
  wire: {},
})
