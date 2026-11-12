import { describe, expect, it } from 'vitest'

import { GIFT_BAND_BOUNDS, giftSizes } from './gift-bands'

describe('gift sizes', () => {
  it('hands width_bucket each band after the first by its lower bound in cents', () => {
    expect.hasAssertions()

    expect(GIFT_BAND_BOUNDS).toStrictEqual([5000, 10_000, 20_000, 50_000, 100_000])
  })

  it('lists every band in order, in ringgit, with zeros where nobody gave', () => {
    expect.hasAssertions()

    const sizes = giftSizes(
      [
        { amount: 250_000, bucket: 5, gifts: 2 },
        { amount: 3000, bucket: 0, gifts: 1 },
      ],
      [{ amount: 7500, bucket: 1, gifts: 1 }],
    )

    expect(sizes).toStrictEqual([
      { amount: 30, band: 'under-50', gifts: 1, priorAmount: 0, priorGifts: 0 },
      { amount: 0, band: '50-99', gifts: 0, priorAmount: 75, priorGifts: 1 },
      { amount: 0, band: '100-199', gifts: 0, priorAmount: 0, priorGifts: 0 },
      { amount: 0, band: '200-499', gifts: 0, priorAmount: 0, priorGifts: 0 },
      { amount: 0, band: '500-999', gifts: 0, priorAmount: 0, priorGifts: 0 },
      { amount: 2500, band: '1000-plus', gifts: 2, priorAmount: 0, priorGifts: 0 },
    ])
  })
})
