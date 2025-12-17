import type {
  DefaultError,
  QueryKey,
  UseSuspenseQueryOptions,
} from '@tanstack/react-query'
// https://www.teemutaskula.com/blog/exploring-query-suspense
import { useSuspenseQuery } from '@tanstack/react-query'
import { useDeferredValue } from 'react'
import { useDeepCompareMemo } from 'use-deep-compare'

export function useSuspenseQueryDeferred<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>) {
  const queryKey = useDeepCompareMemo(
    () => options.queryKey,
    [options.queryKey],
  )

  const deferredQueryKey = useDeferredValue(queryKey)

  const _query = useSuspenseQuery({ ...options, queryKey: deferredQueryKey })

  // Extend the query type to include the custom `isSuspending` flag
  const query = _query as typeof _query & { isSuspending: boolean }

  query.isSuspending = queryKey !== deferredQueryKey

  return query
}
