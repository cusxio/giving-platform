import { useMutation } from '@tanstack/react-query'

import type { StartContributionInput } from './giving.start-contribution.procedure'
import { startContribution } from './giving.start-contribution.procedure'

export function useStartContributionMutation() {
  return useMutation({
    mutationFn: (input: StartContributionInput) =>
      startContribution({ data: input }),
  })
}

export type { StartContributionResponse } from './giving.start-contribution.procedure'
