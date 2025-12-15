import { queryOptions } from '@tanstack/react-query'

import { useSuspenseQueryDeferred } from '#/hooks'

import { getUser } from '../auth/auth.get-user.procedure'

export function createUserQueryOptions() {
  return queryOptions({ queryKey: ['auth-user'], queryFn: () => getUser() })
}

export function useAuthUser() {
  const { data } = useSuspenseQueryDeferred(createUserQueryOptions())

  if (data.type !== 'SUCCESS') {
    throw new Error('useAuthUser must be used within a protected route')
  }

  return data.value
}
