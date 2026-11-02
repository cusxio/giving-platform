import { describe, expect, expectTypeOf, it } from 'vitest'

import type { Reachable, TransactionStatus } from './transaction-status'
import {
  COUNTED_STATUS,
  LISTED_STATUSES,
  TRANSACTION_STATUSES,
  TRANSITIONS,
  canMove,
  sourcesOf,
} from './transaction-status'

const REACHABLE = new Set<TransactionStatus>(['success', 'failed'])

const isReachable = (status: TransactionStatus): status is Reachable => REACHABLE.has(status)

/** Whether the inverse table, read through sourcesOf, lists `from` as a source of `to`. */
const inverseLists = (from: TransactionStatus, to: TransactionStatus) =>
  isReachable(to) && sourcesOf(to).includes(from)

const pairs = TRANSACTION_STATUSES.flatMap((from) =>
  TRANSACTION_STATUSES.map((to) => [from, to] as const),
)

describe('the transaction status machine', () => {
  it.each(pairs)('agrees with its inverse for %s -> %s', (from, to) => {
    expect.hasAssertions()

    const listed = (TRANSITIONS[from] as readonly TransactionStatus[]).includes(to)

    expect(canMove(from, to)).toBe(listed)
    expect(inverseLists(from, to)).toBe(listed)
  })

  it('moves only out of pending, and never back into it', () => {
    expect.hasAssertions()

    expect(sourcesOf('success')).toStrictEqual(['pending'])
    expect(sourcesOf('failed')).toStrictEqual(['pending'])
    expect(TRANSACTION_STATUSES.filter((from) => canMove(from, 'pending'))).toStrictEqual([])
    expectTypeOf<Reachable>().toEqualTypeOf<'failed' | 'success'>()
  })

  it('refuses pending as a target at compile time', () => {
    expect.hasAssertions()

    // @ts-expect-error nothing moves a row back to pending
    expect(() => sourcesOf('pending')).toThrow('no status moves to pending')
  })

  it('lists success and failed in history and counts only success', () => {
    expect.hasAssertions()

    expect(LISTED_STATUSES).toStrictEqual(['success', 'failed'])
    expect(COUNTED_STATUS).toBe('success')
  })
})
