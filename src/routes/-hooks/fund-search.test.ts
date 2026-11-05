import { defaultParseSearch } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { linkedGift, opensOnDetails, parseFundSearch } from './fund-search'

const giftFrom = (query: string) => linkedGift(parseFundSearch(defaultParseSearch(query)))

describe('a giving link', () => {
  it('fills in each amount the link names', () => {
    expect.hasAssertions()

    const gift = giftFrom('?tithe=50&offering=12.5&mission=0100&future=%2220%22')

    expect(gift).toStrictEqual({
      amounts: { future: '20', mission: '100', offering: '12.5', tithe: '50' },
      overMax: [],
    })
    expect(opensOnDetails(gift)).toBe(true)
  })

  it('takes an amount up to the maximum and flags one past it', () => {
    expect.hasAssertions()

    const gift = giftFrom('?tithe=99999999&offering=5000000')

    expect(gift).toStrictEqual({ amounts: { offering: '5000000' }, overMax: ['tithe'] })
    expect(opensOnDetails(gift)).toBe(false)
  })

  it('leaves out a param that is not an amount', () => {
    expect.hasAssertions()

    expect(
      [
        '-5',
        'abc',
        '50.555',
        'Infinity',
        'NaN',
        'true',
        '[50]',
        '',
        '1e400',
        '%2250.%22',
        '%22%2050%22',
      ].map((tithe) => giftFrom(`?tithe=${tithe}`)),
    ).toStrictEqual(Array.from({ length: 11 }, () => ({ amounts: {}, overMax: [] })))
  })

  it('keeps the good amounts beside a bad one', () => {
    expect.hasAssertions()

    expect(giftFrom('?tithe=50&offering=-5')).toStrictEqual({
      amounts: { tithe: '50' },
      overMax: [],
    })
  })

  it('opens on the amounts when the link names no amount', () => {
    expect.hasAssertions()

    expect([giftFrom(''), giftFrom('?tithe=0')].map((gift) => opensOnDetails(gift))).toStrictEqual([
      false,
      false,
    ])
  })

  it('names every fund so no raw param survives', () => {
    expect.hasAssertions()

    expect(parseFundSearch({ tithe: 'abc' })).toStrictEqual({
      future: undefined,
      mission: undefined,
      offering: undefined,
      tithe: undefined,
    })
  })
})
