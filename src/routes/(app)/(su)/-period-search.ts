import * as v from 'valibot'

const isoDate = v.pipe(v.string(), v.isoDate())

const dateOf = (value: unknown) => (v.is(isoDate, value) ? value : undefined)

export interface PeriodSearch {
  end: string | undefined
  start: string | undefined
}

/** The router keeps any search key this leaves out, so both keys are named, even when undefined. */
export const periodSearch = (start: unknown, end: unknown): PeriodSearch => ({
  end: dateOf(end),
  start: dateOf(start),
})
