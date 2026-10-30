import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { monthLabel } from './formatters'

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

describe('month label', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(['2026-10-31T04:00:00Z', '2026-01-29T04:00:00Z', '2026-03-31T04:00:00Z'])(
    'labels every month correctly when today is %s',
    (today) => {
      expect.hasAssertions()

      vi.setSystemTime(new Date(today))

      expect(Array.from({ length: 12 }, (_, i) => monthLabel(i + 1, 'short'))).toStrictEqual(SHORT)
      expect(Array.from({ length: 12 }, (_, i) => monthLabel(i + 1, 'long'))).toStrictEqual(LONG)
    },
  )
})
