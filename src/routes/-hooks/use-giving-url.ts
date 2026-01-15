import { useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'

import { funds } from '#/core/brand'
import { Fund } from '#/core/brand/funds'

import { Route } from '../index'

export function useGivingUrl() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  const initialFunds = useMemo(() => {
    const result: Partial<Record<Fund, string>> = {}
    for (const fund of funds) {
      const val = search[fund]
      if (val !== undefined && val > 0) {
        result[fund] = String(val)
      }
    }
    return result
  }, [search])

  const hasFundParams = Object.keys(initialFunds).length > 0

  const setFundsInUrl = useCallback(
    (fundAmounts: Record<Fund, string>) => {
      const params: Partial<Record<Fund, number>> = {}
      for (const fund of funds) {
        const num = Number.parseFloat(fundAmounts[fund])
        if (num > 0) params[fund] = num
      }
      void navigate({ to: '/', search: params })
    },
    [navigate],
  )

  const clearUrl = useCallback(() => {
    void navigate({ to: '/', search: {} })
  }, [navigate])

  return { initialFunds, hasFundParams, setFundsInUrl, clearUrl }
}
