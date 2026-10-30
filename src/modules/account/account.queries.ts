import { queryOptions } from '@tanstack/react-query'

import { useSuspenseQueryDeferred } from '#/hooks/use-suspense-query-deferred'

import { getCurrentUser, getWelcome } from './account.functions'

export function currentUserQuery() {
  return queryOptions({ queryFn: () => getCurrentUser(), queryKey: ['auth-user'] })
}

export function useAuthUser() {
  const { data } = useSuspenseQueryDeferred(currentUserQuery())

  if (data.type !== 'SUCCESS') {
    throw new Error('useAuthUser must be used within a protected route')
  }

  return data.value
}

export function useOptionalAuthUser() {
  const { data } = useSuspenseQueryDeferred(currentUserQuery())
  const authUser = data.type === 'SUCCESS' ? data.value : undefined

  return authUser
}

export function welcomeQuery() {
  return queryOptions({ queryFn: () => getWelcome(), queryKey: ['welcome'] })
}
