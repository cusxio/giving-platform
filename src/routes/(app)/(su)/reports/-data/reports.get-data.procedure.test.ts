import { describe, expect, it, vi } from 'vitest'

import type * as Envvars from '#/server/env.server'

import { normalizeDateRangeToServerTimezone } from './reports.helpers'

vi.mock<typeof Envvars>(import('#/server/env.server'), () => ({
  DATABASE_URL: 'postgres://user:pass@db.give.test/db',
}))

const { toReportRows } = await import('./reports.get-data.procedure')

describe('report rows', () => {
  it('converts each fund total to ringgit and keeps the query order', () => {
    expect.hasAssertions()

    expect(
      toReportRows([
        { createdAs: 'user', fundName: 'Missions', totalAmount: 12_345 },
        { createdAs: 'user', fundName: 'Tithe', totalAmount: 50_000 },
        { createdAs: 'guest', fundName: 'Building', totalAmount: 1 },
      ]),
    ).toStrictEqual([
      { createdAs: 'user', fundName: 'Missions', totalAmount: 123.45 },
      { createdAs: 'user', fundName: 'Tithe', totalAmount: 500 },
      { createdAs: 'guest', fundName: 'Building', totalAmount: 0.01 },
    ])
  })
})

describe('report date range', () => {
  it('turns Kuala Lumpur calendar days into a UTC range that ends after the last day', () => {
    expect.hasAssertions()

    expect(normalizeDateRangeToServerTimezone('2025-03-01', '2025-03-31')).toStrictEqual({
      endDate: new Date('2025-03-31T16:00:00Z'),
      startDate: new Date('2025-02-28T16:00:00Z'),
    })
  })

  it('leaves missing bounds undefined', () => {
    expect.hasAssertions()

    expect(normalizeDateRangeToServerTimezone()).toStrictEqual({
      endDate: undefined,
      startDate: undefined,
    })
  })
})
