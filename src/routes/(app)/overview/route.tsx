import { createFileRoute, redirect } from '@tanstack/react-router'
import * as v from 'valibot'

import { config } from '#/core/brand'
import { clientTz, now } from '#/core/date'
import { useSuspenseQueryDeferred } from '#/hooks/use-suspense-query-deferred'
import { useAuthUser } from '#/modules/account'
import { availableYearsQuery, overviewQuery } from '#/modules/history'
import { cx } from '#/styles/cx'

import { BibleVerse } from './-components/bible-verse'
import { GreetUser } from './-components/greet-user'
import { OverviewCharts } from './-components/overview-charts'
import { OverviewEmpty } from './-components/overview-empty'
import { OverviewTransactions } from './-components/overview-transactions'
import { OverviewWelcome } from './-components/overview-welcome'
import { OverviewYearSelector, hasMultipleYears } from './-components/overview-year-selector'

// A year outside these bounds is read as no year, so it never reaches the server.
const year = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(2000),
  v.check((value) => value <= now(clientTz).getFullYear() + 1),
)
const searchSchema = v.object({ year: v.optional(v.union([year, v.literal('all')])) })

export const Route = createFileRoute('/(app)/overview')({
  validateSearch(search): v.InferOutput<typeof searchSchema> {
    const parseResult = v.safeParse(searchSchema, search)

    if (!parseResult.success) {
      return { year: undefined }
    }

    return { year: parseResult.output.year }
  },

  loaderDeps: ({ search }) => ({ year: search.year }),

  component: RouteComponent,

  head: () => ({ meta: [{ title: `Overview · ${config.entity}` }] }),

  async loader({ context, deps }) {
    const { user, queryClient } = context
    const { id: userId, journey } = user

    const currentCalendarYear = now(clientTz).getFullYear()
    const requestedYear = deps.year
    const effectiveYear = requestedYear ?? currentCalendarYear

    const overview = queryClient.query({
      ...overviewQuery(userId, journey, effectiveYear),
      staleTime: 'static',
    })
    // A year the redirect below refuses may fail its read, and nothing awaits that failure.
    overview.catch(() => {})

    const dataYears = await queryClient.query({
      ...availableYearsQuery(userId, journey),
      staleTime: 'static',
    })

    const sortedYears = [...new Set([currentCalendarYear, ...dataYears])]
    sortedYears.sort((a, b) => b - a)

    const availableYears: ('all' | number)[] =
      dataYears.length > 1 ? ['all', ...sortedYears] : sortedYears

    if (!availableYears.includes(effectiveYear) || requestedYear === currentCalendarYear) {
      throw redirect({ replace: true, search: { year: undefined }, to: '/overview' })
    }

    await overview

    return {
      hasZeroTransactions: dataYears.length === 0,
      year: effectiveYear,
      years: availableYears,
    }
  },
})

function RouteComponent() {
  const { year, years, hasZeroTransactions } = Route.useLoaderData()
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
  } = useSuspenseQueryDeferred(overviewQuery(user.id, user.journey, year))

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
    <div className={cx('mx-auto w-full shrink-0 grow p-4', 'max-w-120 bp-overview-2col:max-w-5xl')}>
      <GreetUser user={user} />

      <div className={cx('flex flex-col', 'gap-y-4 lg:gap-y-8', !showYearSelector && 'mt-4')}>
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
        <OverviewTransactions privacyMode={privacyMode} transactions={transactions} year={year} />
      )}
    </div>
  )
}
