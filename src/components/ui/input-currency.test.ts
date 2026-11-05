import { describe, expect, it } from 'vitest'

import { fitsMax } from './input-currency'

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
