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
import { heroCharts } from './-components/load-hero-charts'
import { OverviewEmpty } from './-components/overview-empty'
import { OverviewFunds } from './-components/overview-funds'
import { OverviewGiveAgain } from './-components/overview-give-again'
import { OverviewHero } from './-components/overview-hero'
import { OverviewNotices } from './-components/overview-notices'
import { OverviewRecent } from './-components/overview-recent'
import { OverviewRhythm } from './-components/overview-rhythm'
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

    const ready = Promise.all([
      queryClient.query({ ...overviewQuery(userId, journey, effectiveYear), staleTime: 'static' }),
      heroCharts.load(),
    ])
    ready.catch(() => {})

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

    await ready

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
    data: { funds, giveAgain, hero, notices, recent, rhythm },
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
    <div className="mx-auto w-full max-w-5xl shrink-0 grow p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <GreetUser user={user} />
        {showYearSelector && <OverviewYearSelector year={year} years={years} />}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <OverviewNotices notices={notices} privacyMode={privacyMode} />

        {recent.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-4">
              <OverviewHero className="flex-[999_1_34rem]" hero={hero} privacyMode={privacyMode} />
              <OverviewFunds className="flex-[1_1_18rem]" funds={funds} privacyMode={privacyMode} />
            </div>

            {(rhythm !== null || giveAgain !== null) && (
              <div className="flex flex-wrap gap-4">
                {rhythm && typeof year === 'number' && (
                  <OverviewRhythm
                    className="flex-[1_1_18rem]"
                    isCurrentYear={hero.kind === 'year' && hero.today !== null}
                    privacyMode={privacyMode}
                    rhythm={rhythm}
                    year={year}
                  />
                )}
                {giveAgain && (
                  <OverviewGiveAgain
                    className="flex-[1_1_18rem]"
                    gift={giveAgain}
                    privacyMode={privacyMode}
                  />
                )}
              </div>
            )}

            <BibleVerse />
            <OverviewRecent privacyMode={privacyMode} recent={recent} />
          </>
        ) : (
          typeof year === 'number' && <OverviewEmpty year={year} />
        )}
      </div>
    </div>
  )
}
