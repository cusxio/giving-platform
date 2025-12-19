import { createFileRoute, redirect } from '@tanstack/react-router'
import * as v from 'valibot'

import { config } from '#/core/brand'
import { clientTz, now } from '#/core/date'
import { useAuthUser } from '#/features/session/session.queries'
import { useSuspenseQueryDeferred } from '#/hooks'
import { cx } from '#/styles/cx'

import { BibleVerse } from './-components/bible-verse'
import { GreetUser } from './-components/greet-user'
import { OverviewCharts } from './-components/overview-charts'
import { OverviewEmpty } from './-components/overview-empty'
import { OverviewTransactions } from './-components/overview-transactions'
import { OverviewWelcome } from './-components/overview-welcome'
import {
  hasMultipleYears,
  OverviewYearSelector,
} from './-components/overview-year-selector'
import {
  createAvailableTransactionYearsQuery,
  createOverviewQueryOptions,
} from './-overview.queries'

const searchSchema = v.object({
  year: v.optional(v.union([v.number(), v.literal('all')])),
})

export const Route = createFileRoute('/(app)/overview')({
  validateSearch(search) {
    const parseResult = v.safeParse(searchSchema, search)

    if (!parseResult.success) {
      return { year: undefined }
    }

    return { year: parseResult.output.year }
  },

  async beforeLoad({ search, context }) {
    const { user, queryClient } = context
    const { id: userId, journey } = user

    const currentCalendarYear = now(clientTz).getFullYear()

    const dataYears = await queryClient.ensureQueryData(
      createAvailableTransactionYearsQuery(userId, journey),
    )

    const availableYears: ('all' | number)[] = [
      ...new Set([currentCalendarYear, ...dataYears]),
    ].sort((a, b) => b - a)

    const requestedYear = search.year
    const effectiveYear = requestedYear ?? currentCalendarYear

    if (dataYears.length > 1) {
      availableYears.unshift('all')
    }

    if (
      !availableYears.includes(effectiveYear) ||
      requestedYear === currentCalendarYear
    ) {
      throw redirect({
        to: '/overview',
        search: { year: undefined },
        replace: true,
      })
    }

    return {
      year: effectiveYear,
      years: availableYears,
      hasZeroTransactions: dataYears.length === 0,
    }
  },

  async loader({ context }) {
    const {
      user: { id: userId, journey },
      year,
      queryClient,
    } = context

    await queryClient.ensureQueryData(
      createOverviewQueryOptions(userId, journey, year),
    )
  },

  component: RouteComponent,

  head: () => ({ meta: [{ title: `Overview · ${config.entity}` }] }),
})

function RouteComponent() {
  const { year, years, hasZeroTransactions } = Route.useRouteContext()
  const {
    user,
    userSettings: { privacyMode },
  } = useAuthUser()

  const {
    data: {
      summary,
      monthlyContributions,
      monthlyContributionsFrequency,
      cumulativeContributions,
      transactions,
    },
  } = useSuspenseQueryDeferred(
    createOverviewQueryOptions(user.id, user.journey, year),
  )

  const showYearSelector = hasMultipleYears(years)

  if (hasZeroTransactions) {
    return (
      <div
        className={cx(
          'flex shrink-0 grow flex-col items-center justify-center',
          'mx-auto w-full max-w-xl',
          'gap-y-4 p-4',
        )}
      >
        <OverviewWelcome user={user} />
      </div>
    )
  }

  return (
    <div
      className={cx(
        'srhink-0 mx-auto w-full grow p-4',
        'max-w-120 bp-overview-2col:max-w-5xl',
      )}
    >
      <GreetUser user={user} />

      <div
        className={cx(
          'flex flex-col',
          'gap-y-4 lg:gap-y-8',
          !showYearSelector && 'mt-4',
        )}
      >
        {showYearSelector && <OverviewYearSelector year={year} years={years} />}

        {transactions.length > 0 ? (
          <>
            <BibleVerse />
            <OverviewCharts
              cumulativeContributions={cumulativeContributions}
              monthlyContributions={monthlyContributions}
              monthlyContributionsFrequency={monthlyContributionsFrequency}
              privacyMode={privacyMode}
              summary={summary}
            />
          </>
        ) : (
          typeof year === 'number' && <OverviewEmpty year={year} />
        )}
      </div>

      {transactions.length > 0 && (
        <OverviewTransactions
          privacyMode={privacyMode}
          transactions={transactions}
          year={year}
        />
      )}
    </div>
  )
}
