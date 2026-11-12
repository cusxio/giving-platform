import { describe, expect, it } from 'vitest'

import type { OverviewRows } from './overview'
import { getYearDateRange, giftScopeFor, median, summarizeOverview } from './overview'

const kl = (local: string) => new Date(`${local}+08:00`)

const NOW = kl('2026-03-10T21:00:00')

function gift(local: string, items: Record<string, number>) {
  const transactionId = `T ${local}`
  const giftAmount = Object.values(items).reduce((sum, amount) => sum + amount, 0)
  return Object.entries(items).map(([fundName, amount]) => ({
    amount,
    createdAt: kl(local),
    fundName,
    giftAmount,
    transactionId,
  }))
}

type Status = 'cancelled' | 'failed' | 'pending' | 'success'

function newest(local: string, status: Status, funds: Record<string, number>[] = []) {
  const rows = funds.length > 0 ? funds : [{ Tithe: 15_000 }, { Mission: 5000 }]
  return rows.flatMap((items) =>
    Object.entries(items).map(([fundName, amount]) => ({
      amount,
      createdAt: kl(local),
      fundName,
      giftAmount: 20_000,
      status,
    })),
  )
}

function yearHeroOf(overview: ReturnType<typeof summarizeOverview>) {
  if (overview.hero.kind !== 'year') {
    throw new Error('expected the year hero')
  }
  return overview.hero
}

const empty: OverviewRows = {
  cards: [],
  giftItems: [],
  newestAny: [],
  newestSuccess: [],
  recent: [],
}
const rows = (overrides: Partial<OverviewRows>): OverviewRows => ({ ...empty, ...overrides })

const card = (cardExp: string) => ({ cardExp, cardNoMask: '411111******4242', cardType: 'VISA' })

describe('the year hero', () => {
  const giftItems = [
    ...gift('2025-01-05T10:00:00', { Tithe: 10_000 }),
    ...gift('2025-03-10T23:30:00', { Tithe: 2000 }),
    ...gift('2025-03-11T00:30:00', { Tithe: 4000 }),
    ...gift('2025-12-31T23:59:00', { Offering: 1000 }),
    ...gift('2026-01-01T23:59:00', { Tithe: 30_000 }),
    ...gift('2026-03-10T08:00:00', { Mission: 5050 }),
  ]

  it("compares this year so far with last year's total by the same date", () => {
    expect.hasAssertions()

    const { hero } = summarizeOverview(2026, rows({ giftItems }), NOW)

    expect(hero).toMatchObject({
      kind: 'year',
      lastYearSameDay: 120,
      today: 68,
      total: 350.5,
      year: 2026,
    })
  })

  it('runs this year by Kuala Lumpur day, ending today', () => {
    expect.hasAssertions()

    const { thisYear } = yearHeroOf(summarizeOverview(2026, rows({ giftItems }), NOW))

    expect(thisYear).toHaveLength(69)
    expect(thisYear.slice(0, 2)).toStrictEqual([300, 300])
    expect(thisYear.slice(-2)).toStrictEqual([300, 350.5])
  })

  it('runs all of last year by Kuala Lumpur day', () => {
    expect.hasAssertions()

    const { lastYear } = yearHeroOf(summarizeOverview(2026, rows({ giftItems }), NOW))

    expect(lastYear).toHaveLength(365)
    expect(lastYear?.slice(67, 70)).toStrictEqual([100, 120, 160])
    expect(lastYear?.at(-1)).toBe(170)
  })

  it('compares a past year whole, with no today', () => {
    expect.hasAssertions()

    const hero = yearHeroOf(summarizeOverview(2025, rows({ giftItems }), NOW))

    expect(hero).toMatchObject({ lastYear: null, lastYearSameDay: null, today: null, total: 170 })
    expect(hero.thisYear).toHaveLength(365)
  })

  it('puts last year on the same calendar date, moving 29 February to the 28th', () => {
    expect.hasAssertions()

    const leap = [
      ...gift('2024-02-29T12:00:00', { Tithe: 1000 }),
      ...gift('2025-03-01T12:00:00', { Tithe: 1000 }),
    ]
    const hero = yearHeroOf(summarizeOverview(2025, rows({ giftItems: leap }), NOW))

    expect(hero.lastYear?.slice(57, 60)).toStrictEqual([0, 10, 10])
    expect(hero.lastYearSameDay).toBe(10)
  })

  it('has no comparison when nothing was given last year', () => {
    expect.hasAssertions()

    const { hero } = summarizeOverview(2026, rows({ giftItems: giftItems.slice(4) }), NOW)

    expect(hero).toMatchObject({ lastYear: null, lastYearSameDay: null, total: 350.5 })
  })

  it('reads from the start of last year', () => {
    expect.hasAssertions()

    expect(giftScopeFor('donor', 2026)).toStrictEqual({
      donor: 'donor',
      endExclusive: new Date('2026-12-31T16:00:00Z'),
      start: new Date('2024-12-31T16:00:00Z'),
    })
    expect(giftScopeFor('donor', 'all')).toStrictEqual({
      donor: 'donor',
      endExclusive: undefined,
      start: undefined,
    })
  })
})

describe('the all-years hero', () => {
  it('totals each year from the earliest gift to this year, gaps included', () => {
    expect.hasAssertions()

    const giftItems = [
      ...gift('2025-06-01T10:00:00', { Tithe: 2000, Offering: 500 }),
      ...gift('2023-12-31T23:00:00', { Tithe: 10_000 }),
    ]

    expect(summarizeOverview('all', rows({ giftItems }), NOW).hero).toStrictEqual({
      kind: 'all',
      since: kl('2023-12-31T23:00:00'),
      total: 125,
      years: [
        { total: 100, year: 2023 },
        { total: 0, year: 2024 },
        { total: 25, year: 2025 },
        { total: 0, year: 2026 },
      ],
    })
  })

  it('is empty without gifts', () => {
    expect.hasAssertions()

    expect(summarizeOverview('all', empty, NOW).hero).toStrictEqual({
      kind: 'all',
      since: null,
      total: 0,
      years: [{ total: 0, year: 2026 }],
    })
  })
})

describe('the funds', () => {
  it("sum each fund's amounts in the shown year, largest first", () => {
    expect.hasAssertions()

    const giftItems = [
      ...gift('2025-12-01T10:00:00', { Offering: 99_900 }),
      ...gift('2026-01-04T10:00:00', { Mission: 2500, Tithe: 30_000 }),
      ...gift('2026-02-01T10:00:00', { Mission: 2500, Offering: 5000 }),
      ...gift('2026-02-08T10:00:00', { Tithe: 10_000 }),
    ]

    expect(summarizeOverview(2026, rows({ giftItems }), NOW).funds).toStrictEqual([
      { amount: 400, fundName: 'Tithe', share: 0.8 },
      { amount: 50, fundName: 'Mission', share: 0.1 },
      { amount: 50, fundName: 'Offering', share: 0.1 },
    ])
    expect(summarizeOverview('all', rows({ giftItems }), NOW).funds[0]).toStrictEqual({
      amount: 1049,
      fundName: 'Offering',
      share: 104_900 / 149_900,
    })
  })
})

describe('the rhythm', () => {
  const giftItems = [
    ...gift('2026-01-04T10:00:00', { Tithe: 30_000 }),
    ...gift('2026-01-18T10:00:00', { Offering: 5000 }),
    ...gift('2026-03-01T10:00:00', { Mission: 5000, Tithe: 25_000 }),
    ...gift('2026-03-08T10:00:00', { Offering: 30_000 }),
  ]

  it('counts the months given against the months so far, and leaves the rest open', () => {
    expect.hasAssertions()

    const { rhythm } = summarizeOverview(2026, rows({ giftItems }), NOW)

    expect(rhythm).toMatchObject({ gifts: 4, monthsGiven: 2, monthsSoFar: 3 })
    expect(rhythm?.months.slice(0, 4)).toStrictEqual([
      { month: 1, total: 350 },
      { month: 2, total: 0 },
      { month: 3, total: 600 },
      { month: 4, total: null },
    ])
  })

  it('counts every month of a past year', () => {
    expect.hasAssertions()

    const { rhythm } = summarizeOverview(2025, empty, NOW)

    expect(rhythm).toMatchObject({ gifts: 0, largest: null, monthsGiven: 0, monthsSoFar: 12 })
    expect(rhythm?.months.every((month) => month.total === 0)).toBe(true)
  })

  it('names the first of the largest gifts with its funds', () => {
    expect.hasAssertions()

    expect(summarizeOverview(2026, rows({ giftItems }), NOW).rhythm?.largest).toStrictEqual({
      amount: 300,
      date: kl('2026-01-04T10:00:00'),
      funds: ['Tithe'],
    })
  })

  it('takes the usual gift as the median, so one large gift does not move it', () => {
    expect.hasAssertions()

    expect(summarizeOverview(2026, rows({ giftItems }), NOW).rhythm?.usualGift).toBe(300)
    expect(median([5000, 5000, 100_000])).toBe(5000)
    expect(median([1000, 2001])).toBe(1501)
    expect(median([])).toBe(0)
  })

  it('is absent from the all-years view', () => {
    expect.hasAssertions()

    expect(summarizeOverview('all', rows({ giftItems }), NOW).rhythm).toBeNull()
  })
})

describe('give again', () => {
  it("prefills the give page with the newest success's funds", () => {
    expect.hasAssertions()

    const newestSuccess = newest('2026-03-02T10:00:00', 'success', [
      { Tithe: 15_000 },
      { Mission: 5000 },
      { Mission: 1050 },
    ])

    expect(summarizeOverview(2026, rows({ newestSuccess }), NOW).giveAgain).toStrictEqual({
      amount: 200,
      date: kl('2026-03-02T10:00:00'),
      give: { mission: 60.5, tithe: 150 },
      items: [
        { amount: 150, fundName: 'Tithe' },
        { amount: 50, fundName: 'Mission' },
        { amount: 10.5, fundName: 'Mission' },
      ],
    })
  })

  it('is absent without a gift the give page can take, or outside this year', () => {
    expect.hasAssertions()

    const retired = newest('2025-03-02T10:00:00', 'success', [{ Builder: 5000 }])

    expect(summarizeOverview(2026, empty, NOW).giveAgain).toBeNull()
    expect(summarizeOverview(2026, rows({ newestSuccess: retired }), NOW).giveAgain).toBeNull()
    expect(
      summarizeOverview(
        2025,
        rows({ newestSuccess: newest('2025-03-02T10:00:00', 'success') }),
        NOW,
      ).giveAgain,
    ).toBeNull()
  })
})

describe('the failed gift notice', () => {
  it.each(['failed', 'cancelled'] as const)(
    'offers to retry a %s gift under seven days old',
    (status) => {
      expect.hasAssertions()

      const newestAny = newest('2026-03-04T21:01:00', status)

      expect(summarizeOverview(2026, rows({ newestAny }), NOW).notices.failedGift).toStrictEqual({
        amount: 200,
        date: kl('2026-03-04T21:01:00'),
        give: { mission: 50, tithe: 150 },
        items: [
          { amount: 150, fundName: 'Tithe' },
          { amount: 50, fundName: 'Mission' },
        ],
      })
    },
  )

  it.each([
    ['seven days old', newest('2026-03-03T21:00:00', 'failed')],
    ['followed by a success', newest('2026-03-09T10:00:00', 'success')],
    ['followed by a gift still processing', newest('2026-03-09T10:00:00', 'pending')],
  ])('stays quiet for a gift %s', (_case, newestAny) => {
    expect.hasAssertions()

    expect(summarizeOverview(2026, rows({ newestAny }), NOW).notices.failedGift).toBeNull()
  })

  it('shows only on the current year', () => {
    expect.hasAssertions()

    const newestAny = newest('2026-03-09T10:00:00', 'failed')

    expect(summarizeOverview(2025, rows({ newestAny }), NOW).notices.failedGift).toBeNull()
    expect(summarizeOverview('all', rows({ newestAny }), NOW).notices.failedGift).toBeNull()
  })
})

describe('the expiring card notice', () => {
  it('names the first card that expires this month or next', () => {
    expect.hasAssertions()

    const cards = [card('202605'), card('202604'), card('202603')]

    expect(summarizeOverview(2026, rows({ cards }), NOW).notices.expiringCard).toStrictEqual({
      cardType: 'VISA',
      expires: { month: 4, year: 2026 },
      last4: '4242',
    })
  })

  it('reaches into January from December, by the Kuala Lumpur month', () => {
    expect.hasAssertions()

    const december = kl('2026-12-01T00:30:00')

    expect(
      summarizeOverview(2026, rows({ cards: [card('202701')] }), december).notices.expiringCard,
    ).toMatchObject({ expires: { month: 1, year: 2027 } })
    expect(
      summarizeOverview(2026, rows({ cards: [card('202702')] }), december).notices.expiringCard,
    ).toBeNull()
  })

  it('shows only on the current year', () => {
    expect.hasAssertions()

    expect(
      summarizeOverview(2025, rows({ cards: [card('202603')] }), NOW).notices.expiringCard,
    ).toBeNull()
  })
})

describe('the recent gifts', () => {
  it('carry ringgit and their funds in item order', () => {
    expect.hasAssertions()

    const recent = [
      {
        amount: 35_050,
        createdAt: NOW,
        funds: ['Tithe', 'Mission'],
        id: 'T1',
        status: 'pending' as const,
      },
    ]

    expect(summarizeOverview(2026, rows({ recent }), NOW).recent).toStrictEqual([
      { amount: 350.5, createdAt: NOW, funds: ['Tithe', 'Mission'], id: 'T1', status: 'pending' },
    ])
  })
})

describe('overview year range', () => {
  it('leaves the range open for all years', () => {
    expect.hasAssertions()

    expect(getYearDateRange('all')).toStrictEqual({
      endDateUTCExclusive: undefined,
      startDateUTC: undefined,
    })
  })

  it('spans the Kuala Lumpur calendar year in UTC', () => {
    expect.hasAssertions()

    expect(getYearDateRange(2025)).toStrictEqual({
      endDateUTCExclusive: new Date('2025-12-31T16:00:00Z'),
      startDateUTC: new Date('2024-12-31T16:00:00Z'),
    })
  })
})
