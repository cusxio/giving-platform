import { describe, expect, it } from 'vitest'

import { fitsMax, sameAmount } from './input-currency'

describe('the amount field limits', () => {
  it('takes every amount up to the maximum with its cents', () => {
    expect.hasAssertions()

    expect(
      ['5000000', '5000000.00', '4999999.99', '123456.78'].map((v) => fitsMax(v, 5_000_000)),
    ).toStrictEqual([true, true, true, true])
  })

  it('refuses a typed or pasted amount past the maximum', () => {
    expect.hasAssertions()

    expect(
      ['5000000.01', '9999999', '50000000', '10000000.00'].map((v) => fitsMax(v, 5_000_000)),
    ).toStrictEqual([false, false, false, false])
  })

  it('reads the field text as the field shows it', () => {
    expect.hasAssertions()

    expect(
      ['5,000,000', 'RM 5,000,000.00', '1,234.5', '5,000,0001', 'RM 10,000,000.00'].map((v) =>
        fitsMax(v, 5_000_000),
      ),
    ).toStrictEqual([true, true, true, false, false])
  })

  it('accepts a cleared or half-typed field', () => {
    expect.hasAssertions()

    expect([undefined, '', '.', '0.'].map((v) => fitsMax(v, 5_000_000))).toStrictEqual([
      true,
      true,
      true,
      true,
    ])
  })
})

describe('the amount comparison', () => {
  it('matches an amount written two ways', () => {
    expect.hasAssertions()

    expect(
      (
        [
          ['0100', '100'],
          ['1.', '1'],
          ['12.50', '12.5'],
          ['', ''],
        ] as const
      ).map(([a, b]) => sameAmount(a, b)),
    ).toStrictEqual([true, true, true, true])
  })

  it('tells different amounts apart', () => {
    expect.hasAssertions()

    expect(
      (
        [
          ['100', '10'],
          ['', '0'],
          ['.', ''],
        ] as const
      ).map(([a, b]) => sameAmount(a, b)),
    ).toStrictEqual([false, false, false])
  })
})
