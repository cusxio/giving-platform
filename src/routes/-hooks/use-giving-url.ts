import { useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'

import { funds } from '#/core/brand'
import type { Fund } from '#/core/brand/funds'

import { Route } from '../index'

import type { FundSearch } from './fund-search'
import { linkedGift } from './fund-search'

export function useGivingUrl() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  const gift = useMemo(() => linkedGift(search), [search])

  const setFundsInUrl = useCallback(
    (fundAmounts: Record<Fund, string>) => {
      const params: FundSearch = {}
      for (const fund of funds) {
        const num = Number.parseFloat(fundAmounts[fund])
        if (num > 0) {
          params[fund] = num
        }
      }
      void navigate({ search: params, to: '/' })
    },
    [navigate],
  )

  const clearUrl = useCallback(() => {
    void navigate({ search: {}, to: '/' })
  }, [navigate])

  return { clearUrl, gift, setFundsInUrl }
}
