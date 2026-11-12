import { centsToRinggit } from '#/core/money'

const GIFT_BANDS = [
  { band: 'under-50', from: 0 },
  { band: '50-99', from: 5000 },
  { band: '100-199', from: 10_000 },
  { band: '200-499', from: 20_000 },
  { band: '500-999', from: 50_000 },
  { band: '1000-plus', from: 100_000 },
] as const

export type GiftBand = (typeof GIFT_BANDS)[number]['band']

/** The bounds Postgres's `width_bucket` takes: bucket 0 is below the first, bucket i from the i-th. */
export const GIFT_BAND_BOUNDS: readonly number[] = GIFT_BANDS.slice(1).map((band) => band.from)

interface BucketRow {
  readonly amount: number
  readonly bucket: number
  readonly gifts: number
}

export function giftSizes(period: readonly BucketRow[], compare: readonly BucketRow[]) {
  return GIFT_BANDS.map(({ band }, bucket) => {
    const now = period.find((row) => row.bucket === bucket)
    const before = compare.find((row) => row.bucket === bucket)
    return {
      amount: centsToRinggit(now?.amount ?? 0),
      band,
      gifts: now?.gifts ?? 0,
      priorAmount: centsToRinggit(before?.amount ?? 0),
      priorGifts: before?.gifts ?? 0,
    }
  })
}
