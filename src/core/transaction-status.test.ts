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

const REACHABLE = new Set<TransactionStatus>(['success', 'failed', 'held', 'cancelled'])

const isReachable = (status: TransactionStatus): status is Reachable => REACHABLE.has(status)

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

  it('moves out of pending, lets a success correct failed or cancelled, and never returns to pending', () => {
    expect.hasAssertions()

    expect(sourcesOf('success')).toStrictEqual(['pending', 'failed', 'cancelled'])
    expect(sourcesOf('failed')).toStrictEqual(['pending'])
    expect(sourcesOf('cancelled')).toStrictEqual(['pending'])
    expect(sourcesOf('held')).toStrictEqual(['pending', 'failed', 'cancelled'])
    expect(TRANSACTION_STATUSES.filter((from) => canMove(from, 'pending'))).toStrictEqual([])
    expectTypeOf<Reachable>().toEqualTypeOf<'cancelled' | 'failed' | 'held' | 'success'>()
  })

  it.each(['failed', 'cancelled'] as const)(
    'moves %s only to success or held, never to the other unpaid status',
    (from) => {
      expect.hasAssertions()

      expect(TRANSACTION_STATUSES.filter((to) => canMove(from, to))).toStrictEqual([
        'success',
        'held',
      ])
    },
  )

  it.each(['success', 'held'] as const)('moves nothing out of %s', (from) => {
    expect.hasAssertions()

    expect(TRANSACTION_STATUSES.filter((to) => canMove(from, to))).toStrictEqual([])
  })

  it('refuses pending as a target at compile time', () => {
    expect.hasAssertions()

    // @ts-expect-error nothing moves a row back to pending
    expect(sourcesOf('pending')).toStrictEqual([])
  })

  it('lists success, failed and cancelled in history, not pending or held, and counts only success', () => {
    expect.hasAssertions()

    expect(LISTED_STATUSES).toStrictEqual(['success', 'failed', 'cancelled'])
    expect(COUNTED_STATUS).toBe('success')
  })
})
